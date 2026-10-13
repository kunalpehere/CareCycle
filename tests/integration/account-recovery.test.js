import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import { startWorkflowFixture } from "../support/workflow-fixture.js";

test("Day 19 recovery, verification and revocation boundaries", { timeout: 180000 }, async t => {
    const f = await startWorkflowFixture();
    try {
        const { issueAccountCredential, consumeAccountCredential, hasAccountCredential, validRecoveryPassword } = await import("../../src/services/accountRecoveryService.js");
        const { createAccessToken } = await import("../../src/services/tokenService.js");
        let sequence = 0;
        const makeUser = (extra = {}) => f.User.create({ name: "Synthetic Recovery", email: `recovery-${++sequence}@example.invalid`, password: "unused", role: "donor", ...extra });
        const issue = async (user, purpose = "reset") => {
            let link;
            const result = await issueAccountCredential(user, purpose, { send: async mail => { link = new URL(mail.url); assert.equal(mail.to, user.email); return { sent: true }; } });
            assert.equal(result.sent, true);
            return { id: link.searchParams.get("id"), token: link.searchParams.get("token"), purpose };
        };
        await t.test("hashed credentials, account/purpose binding, expiry and replacement", async () => {
            const user = await makeUser(); const other = await makeUser();
            const key = await issue(user);
            const stored = await f.User.findById(user.id).select("+resetCredential");
            assert.notEqual(stored.resetCredential.hash, key.token);
            assert.ok(!JSON.stringify(stored.toJSON()).includes(key.token));
            assert.ok(!("resetCredential" in stored.toJSON()));
            assert.equal(await consumeAccountCredential({ ...key, id: other.id, password: "Strong-test-19" }), false);
            assert.equal(await consumeAccountCredential({ ...key, purpose: "verification" }), false);
            assert.equal(await hasAccountCredential({ $ne: null }, "reset", key.token), false);
            assert.equal((await issueAccountCredential(user, "reset")).reason, "cooldown-or-ineligible");
            await f.User.updateOne({ _id: user.id }, { $set: { "resetCredential.issuedAt": new Date(0) } });
            const replacement = await issue(user);
            assert.equal(await hasAccountCredential(key.id, "reset", key.token), false);
            await f.User.updateOne({ _id: user.id }, { $set: { "resetCredential.expiresAt": new Date(0) } });
            assert.equal(await consumeAccountCredential({ ...replacement, password: "Strong-test-19" }), false);
            assert.equal(validRecoveryPassword("😀".repeat(19)), false);
        });
        await t.test("concurrent resets consume once and revoke participant/admin cookies including guest redirects", async () => {
            for (const role of ["donor", "ngo", "admin"]) {
                const user = await makeUser({ role }); const old = await f.client(user); const key = await issue(user);
                const results = await Promise.all([1, 2].map(() => consumeAccountCredential({ ...key, password: "Strong-test-19" })));
                assert.deepEqual(results.sort(), [false, true]);
                const updated = await f.User.findById(user.id).select("+password");
                assert.equal(await bcrypt.compare("Strong-test-19", updated.password), true);
                assert.equal(updated.authVersion, 1);
                assert.equal((await old.get("/notifications")).status, 401);
                assert.equal((await old.get("/login")).status, 200);
                const loginClient = await f.client();
                const loginResponse = await loginClient.post(role === "admin" ? "/admin/login" : "/login", { email: user.email, password: "Strong-test-19" });
                assert.equal(loginResponse.status, 302);
                const tokenCookie = loginResponse.headers.getSetCookie().find(cookie => cookie.startsWith("token="));
                assert.ok(tokenCookie);
                const realLogin = await f.client(null, { token: tokenCookie.split(";")[0].slice("token=".length) });
                assert.equal((await realLogin.get("/notifications")).status, 200);
                const fresh = await f.client(updated, { token: createAccessToken(updated.id, updated.authVersion) });
                assert.equal((await fresh.get("/notifications")).status, 200);
                assert.equal(await consumeAccountCredential({ ...key, password: "Strong-test-19" }), false);
            }
        });
        await t.test("verification uses explicit CSRF-protected POST and gates only new activity", async () => {
            const user = await makeUser(); const actor = await f.client(user); const guest = await f.client(); const key = await issue(user, "verification");
            assert.equal((await actor.get("/donor/dashboard")).status, 200);
            assert.equal((await actor.get("/donate")).status, 403);
            const page = await guest.get(`/verify-email?id=${key.id}&token=${key.token}`);
            assert.equal(page.status, 200); assert.equal(page.headers.get("referrer-policy"), "no-referrer");
            assert.match(page.headers.get("cache-control"), /no-store/);
            assert.equal((await f.User.findById(user.id)).emailVerifiedAt, null);
            assert.equal((await guest.post("/verify-email", { ...key, _csrf: "wrong" })).status, 403);
            assert.equal((await guest.post("/verify-email", key)).status, 200);
            assert.equal((await guest.post("/verify-email", key)).status, 400);
            assert.equal((await actor.get("/donate")).status, 200);
            const ngo = await makeUser({ role: "ngo" });
            await f.Organization.collection.insertOne({ owner: ngo._id, name: "Synthetic Recovery NGO", contactEmail: ngo.email, verificationStatus: "verified" });
            const member = await f.client(ngo);
            assert.equal((await member.post("/ngo/equipment/000000000000000000000001/requests", { quantity: "1" })).status, 403);
        });
        await t.test("recovery responses do not expose accounts; mail failure/resend path and rate limits", async () => {
            const user = await makeUser(); const guest = await f.client();
            const existing = await guest.post("/forgot-password", { email: user.email });
            const absent = await guest.post("/forgot-password", { email: "absent@example.invalid" });
            assert.equal(existing.status, absent.status); assert.equal(existing.text, absent.text);
            assert.equal((await guest.post("/forgot-password", { email: user.email, _csrf: "wrong" })).status, 403);
            for (let n = 0; n < 7; n++) await guest.post("/forgot-password", {});
            assert.equal((await guest.post("/forgot-password", {})).status, 429);
            const failed = await makeUser();
            assert.equal((await issueAccountCredential(failed, "verification", { send: async () => { throw new Error("synthetic"); } })).reason, "delivery-failed");
            await f.User.updateOne({ _id: failed.id }, { $set: { "verificationCredential.issuedAt": new Date(0) } });
            assert.equal((await issueAccountCredential(failed, "verification")).reason, "not-configured");
            const suspended = await makeUser({ status: "suspended" });
            assert.equal((await issueAccountCredential(suspended, "reset")).reason, "cooldown-or-ineligible");
        });
        await t.test("HTTP reset validation, no GET consumption, old cookie revocation, address changes", async () => {
            const user = await makeUser(); const old = await f.client(user); const guest = await f.client(); const key = await issue(user);
            assert.equal((await guest.get(`/reset-password?id=${key.id}&token=${key.token}`)).status, 200);
            assert.equal((await guest.post("/reset-password", { ...key, password: "short", confirmation: "short" })).status, 400);
            assert.equal((await guest.post("/reset-password", { ...key, password: "Strong-test-19", confirmation: "different" })).status, 400);
            assert.equal((await guest.post("/reset-password", { ...key, password: "Strong-test-19", confirmation: "Strong-test-19" })).status, 302);
            assert.equal((await old.get("/notifications")).status, 401);
            assert.equal((await guest.get(`/reset-password?id=${key.id}&token=${key.token}`)).status, 400);
            const edited = await makeUser(); const verify = await issue(edited, "verification");
            await f.User.updateOne({ _id: edited.id }, { $set: { email: "changed@example.invalid" } });
            assert.equal(await consumeAccountCredential(verify), false);
        });
        await t.test("registration attempts verification without exposing raw credentials; ineligible tokens cannot be consumed", async () => {
            const guest = await f.client();
            assert.equal((await guest.post("/register", { name: "Synthetic Registration", email: "registration19@example.invalid", password: "Registration-19!", role: "donor" })).status, 302);
            let registered;
            for (let count = 0; count < 100; count++) {
                registered = await f.User.findOne({ email: "registration19@example.invalid" }).select("+verificationCredential");
                if (registered?.verificationCredential) break;
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            assert.ok(registered.verificationCredential.hash);
            assert.equal(registered.emailVerifiedAt, null);
            assert.equal((await guest.get("/account/email")).status, 401);
            const user = await makeUser(); const key = await issue(user, "verification");
            await f.User.updateOne({ _id: user.id }, { $set: { status: "suspended" } });
            assert.equal(await consumeAccountCredential(key), false);
        });
    } finally { await f.close(); }
});
