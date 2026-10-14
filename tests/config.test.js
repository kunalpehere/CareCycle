import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { ConfigurationError, loadRuntimeConfiguration, parseRuntimeEnvironment } from "../src/config/runtime.js";
import { DatabaseTopologyError, verifyReplicaSet } from "../src/config/topology.js";
import { isolatedTestEnvironment } from "./support/environment.js";

const valid = (changes = {}) => ({
    NODE_ENV: "development", MONGO_URI: "mongodb://127.0.0.1:27017", MONGO_DB_NAME: "CareCycle",
    JWT_SECRET: randomBytes(48).toString("hex"), SESSION_SECRET: randomBytes(48).toString("hex"), ...changes
});
const production = (changes = {}) => valid({
    NODE_ENV: "production", APP_URL: "https://carecycle.example.invalid", TRUST_PROXY: "127.0.0.1",
    MONGO_URI: "mongodb://synthetic:synthetic-password@db.example.invalid/?tls=true&replicaSet=carecycle", ...changes
});
const invalid = (settings, expected) => assert.throws(() => parseRuntimeEnvironment(settings), error => error instanceof ConfigurationError && expected.test(error.message));

test("development defaults retain CareCycle naming while explicit existing names win", () => {
    const source = valid({ MONGO_DB_NAME: "Medonor", MONGO_URI: "mongodb://127.0.0.1:27017/OtherName", PORT: "8080" });
    const result = parseRuntimeEnvironment(source);
    assert.equal(result.mongoDbName, "Medonor");
    assert.equal(result.mongoUri, source.MONGO_URI);
    assert.equal(result.port, 8080);
    assert.equal(result.appUrl, "http://localhost:8080");
    assert.equal(result.trustProxy, false);
    assert.equal(result.mongoRequireReplicaSet, false);
    delete source.MONGO_DB_NAME;
    assert.equal(parseRuntimeEnvironment(source).mongoDbName, "CareCycle");
    assert.ok(Object.isFrozen(result));
});

test("invalid environment names and ports fail instead of silently defaulting", () => {
    for (const NODE_ENV of ["", "prod", "staging"]) invalid(valid({ NODE_ENV }), /NODE_ENV/);
    for (const PORT of ["", "0", "-1", "65536", "4000junk", "4e3", "1.5"]) invalid(valid({ PORT }), /PORT/);
    assert.equal(parseRuntimeEnvironment(valid({ PORT: "65535" })).port, 65535);
});

test("required, placeholder, repeated and shared secrets are rejected without exposure", () => {
    for (const JWT_SECRET of [undefined, "short", "replace-with-a-long-random-secret", "a".repeat(48), " padded-secret-with-more-than-thirty-two-characters "]) invalid(valid({ JWT_SECRET }), /JWT_SECRET/);
    const same = randomBytes(48).toString("hex");
    invalid(valid({ JWT_SECRET: same, SESSION_SECRET: same }), /must be different/);
    const privateMarker = "SYNTHETIC_PRIVATE_URI_PASSWORD";
    try { parseRuntimeEnvironment(valid({ JWT_SECRET: "short", MONGO_URI: `mongodb://synthetic:${privateMarker}@bad-host:99999` })); }
    catch (error) {
        assert.match(error.message, /JWT_SECRET/);
        assert.match(error.message, /MONGO_URI/);
        assert.ok(!error.message.includes(privateMarker));
        assert.ok(!error.message.includes("bad-host"));
    }
});

test("MongoDB URI grammar accepts seed lists, SRV and IPv6 but rejects ambiguous settings", () => {
    for (const MONGO_URI of ["mongodb://host-a:27017,host-b:27018/?replicaSet=dev", "mongodb+srv://cluster.example.invalid/", "mongodb://[::1]:27017/"]) assert.equal(parseRuntimeEnvironment(valid({ MONGO_URI })).mongoUri, MONGO_URI);
    for (const MONGO_URI of ["https://example.invalid", "mongodb://", "mongodb://127.0.0.1:65536", "mongodb://localhost:", "mongodb://host/?tls=true&TLS=false", "mongodb://host/?tls=true;tlsInsecure=true", "mongodb://host/?tls=1", "mongodb://host/?tls=true&ssl=false", "mongodb://host/#fragment"]) invalid(valid({ MONGO_URI }), /MONGO_URI/);
});

test("database names and replica requirement flags are explicit", () => {
    for (const MONGO_DB_NAME of ["", "name with space", "name/path", "name.with.dot", "x".repeat(64)]) invalid(valid({ MONGO_DB_NAME }), /MONGO_DB_NAME/);
    for (const MONGO_REQUIRE_REPLICA_SET of ["", "yes", "1"]) invalid(valid({ MONGO_REQUIRE_REPLICA_SET }), /MONGO_REQUIRE_REPLICA_SET/);
    invalid(valid({ MONGO_REQUIRE_REPLICA_SET: "true", MONGO_URI: "mongodb://host/?readPreference=secondary" }), /primary read preference/);
});

