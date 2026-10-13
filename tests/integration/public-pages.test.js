import test from "node:test";
import assert from "node:assert/strict";
import { startWorkflowFixture } from "../support/workflow-fixture.js";

test("public pages preserve authentication and guest contact boundaries", { timeout: 180000 }, async () => {
    const fixture = await startWorkflowFixture();
    try {
        const guest = await fixture.client();
        for (const url of ["/", "/home", "/about", "/contact"]) {
            const response = await guest.get(url);
            assert.equal(response.status, 200);
            assert.ok(!response.text.includes('action="/logout"'));
            assert.ok(!response.text.includes('href="/notifications"'));
            assert.match(response.text, /id="main-content"/);
        }
        for (const url of ["/donor/dashboard", "/ngo/equipment", "/notifications", "/admin/dashboard", "/donations/images/guessed.png", "/organizations/000000000000000000000001/verification-document", "/donor/requests/000000000000000000000001/receipt"]) {
            assert.equal((await guest.get(url)).status, 401, url);
        }
        assert.equal((await guest.post("/contact", { _csrf: "bad", name: "Synthetic Guest", email: "guest@example.invalid", message: "Synthetic question" })).status, 403);
        assert.equal((await guest.post("/contact", { name: "x", email: "bad", message: "short" })).status, 400);
        const unavailable = await guest.post("/contact", { name: "Synthetic Guest", email: "guest@example.invalid", message: '<script>alert("synthetic")</script>' });
        assert.equal(unavailable.status, 503);
        assert.match(unavailable.text, /not been sent or saved/);
        assert.match(unavailable.text, /&lt;script&gt;/);
        assert.ok(!unavailable.text.includes('<script>alert('));
        for (let i = 0; i < 7; i++) await guest.post("/contact", {});
        const limited = await guest.post("/contact", {});
        assert.equal(limited.status, 429);
        assert.ok(Number(limited.headers.get("retry-after")) > 0);
        for (const role of ["donor", "ngo", "admin"]) {
            const user = await fixture.User.create({ emailVerifiedAt: new Date(), name: `Synthetic ${role}`, email: `${role}@example.invalid`, password: "unused-fixture", role });
            const actor = await fixture.client(user);
            for (const url of ["/home", "/about", "/contact"]) {
                const response = await actor.get(url);
                assert.equal(response.status, 200);
                assert.match(response.text, /action="\/logout"/);
                assert.match(response.headers.get("cache-control"), /private, no-store/);
            }
            await fixture.User.updateOne({ _id: user._id }, { $set: { status: "suspended" } });
            const publicView = await actor.get("/home");
            assert.equal(publicView.status, 200);
            assert.ok(!publicView.text.includes('action="/logout"'));
            assert.equal((await actor.get("/notifications")).status, 401);
            const expired = await fixture.client(null, { token: fixture.expiredToken(user) });
            assert.equal((await expired.get("/home")).status, 200);
        }
        const invalid = await fixture.client(null, { token: "invalid" });
        assert.equal((await invalid.get("/about")).status, 200);
        const registration = await guest.get("/register?role=ngo");
        assert.match(registration.text, /value="ngo" checked/);
        assert.ok(!(await guest.get("/home")).text.includes("planned features"));
    } finally { await fixture.close(); }
});
