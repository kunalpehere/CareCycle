import { readFileSync } from "node:fs";
import { isIP } from "node:net";
import path from "node:path";
import dotenv from "dotenv";
import { ConnectionString } from "mongodb-connection-string-url";
import { renderOrigin } from "./renderPlatform.js";

export class ConfigurationError extends Error {
    constructor(problems) {
        super(`Invalid CareCycle configuration:\n${problems.map(problem => `- ${problem}`).join("\n")}`);
        this.name = "ConfigurationError";
        this.problems = Object.freeze([...problems]);
    }
}

const loopback = host => {
    const normalized = host.toLowerCase().replace(/^\[|\]$/g, "");
    return normalized === "localhost" || normalized === "::1" || /^127\.\d+\.\d+\.\d+$/.test(normalized);
};
const bareEmail = value => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);

// No connection, DNS lookup, certificate file read, or input value in errors.
export const parseRuntimeEnvironment = source => {
    const problems = [];
    const text = name => typeof source[name] === "string" ? source[name].trim() : "";
    const nodeEnv = text("NODE_ENV") || (source.NODE_ENV === undefined ? "development" : "");
    if (!["development", "test", "production"].includes(nodeEnv)) problems.push("NODE_ENV must be development, test, or production.");
    const isProduction = nodeEnv === "production";
    const portText = source.PORT === undefined ? "4000" : text("PORT");
    const port = Number(portText);
    if (!/^\d+$/.test(portText) || !Number.isInteger(port) || port < 1 || port > 65535) problems.push("PORT must be an integer from 1 to 65535.");

    const secrets = {};
    for (const name of ["JWT_SECRET", "SESSION_SECRET"]) {
        const value = source[name];
        if (typeof value !== "string" || value.length < 32 || /\s/.test(value) || /^(.)\1+$/u.test(value) || /replace|change[-_ ]?me|placeholder|^your[-_ ]|example[-_ ]?secret/i.test(value)) {
            problems.push(`${name} must be a non-placeholder secret of at least 32 characters without whitespace. Generate a random value.`);
        }
        secrets[name] = value;
    }
    if (secrets.JWT_SECRET && secrets.JWT_SECRET === secrets.SESSION_SECRET) problems.push("JWT_SECRET and SESSION_SECRET must be different.");

    const mongoUri = text("MONGO_URI");
    let connectionString;
    const mongoOptions = new Map();
    try {
        connectionString = new ConnectionString(mongoUri);
        if (connectionString.hash || connectionString.search.includes(";")) throw new Error();
        for (const host of connectionString.hosts) {
            const parsed = new URL(`http://${host}`);
            if (!parsed.hostname || parsed.username || parsed.password || parsed.pathname !== "/" || host.endsWith(":")) throw new Error();
        }
        for (const [name, value] of connectionString.searchParams) {
            const key = name.toLowerCase();
            const guarded = ["tls", "ssl", "tlsinsecure", "tlsallowinvalidcertificates", "tlsallowinvalidhostnames", "tlsdisablecertificaterevocationcheck", "tlsdisableocspendpointcheck", "tlscertificatekeyfile", "directconnection", "replicaset", "readpreference", "w", "authmechanism"];
            if (guarded.includes(key) && mongoOptions.has(key)) throw new Error();
            mongoOptions.set(key, value);
        }
        for (const key of ["tls", "ssl", "tlsinsecure", "tlsallowinvalidcertificates", "tlsallowinvalidhostnames", "tlsdisablecertificaterevocationcheck", "tlsdisableocspendpointcheck", "directconnection"]) {
            if (mongoOptions.has(key) && !["true", "false"].includes(mongoOptions.get(key))) throw new Error();
        }
        if (mongoOptions.has("tls") && mongoOptions.has("ssl") && mongoOptions.get("tls") !== mongoOptions.get("ssl")) throw new Error();
    } catch {
        connectionString = undefined;
        problems.push("MONGO_URI must be a valid MongoDB URI with valid hosts/ports, unambiguous security options, and ampersand-separated options.");
    }
    const mongoDbName = source.MONGO_DB_NAME === undefined ? "CareCycle" : text("MONGO_DB_NAME");
    if (!mongoDbName || Buffer.byteLength(mongoDbName) >= 64 || /[\s\/\\.\"$*<>:|?\x00]/.test(mongoDbName)) problems.push("MONGO_DB_NAME must be a nonempty database name under 64 bytes without whitespace or reserved characters.");
    if (isProduction && source.MONGO_DB_NAME === undefined) problems.push("MONGO_DB_NAME must be explicitly set in production.");
    const flag = text("MONGO_REQUIRE_REPLICA_SET");
    if (source.MONGO_REQUIRE_REPLICA_SET !== undefined && !["true", "false"].includes(flag)) problems.push("MONGO_REQUIRE_REPLICA_SET must be true or false.");
    const mongoRequireReplicaSet = source.MONGO_REQUIRE_REPLICA_SET === undefined ? isProduction : flag === "true";
    if (isProduction && !mongoRequireReplicaSet) problems.push("MONGO_REQUIRE_REPLICA_SET must be true in production.");
    if (mongoRequireReplicaSet && mongoOptions.has("readpreference") && mongoOptions.get("readpreference") !== "primary") problems.push("MONGO_URI must use primary read preference when replica-set validation is required.");

    let appUrl;
    try {
        const rawUrl = source.APP_URL === undefined ? (isProduction && source.RENDER === "true" ? renderOrigin(source) : !isProduction ? `http://localhost:${port}` : "") : text("APP_URL");
        const parsed = new URL(rawUrl);
        if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") throw new Error();
        if (isProduction && (parsed.protocol !== "https:" || loopback(parsed.hostname) || ["0.0.0.0", "[::]"].includes(parsed.hostname))) throw new Error();
        if (nodeEnv === "test" && !loopback(parsed.hostname)) throw new Error();
        appUrl = parsed.origin;
    } catch {
        problems.push("APP_URL must be an HTTP(S) origin without credentials, path, query, or fragment; production requires explicit HTTPS without a loopback host, and tests require loopback.");
    }

    const proxyText = text("TRUST_PROXY");
    let trustProxy = false;
    if (proxyText && proxyText !== "false") {
        const entries = proxyText.split(",").map(entry => entry.trim());
        if (entries.some(entry => {
            const [address, bits, extra] = entry.split("/");
            const family = isIP(address);
            return !family || extra !== undefined || (bits !== undefined && (!/^\d+$/.test(bits) || Number(bits) < 1 || Number(bits) > (family === 4 ? 32 : 128)));
        })) problems.push("TRUST_PROXY must contain explicit proxy IP addresses or CIDRs with a nonzero prefix, not booleans, hop counts, or hostnames.");
        else trustProxy = Object.freeze(entries);
    }
    if (isProduction && trustProxy === false) problems.push("TRUST_PROXY must identify the trusted TLS-terminating proxy addresses in production.");

    if (connectionString && isProduction) {
        const tlsEnabled = mongoOptions.get("tls") === "true" || mongoOptions.get("ssl") === "true" || (connectionString.isSRV && ![mongoOptions.get("tls"), mongoOptions.get("ssl")].includes("false"));
        if (!tlsEnabled) problems.push("MONGO_URI must enable TLS in production.");
        if (["tlsinsecure", "tlsallowinvalidcertificates", "tlsallowinvalidhostnames", "tlsdisablecertificaterevocationcheck", "tlsdisableocspendpointcheck"].some(key => mongoOptions.get(key) === "true")) problems.push("MONGO_URI must not disable TLS certificate validation in production.");
        const passwordAuth = Boolean(connectionString.username && connectionString.password);
        const certificateAuth = mongoOptions.get("authmechanism") === "MONGODB-X509" && Boolean(mongoOptions.get("tlscertificatekeyfile"));
        if (!passwordAuth && !certificateAuth) problems.push("MONGO_URI must configure database credentials or X.509 client-certificate authentication in production.");
        if (mongoOptions.get("w") === "0") problems.push("MONGO_URI must not disable write acknowledgement in production.");
        if (mongoOptions.get("directconnection") === "true") problems.push("MONGO_URI must allow replica-set discovery in production; directConnection=true is only for local development/testing.");
    }
    if (nodeEnv === "test") {
        if (!/^carecycle_test_[a-z0-9_-]+$/.test(mongoDbName)) problems.push("MONGO_DB_NAME must use the carecycle_test_ prefix in test mode.");
        if (connectionString && (connectionString.isSRV || connectionString.hosts.some(host => !loopback(new URL(`http://${host}`).hostname)))) problems.push("MONGO_URI must point only to loopback hosts in test mode.");
    }

    const mailUser = text("MAIL_USER");
    const mailPassword = typeof source.MAIL_PASSWORD === "string" ? source.MAIL_PASSWORD : "";
    const mailFrom = text("MAIL_FROM") || mailUser;
    const recipients = text("MAIL_RECIPIENTS").split(",").map(value => value.trim()).filter(Boolean);
    const mailService = text("MAIL_SERVICE") || "gmail";
    const mailEnabled = Boolean(mailUser || mailPassword || text("MAIL_FROM") || recipients.length);
    if (mailEnabled && (!mailUser || !mailPassword || !mailFrom || !recipients.length || !bareEmail(mailFrom) || recipients.some(value => !bareEmail(value)) || !/^[a-z0-9_-]+$/i.test(mailService))) problems.push("MAIL_USER, MAIL_PASSWORD, MAIL_FROM and MAIL_RECIPIENTS must form a complete mail configuration with bare email addresses and a valid MAIL_SERVICE name, or all be blank.");
    const demoFlag = text("DEMO_MODE");
    if (source.DEMO_MODE !== undefined && !["true", "false"].includes(demoFlag)) problems.push("DEMO_MODE must be true or false.");
    const demoMode = demoFlag === "true";
    if (demoMode && !(nodeEnv === "test" ? /^carecycle_test_[a-z0-9_-]+$/ : /^carecycle_demo_[a-z0-9_-]+$/).test(mongoDbName)) problems.push("DEMO_MODE requires a dedicated carecycle_demo_ database (carecycle_test_ in isolated tests).");
    if (demoMode && mailEnabled) problems.push("DEMO_MODE requires all mail credentials and recipients to be blank.");
    if (demoMode && !mongoRequireReplicaSet) problems.push("DEMO_MODE requires MONGO_REQUIRE_REPLICA_SET=true.");
    if (problems.length) throw new ConfigurationError(problems);
    return Object.freeze({ nodeEnv, isProduction, demoMode, port, mongoUri, mongoDbName, mongoRequireReplicaSet, jwtSecret: secrets.JWT_SECRET, sessionSecret: secrets.SESSION_SECRET, appUrl, trustProxy, mailService, mailUser, mailPassword, mailFrom, mailRecipients: Object.freeze(recipients) });
};

export const loadRuntimeConfiguration = ({ source = process.env, envPath = path.resolve(".env") } = {}) => {
    // Preserve dotenv's no-overwrite behavior; tests and explicitly selected
    // production never import a developer .env or mutate its settings.
    if (source.NODE_ENV === undefined || source.NODE_ENV === "development") {
        try {
            const values = dotenv.parse(readFileSync(envPath));
            for (const [name, value] of Object.entries(values)) if (source[name] === undefined) source[name] = value;
        } catch (error) {
            if (error.code !== "ENOENT") throw new ConfigurationError(["The development .env file could not be read."]);
        }
    }
    return parseRuntimeEnvironment(source);
};