test("application URL is a credential-free origin with environment-specific boundaries", () => {
    for (const APP_URL of ["", "ftp://host", "https://user:password@example.invalid", "https://example.invalid/path", "https://example.invalid/?key=private", "https://example.invalid/#fragment"]) invalid(valid({ APP_URL }), /APP_URL/);
    for (const APP_URL of [undefined, "http://example.invalid", "https://localhost", "https://127.0.0.1", "https://[::1]", "https://0.0.0.0"]) invalid(production({ APP_URL }), /APP_URL/);
    assert.equal(parseRuntimeEnvironment(valid({ APP_URL: "https://example.invalid/" })).appUrl, "https://example.invalid");
});

test("production requires explicit database name, secure authenticated MongoDB and discovery", () => {
    const result = parseRuntimeEnvironment(production());
    assert.equal(result.isProduction, true);
    assert.equal(result.mongoRequireReplicaSet, true);
    invalid(production({ MONGO_DB_NAME: undefined }), /explicitly set/);
    invalid(production({ MONGO_REQUIRE_REPLICA_SET: "false" }), /must be true/);
    for (const MONGO_URI of ["mongodb://synthetic:password@host/", "mongodb://host/?tls=true", "mongodb://synthetic:password@host/?tls=true&tlsInsecure=true", "mongodb://synthetic:password@host/?tls=true&tlsAllowInvalidCertificates=true", "mongodb://synthetic:password@host/?tls=true&tlsAllowInvalidHostnames=true", "mongodb://synthetic:password@host/?tls=true&w=0", "mongodb://synthetic:password@host/?tls=true&directConnection=true"]) invalid(production({ MONGO_URI }), /MONGO_URI/);
    assert.equal(parseRuntimeEnvironment(production({ MONGO_URI: "mongodb+srv://synthetic:password@cluster.example.invalid/" })).isProduction, true);
    assert.equal(parseRuntimeEnvironment(production({ MONGO_URI: "mongodb://host/?tls=true&authMechanism=MONGODB-X509&tlsCertificateKeyFile=synthetic.pem" })).isProduction, true);
});

test("proxy trust uses address lists and rejects blanket/hop-count trust", () => {
    const result = parseRuntimeEnvironment(production({ TRUST_PROXY: "127.0.0.1, ::1/128" }));
    assert.deepEqual(result.trustProxy, ["127.0.0.1", "::1/128"]);
    assert.ok(Object.isFrozen(result.trustProxy));
    for (const TRUST_PROXY of ["true", "1", "0.0.0.0/0", "::/0", "127.0.0.1/33", "::1/129", "localhost", "127.0.0.1,"]) invalid(production({ TRUST_PROXY }), /TRUST_PROXY/);
    for (const TRUST_PROXY of [undefined, "", "false"]) invalid(production({ TRUST_PROXY }), /TRUST_PROXY/);
});

test("test mode cannot use a production-named or remotely hosted database", () => {
    const source = valid({ NODE_ENV: "test", APP_URL: "http://127.0.0.1:4183", MONGO_DB_NAME: "carecycle_test_configuration" });
    assert.equal(parseRuntimeEnvironment(source).nodeEnv, "test");
    invalid({ ...source, MONGO_DB_NAME: "CareCycle" }, /carecycle_test_/);
    invalid({ ...source, MONGO_URI: "mongodb://db.example.invalid:27017" }, /loopback/);
    invalid({ ...source, MONGO_URI: "mongodb+srv://cluster.example.invalid/" }, /loopback/);
    invalid({ ...source, APP_URL: "https://example.invalid" }, /APP_URL/);
});

test("optional email is disabled when blank and partial configurations are rejected", () => {
    assert.equal(parseRuntimeEnvironment(valid()).mailRecipients.length, 0);
    invalid(valid({ MAIL_USER: "synthetic@example.invalid" }), /MAIL_USER/);
    invalid(valid({ MAIL_USER: "synthetic@example.invalid", MAIL_PASSWORD: "synthetic-password", MAIL_RECIPIENTS: "not-an-email" }), /MAIL_RECIPIENTS/);
    const complete = parseRuntimeEnvironment(valid({ MAIL_USER: "synthetic@example.invalid", MAIL_PASSWORD: "synthetic-password", MAIL_RECIPIENTS: "one@example.invalid, two@example.invalid" }));
    assert.equal(complete.mailFrom, "synthetic@example.invalid");
    assert.equal(complete.mailRecipients.length, 2);
    assert.ok(Object.isFrozen(complete.mailRecipients));
});

