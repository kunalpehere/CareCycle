import { cp, mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startIsolatedDatabase } from "./database.js";

// A file owns exactly one instance. No external URI/runtime path is accepted.
export const startWorkflowFixture = async () => {
    if (process.env.NODE_ENV !== "test" || !/^carecycle_test_[a-f0-9]+$/.test(process.env.MONGO_DB_NAME || "")) {
        throw new Error("Use the isolated integration runner for workflow fixtures.");
    }
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const runtimeParent = path.join(root, "artifacts/runtime");
    await mkdir(runtimeParent, { recursive: true });
    const runtime = await mkdtemp(path.join(runtimeParent, "workflow-"));
    let database, server, mongoose;
    const close = async () => {
        try {
            if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); server = null; }
        } finally {
            try { if (mongoose) await mongoose.disconnect(); }
            finally {
                try { if (database) { await database.stop(); database = null; } }
                finally {
                    process.chdir(root);
                    const target = await realpath(runtime);
                    const parent = await realpath(runtimeParent);
                    const relative = path.relative(await realpath(root), target);
                    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) ||
                        path.dirname(target) !== parent || !path.basename(target).startsWith("workflow-")) throw new Error("Refusing cleanup outside the owned workflow directory.");
                    await rm(target, { recursive: true, force: true });
                }
            }
        }
    };
    try {
        database = await startIsolatedDatabase();
        process.env.MONGO_URI = database.getUri();
        process.env.TRUST_PROXY = "127.0.0.1";
        await cp(path.join(root, "views"), path.join(runtime, "views"), { recursive: true });
        await cp(path.join(root, "public"), path.join(runtime, "public"), { recursive: true });
        process.chdir(runtime);
        // Paths in file services are resolved only after entering this runtime.
        const { createApp } = await import("../../src/app.js");
        const { connectDatabase } = await import("../../src/config/database.js");
        mongoose = await connectDatabase();
        const { User } = await import("../../src/models/User.js");
        const { Organization } = await import("../../src/models/Organization.js");
        const { Donation } = await import("../../src/models/Donation.js");
        const { DonationRequest } = await import("../../src/models/DonationRequest.js");
        await Promise.all([User.init(), Organization.init(), Donation.init(), DonationRequest.init()]);
        const { createAccessToken } = await import("../../src/services/tokenService.js");
        const { env } = await import("../../src/config/env.js");
        const { default: jwt } = await import("jsonwebtoken");
        const { saveVerificationDocument } = await import("../../src/services/verificationDocumentService.js");
        const { saveDonationImages } = await import("../../src/services/imageService.js");
        server = createApp().listen(0, "127.0.0.1");
        await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
        const origin = `http://127.0.0.1:${server.address().port}`;
        let clientNumber = 0;
        const client = async (user, { token = user ? createAccessToken(user.id) : "" } = {}) => {
            const address = `192.0.2.${++clientNumber}`;
            let cookie = token ? `token=${token}` : "";
            let csrf;
            const request = async (url, options = {}) => {
                const response = await fetch(origin + url, { redirect: "manual", ...options,
                    headers: { Accept: "application/json", Cookie: cookie, "X-Forwarded-For": address, ...options.headers } });
                const body = Buffer.from(await response.arrayBuffer());
                return { status: response.status, body, text: body.toString("utf8"), headers: response.headers };
            };
            const login = await request("/login");
            cookie += `; ${login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ")}`;
            csrf = login.text.match(/name="_csrf" value="([^"]+)"/)?.[1];
            // Authenticated /login redirects through guestOnly, so get a guest
            // form with the same session cookie to obtain a real CSRF token.
            if (!csrf) {
                const savedCookie = cookie;
                cookie = cookie.split("; ").filter(value => !value.startsWith("token=")).join("; ");
                const form = await request("/login");
                csrf = form.text.match(/name="_csrf" value="([^"]+)"/)?.[1];
                cookie = savedCookie;
            }
            if (!csrf) throw new Error("Workflow fixture could not obtain a CSRF token.");
            return { get: (url, headers = {}) => request(url, { headers }), post: (url, values = {}) => request(url, { method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ _csrf: csrf, ...values }) }) };
        };
        const expiredToken = user => jwt.sign({ id: user.id }, env.jwtSecret, { algorithm: "HS256", expiresIn: -1 });
        return { close, runtime, mongoose, User, Organization, Donation, DonationRequest, client, expiredToken, saveVerificationDocument, saveDonationImages };
    } catch (error) { await close(); throw error; }
};
