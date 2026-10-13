import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import bcrypt from "bcrypt";
import signature from "cookie-signature";
import { startWorkflowFixture } from "../support/workflow-fixture.js";

test("Day 21 persisted authentication and shared security state", { timeout: 180000 }, async t => {
    const f = await startWorkflowFixture(), children = [];
    const start = async (proxy = "127.0.0.1") => {
        const child = spawn(process.execPath, [fileURLToPath(new URL("../support/security-instance.js", import.meta.url))], { cwd: f.runtime, env: { ...process.env, TRUST_PROXY: proxy }, stdio: ["ignore", "ignore", "pipe", "ipc"] });
        children.push(child);
        child.stderr.on("data", data => process.stderr.write(data));
        const origin = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("Owned security instance startup timed out.")), 30000);
            child.once("message", value => { clearTimeout(timer); resolve(value.origin); });
            child.once("exit", code => { clearTimeout(timer); reject(new Error(`Owned security instance exited ${code}.`)); });
        });
        return { child, origin };
    };
    const stop = async child => {
        if (child.exitCode !== null) return;
        const exited = new Promise(resolve => child.once("exit", resolve)); child.send("stop"); await exited;
    };
    try {
        const { MongoSessionStore, sessionKey, consumeRateLimit } = await import("../../src/services/securityStoreService.js");
        const { env } = await import("../../src/config/env.js");
        const user = await f.User.create({ name: "Synthetic Security", email: "security21@example.invalid", password: await bcrypt.hash("Security-fixture-21!", 10), role: "donor", emailVerifiedAt: new Date() });
        let one = await start(), two = await start();
        const request = async (origin, url, cookie = "", body = null, address = "192.0.2.211") => {
            const res = await fetch(origin + url, { redirect: "manual", method: body ? "POST" : "GET", headers: { Cookie: cookie, Accept: "application/json", "X-Forwarded-For": address, ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) }, body: body ? new URLSearchParams(body) : undefined });
            return { status: res.status, text: await res.text(), cookies: res.headers.getSetCookie().map(value => value.split(";")[0]).join("; "), headers: res.headers };
        };
        const form = await request(one.origin, "/login");
        const oldCsrf = form.text.match(/name="_csrf" value="([^"]+)"/)[1];
        const login = await request(one.origin, "/login", form.cookies, { _csrf: oldCsrf, email: user.email, password: "Security-fixture-21!" });
        assert.equal(login.status, 302);
        const cookie = login.cookies;
        const sid = signature.unsign(decodeURIComponent(cookie.match(/carecycle.sid=([^;]+)/)[1]).slice(2), env.sessionSecret);
        const store = new MongoSessionStore();
        const get = id => new Promise((resolve, reject) => store.get(id, (error, value) => error ? reject(error) : resolve(value)));
        await t.test("authentication and CSRF survive another process and a restart", async () => {
            assert.equal((await request(two.origin, "/donor/dashboard", cookie)).status, 200);
            await stop(one.child); one = await start();
            const page = await request(one.origin, "/account/email", cookie); assert.equal(page.status, 200);
            const csrf = page.text.match(/name="_csrf" value="([^"]+)"/)[1]; assert.equal(csrf, (await get(sid)).csrfToken);
            assert.equal((await request(two.origin, "/account/email", cookie, { _csrf: oldCsrf })).status, 403);
            assert.equal((await request(two.origin, "/account/email", cookie, { _csrf: csrf })).status, 200);
            const row = await f.mongoose.connection.db.collection("security_sessions").findOne({ _id: sessionKey(sid) });
            assert.ok(!JSON.stringify(row).includes(sid));
        });
        await t.test("concurrent requests share one allowance across processes; restart does not reset it", async () => {
            const guest = await request(one.origin, "/forgot-password", "", null, "192.0.2.212");
            const csrf = guest.text.match(/name="_csrf" value="([^"]+)"/)[1];
            const responses = await Promise.all(Array.from({ length: 16 }, (_, index) => request(index % 2 ? one.origin : two.origin, "/forgot-password", guest.cookies, { _csrf: csrf, email: "absent@example.invalid" }, "192.0.2.212")));
            assert.equal(responses.filter(value => value.status === 200).length, 10);
            assert.equal(responses.filter(value => value.status === 429).length, 6);
            await stop(two.child); two = await start();
            const limited = await request(two.origin, "/forgot-password", guest.cookies, { _csrf: csrf }, "192.0.2.212"); assert.equal(limited.status, 429); assert.ok(Number(limited.headers.get("retry-after")) > 0);
        });
        await t.test("untrusted forwarded client addresses cannot create fresh rate allowances", async () => {
            const untrusted = await start("false");
            const guest = await request(untrusted.origin, "/forgot-password"); const csrf = guest.text.match(/name="_csrf" value="([^"]+)"/)[1];
            for (let n = 0; n < 10; n++) assert.equal((await request(untrusted.origin, "/forgot-password", guest.cookies, { _csrf: csrf }, `198.51.100.${n + 1}`)).status, 200);
            assert.equal((await request(untrusted.origin, "/forgot-password", guest.cookies, { _csrf: csrf }, "203.0.113.99")).status, 429);
            await stop(untrusted.child);
        });
        await t.test("session expiry is enforced before TTL cleanup; logout rejects copied cookies and stale saves", async () => {
            const page = await request(one.origin, "/account/email", cookie), csrf = page.text.match(/name="_csrf" value="([^"]+)"/)[1];
            const saved = await get(sid);
            assert.equal((await request(one.origin, "/logout", cookie, { _csrf: csrf })).status, 302);
            assert.equal((await request(two.origin, "/donor/dashboard", cookie)).status, 401);
            await assert.rejects(new Promise((resolve, reject) => store.set(sid, saved, error => error ? reject(error) : resolve())));
            assert.equal(await get(sid), null);
            const expired = "synthetic-expired-session";
            await new Promise((resolve, reject) => store.set(expired, { cookie: { expires: new Date(0) }, auth: { userId: user.id, authVersion: 0 } }, error => error ? reject(error) : resolve()));
            assert.equal(await get(expired), null);
        });
        await t.test("storage failure denies security operations; rate expiry and cleanup indexes are explicit", async () => {
            await assert.rejects(consumeRateLimit({ namespace: "outage", address: "fixture", max: 1, windowMs: 1000, connection: { readyState: 0 } }), error => error.status === 503);
            const { createApp } = await import("../../src/app.js");
            const unavailable = createApp({ sessionStore: new MongoSessionStore({ readyState: 0 }) }).listen(0, "127.0.0.1");
            await new Promise(resolve => unavailable.once("listening", resolve));
            try {
                const response = await request(`http://127.0.0.1:${unavailable.address().port}`, "/login");
                assert.equal(response.status, 503); assert.match(response.text, /temporarily unavailable/);
            } finally { unavailable.closeAllConnections(); await new Promise(resolve => unavailable.close(resolve)); }
            const limits = f.mongoose.connection.db.collection("security_limits");
            await f.mongoose.connection.db.command({ collMod: limits.collectionName, validator: { count: { $lt: 0 } }, validationLevel: "strict", validationAction: "error" });
            try {
                const guest = await request(one.origin, "/forgot-password", "", null, "192.0.2.213"), csrf = guest.text.match(/name="_csrf" value="([^"]+)"/)[1];
                assert.equal((await request(one.origin, "/forgot-password", guest.cookies, { _csrf: csrf }, "192.0.2.213")).status, 503);
            } finally { await f.mongoose.connection.db.command({ collMod: limits.collectionName, validator: {} }); }
            assert.ok((await limits.indexes()).some(index => index.expireAfterSeconds === 0));
            assert.ok((await f.mongoose.connection.db.collection("security_sessions").indexes()).some(index => index.expireAfterSeconds === 0));
            assert.ok(!JSON.stringify(await limits.find().toArray()).includes("192.0.2.212"));
            const policy = { namespace: "expiry-probe", address: "fixture", max: 1, windowMs: 1000 };
            assert.equal((await consumeRateLimit(policy)).allowed, true); assert.equal((await consumeRateLimit(policy)).allowed, false);
            // No sleep or TTL timing dependency: expire this isolated bucket explicitly.
            await limits.updateMany({ count: 2 }, { $set: { resetAt: new Date(0) } });
            assert.equal((await consumeRateLimit(policy)).allowed, true);
        });
    } finally { await Promise.all(children.map(stop)); await f.close(); }
});