test("development dotenv fills missing settings; test/production ignore it", async () => {
    await mkdir("artifacts", { recursive: true });
    const directory = await mkdtemp(path.resolve("artifacts/config-fixture-"));
    const envPath = path.join(directory, ".env");
    try {
        const source = valid();
        await writeFile(envPath, `PORT=8081\nMONGO_DB_NAME=Medonor\nMAIL_USER=unwanted@example.invalid\n`);
        assert.equal(loadRuntimeConfiguration({ source: { ...source, MAIL_USER: "" }, envPath }).port, 8081);
        assert.equal(loadRuntimeConfiguration({ source: { ...source, PORT: "8082", MAIL_USER: "" }, envPath }).port, 8082);
        assert.equal(loadRuntimeConfiguration({ source: production(), envPath }).port, 4000);
        const testSource = valid({ NODE_ENV: "test", MONGO_DB_NAME: "carecycle_test_loader", APP_URL: "http://localhost:4000" });
        assert.equal(loadRuntimeConfiguration({ source: testSource, envPath }).port, 4000);
    } finally { await rm(directory, { recursive: true, force: true }); }
});

test("replica-set verification distinguishes a primary from standalone or secondary", async () => {
    const connection = hello => ({ db: { admin: () => ({ command: async () => hello }) } });
    await verifyReplicaSet(connection({ setName: "synthetic", isWritablePrimary: true, logicalSessionTimeoutMinutes: 30 }), true);
    for (const hello of [{ isWritablePrimary: true }, { setName: "synthetic", isWritablePrimary: false, logicalSessionTimeoutMinutes: 30 }, { setName: "synthetic", isWritablePrimary: true }]) await assert.rejects(verifyReplicaSet(connection(hello), true), DatabaseTopologyError);
    await verifyReplicaSet({ db: null }, false);
});

test("production session cookies require HTTPS from the configured proxy", () => {
    for (const [TRUST_PROXY, expectedCookie, ipv6] of [["127.0.0.1", true, false], ["192.0.2.1", false, false], ["127.0.0.1", false, true], ["::1", true, true]]) {
        const child = spawnSync(process.execPath, ["tests/support/production-cookie-check.js", ...(ipv6 ? ["--ipv6"] : [])], {
            env: { ...isolatedTestEnvironment(), ...production({ TRUST_PROXY }) }, encoding: "utf8", timeout: 30000
        });
        assert.equal(child.status, 0, child.stderr);
        // The probe now emits structured request logs as well as its result.
        const result = child.stdout.trim().split(/\r?\n/).map(line => JSON.parse(line)).find(value => Object.hasOwn(value, "cookieIssued"));
        assert.ok(result, "Cookie probe result was returned alongside structured logs.");
        assert.equal(result.status, expectedCookie ? 200 : 400);
        assert.equal(result.cookieIssued, expectedCookie);
        if (expectedCookie) {
            for (const flag of ["secureCookie", "hostCookie", "httpOnly", "sameSiteLax", "rootPath", "domainAbsent"]) assert.equal(result[flag], true, flag);
            assert.equal(result.hsts, "max-age=31536000");
        }
    }
});

test("config CLI validates offline and reports unsafe settings without supplied values", () => {
    const source = { ...isolatedTestEnvironment(), MONGO_URI: "mongodb://synthetic:SYNTHETIC_PRIVATE_CLI_MARKER@127.0.0.1:1" };
    const good = spawnSync(process.execPath, ["scripts/check-config.js"], { env: source, encoding: "utf8", timeout: 5000 });
    assert.equal(good.status, 0, good.stderr);
    assert.match(good.stdout, /No connection was attempted/);
    assert.ok(!good.stdout.includes("SYNTHETIC_PRIVATE_CLI_MARKER"));
    const bad = spawnSync(process.execPath, ["scripts/check-config.js"], { env: { ...source, SESSION_SECRET: "SYNTHETIC_PRIVATE_WEAK_MARKER" }, encoding: "utf8", timeout: 5000 });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /SESSION_SECRET/);
    assert.ok(!bad.stderr.includes("SYNTHETIC_PRIVATE_WEAK_MARKER"));
});

test("runtime database errors are redacted and leave no open connection", () => {
    const marker = "SYNTHETIC_PRIVATE_CONNECTION_MARKER";
    const source = { ...isolatedTestEnvironment(), MONGO_URI: `mongodb://synthetic:${marker}@127.0.0.1:1/?unsupportedOption=${marker}` };
    const code = 'import mongoose from "mongoose"; import {connectDatabase,disconnectDatabase} from "./src/config/database.js"; try { await connectDatabase(); process.exitCode=2; } catch(error) { console.log(JSON.stringify({message:error.message,disconnected:mongoose.connection.readyState===0})); } finally { await disconnectDatabase(); }';
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", code], { env: source, encoding: "utf8", timeout: 5000 });
    assert.equal(child.status, 0, child.stderr);
    const result = JSON.parse(child.stdout.trim());
    assert.match(result.message, /MongoDB connection failed/);
    assert.ok(!result.message.includes(marker));
    assert.equal(result.disconnected, true);
});
