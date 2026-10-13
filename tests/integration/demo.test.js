import test from "node:test";
import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { startDemoFixture } from "../support/demo-fixture.js";

test("Day 25 isolated demo deployment and reset boundaries", { timeout: 180000 }, async t => {
    const f = await startDemoFixture();
    try {
        let db = f.mongoose.connection.db;
        const { User } = await import("../../src/models/User.js");
        const { Organization } = await import("../../src/models/Organization.js");
        const { Donation } = await import("../../src/models/Donation.js");
        const { consumeDemoBudget, DEMO_WRITE_LIMIT } = await import("../../src/services/demoService.js");
        const guest = f.client();
        await t.test("disabling demo mode cannot serve the marked synthetic database", async () => {
            const probe = spawnSync(process.execPath, ["--input-type=module", "-e", "import { connectDatabase } from './src/config/database.js'; try { await connectDatabase(); process.exitCode=1; } catch(error) { process.exitCode=error.name==='DemoIsolationError' ? 0 : 2; }"], { env: { ...process.env, DEMO_MODE: "false" }, encoding: "utf8", timeout: 15000, windowsHide: true });
            assert.equal(probe.status, 0, "The non-demo startup must specifically reject the demo marker.");
        });
        await t.test("fresh visitor has labelled synthetic entry, safe role switching and CSRF", async () => {
            assert.equal((await guest.get("/login")).headers.get("location"), "/demo");
            const page = await guest.get("/demo");
            assert.equal(page.status, 200); assert.match(page.text, /shared synthetic demo/);
            assert.match(page.headers.get("cache-control"), /no-store/);
            assert.equal((await guest.post("/demo/login", { role: "donor", _csrf: "wrong" })).status, 403);
            assert.equal((await guest.post("/demo/login", { role: "admin" })).status, 400);
            assert.equal((await guest.post("/demo/login", { role: "ngo" })).headers.get("location"), "/ngo/dashboard");
            assert.equal((await guest.get("/ngo/equipment")).status, 200);
            await guest.get("/demo");
            assert.equal((await guest.post("/demo/login", { role: "donor" })).headers.get("location"), "/donor/dashboard");
            assert.equal((await guest.get("/donor/dashboard")).status, 200);
            assert.equal((await guest.get("/ngo/requests")).status, 403);
            assert.equal(await User.countDocuments({ role: "admin" }), 0);
        });
        await t.test("administration, signup, recovery, contact and uploads are blocked before writes", async () => {
            for (const route of ["/admin/login", "/ADMIN/login", "/admin/diagnostics", "/register", "/forgot-password", "/reset-password", "/account/email", "/verify-email"]) assert.equal((await guest.get(route)).status, 403, route);
            for (const route of ["/register", "/admin/login", "/contact", "/CONTACT/", "/ngo/organization", "/NGO/ORGANIZATION/", "/ngo/organizations/250000000000000000000003/edit"]) assert.equal((await guest.post(route)).status, 403, route);
            const body = new FormData(); body.set("images", new Blob(["synthetic bytes"]), "demo.png");
            assert.equal((await guest.request("/donate", { method: "POST", body })).status, 403);
            assert.equal(await db.collection("private_media.files").countDocuments({}), 1);
            assert.equal(await User.countDocuments(), 2);
        });
        await t.test("deployment smoke CLI checks the actual app without exposing connection values", async () => {
            const output = await promisify(execFile)(process.execPath, ["scripts/check-deployment.js"], { env: { ...process.env, APP_URL: f.origin }, timeout: 15000, windowsHide: true });
            assert.match(output.stdout, /PASS \/health\/ready/); assert.match(output.stdout, /PASS \/demo/); assert.match(output.stdout, /PASS \/admin\/login/);
            assert.ok(!output.stdout.includes(f.origin)); assert.ok(!output.stdout.includes(process.env.MONGO_URI));
        });
        await t.test("quantity request and donor acceptance run with preverified synthetic identities", async () => {
            const ngo = f.client(); await ngo.get("/demo"); await ngo.post("/demo/login", { role: "ngo" }); await ngo.get("/demo");
            const result = await ngo.post(`/ngo/equipment/${f.DEMO_IDS.donation}/requests`, { quantity: "1", beneficiary: "Synthetic demo community", message: "Synthetic equipment need for this demo journey" });
            assert.equal(result.status, 302, result.text);
            const { DonationRequest } = await import("../../src/models/DonationRequest.js");
            const request = await DonationRequest.findOne({ donation: f.DEMO_IDS.donation }); assert.ok(request);
            await guest.get("/demo");
            const accepted = await guest.post(`/donor/requests/${request.id}/accept`, { listingVersion: "0" });
            assert.equal(accepted.status, 302, accepted.text);
            assert.equal((await DonationRequest.findById(request.id)).status, "accepted");
            assert.equal((await Donation.findById(f.DEMO_IDS.donation)).allocatedQuantity, 1);
        });
        await t.test("private synthetic evidence, readiness and persistent worker activity", async () => {
            const ngo = f.client(); await ngo.get("/demo"); await ngo.post("/demo/login", { role: "ngo" });
            const org = await Organization.findById(f.DEMO_IDS.organization);
            const { readPrivateMedia } = await import("../../src/services/privateStorageService.js");
            const bytes = await readPrivateMedia("verification-documents", org.verificationDocument.toObject()); assert.match(bytes.toString(), /SYNTHETIC DEMO ONLY/);
            assert.equal((await ngo.get(`/organizations/${org.id}/verification-document`)).status, 403); // no public demo evidence route
            const ready = await guest.get("/health/ready"); assert.equal(ready.status, 200); assert.ok(!ready.headers.has("set-cookie"));
            let heartbeat;
            for (let attempt = 0; attempt < 30; attempt++) {
                heartbeat = await db.collection("operational_workers").findOne({ lastSuccessAt: { $ne: null }, mailConfigured: false });
                if (heartbeat) break;
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            assert.ok(heartbeat);
        });
        await t.test("normal pickup timing, complete handover and labelled immutable demo receipt", async () => {
            const { DonationRequest } = await import("../../src/models/DonationRequest.js");
            const request = await DonationRequest.findOne({ donation: f.DEMO_IDS.donation });
            const ngo = f.client(); await ngo.get("/demo"); await ngo.post("/demo/login", { role: "ngo" }); await ngo.get("/demo");
            await guest.get("/demo");
            const start = new Date((Math.floor(Date.now() / 60000) + 1) * 60000);
            const base = role => `/${role}/requests/${request.id}/pickup`;
            assert.equal((await guest.post(base("donor") + "/propose", { _version: "0", localStart: start.toISOString().slice(0, 16), localEnd: new Date(start.getTime() + 3600000).toISOString().slice(0, 16), timeZone: "UTC", address: "Synthetic pickup address. No real location." })).status, 302);
            assert.equal((await ngo.post(base("ngo") + "/confirm", { _version: "1" })).status, 302);
            const handover = { _version: "2", quantity: "1", equipmentMatches: "yes", conditionReviewed: "yes", accessoriesExplained: "yes" };
            assert.equal((await guest.post(base("donor") + "/handover", handover)).status, 409);
            // Exercise actual normal timing, without adding a demo bypass or altering data.
            await new Promise(resolve => setTimeout(resolve, Math.max(0, start.getTime() - Date.now()) + 50));
            assert.equal((await guest.post(base("donor") + "/handover", handover)).status, 302);
            const recorded = await DonationRequest.findById(request.id);
            assert.equal((await ngo.post(base("ngo") + "/acknowledge", { _version: "3", quantity: "1", transferId: recorded.fulfillment.transfers[0].id, receiptConfirmed: "yes" })).status, 302);
            assert.equal((await DonationRequest.findById(request.id)).status, "completed");
            const receipt = `/donor/requests/${request.id}/receipt`;
            assert.equal((await guest.post(receipt + "/issue", { _version: "0" })).status, 302);
            const download = await guest.get(receipt + "/download?revision=1");
            assert.equal(download.status, 200); assert.match(download.text, /SYNTHETIC DEMO RECEIPT/);
            assert.equal((await guest.get(receipt + "/download?revision=1")).text, download.text);
            assert.equal((await Donation.findById(f.DEMO_IDS.donation)).handedOverQuantity, 1);
        });
        await t.test("atomic quota is shared, bounded under concurrency and survives reconnect", async () => {
            await db.collection("demo_budgets").updateOne({ _id: f.DEMO_IDS.donor }, { $set: { used: DEMO_WRITE_LIMIT - 2 } });
            const results = await Promise.all(Array.from({ length: 8 }, () => consumeDemoBudget(f.DEMO_IDS.donor)));
            assert.equal(results.filter(Boolean).length, 2);
            await guest.get("/demo");
            assert.equal((await guest.post(`/donations/${f.DEMO_IDS.donation}/withdraw`)).status, 429);
            await f.stopWorker();
            const { disconnectDatabase, connectDatabase } = await import("../../src/config/database.js");
            await disconnectDatabase(); await connectDatabase();
            db = f.mongoose.connection.db;
            assert.equal((await guest.get("/donor/dashboard")).status, 200);
            assert.equal((await Donation.findById(f.DEMO_IDS.donation)).allocatedQuantity, 1);
            assert.equal((await db.collection("demo_budgets").findOne({ _id: f.DEMO_IDS.donor })).used, DEMO_WRITE_LIMIT);
        });
        await t.test("reset refuses wrong confirmation, adopted databases and foreign records", async () => {
            const options = { reset: true, confirmation: f.mongoose.connection.name };
            await assert.rejects(f.prepareDemo(f.mongoose.connection, { ...options, confirmation: "CareCycle" }));
            await assert.rejects(f.prepareDemo(f.mongoose.connection, { confirmation: f.mongoose.connection.name }));
            const foreign = await User.create({ name: "Synthetic foreign account", email: "foreign@example.invalid", password: "unused" });
            await assert.rejects(f.prepareDemo(f.mongoose.connection, options));
            await User.deleteOne({ _id: foreign.id });
            await db.collection("unrelated_records").insertOne({ preserved: true });
            await assert.rejects(f.prepareDemo(f.mongoose.connection, options));
            assert.ok(await db.collection("unrelated_records").findOne({ preserved: true }));
            await db.collection("unrelated_records").drop();
        });
        await t.test("operator reset retains indexes/media, clears activity, revokes sessions and enforces maintenance", async () => {
            const rates = await db.collection("security_limits").countDocuments();
            await f.prepareDemo(f.mongoose.connection, { reset: true, confirmation: f.mongoose.connection.name });
            assert.equal(await Donation.countDocuments(), 1);
            assert.equal((await Donation.findById(f.DEMO_IDS.donation)).allocatedQuantity, 0);
            assert.equal(await db.collection("donation_requests").countDocuments(), 0);
            assert.equal(await db.collection("security_limits").countDocuments(), rates);
            assert.equal((await guest.get("/donor/dashboard")).status, 302);
            assert.equal((await guest.get("/health/ready")).status, 200);
            await db.collection("demo_control").updateOne({ _id: "isolated-demo-v1" }, { $set: { state: "maintenance" } });
            assert.equal((await guest.get("/demo")).status, 503);
            assert.equal((await guest.get("/health/ready")).status, 503);
            assert.equal((await guest.get("/health/live")).status, 200);
            await assert.rejects(promisify(execFile)(process.execPath, ["scripts/check-deployment.js"], { env: { ...process.env, APP_URL: f.origin }, timeout: 15000, windowsHide: true }), error => error.code === 1 && !error.stderr.includes(f.origin));
        });
        await t.test("server shutdown drains its worker and database; subsequent startup remains ready", async () => {
            await db.collection("demo_control").updateOne({ _id: "isolated-demo-v1" }, { $set: { state: "ready" } });
            const { startServer } = await import("../../src/server.js");
            const { connectDatabase } = await import("../../src/config/database.js");
            const running = await startServer();
            try {
                const origin = `http://127.0.0.1:${running.address().port}`;
                assert.equal((await fetch(origin + "/health/ready")).status, 200);
                assert.equal(running.shutdown(), running.shutdown());
                await running.shutdown();
                assert.equal(f.mongoose.connection.readyState, 0);
                await connectDatabase(); db = f.mongoose.connection.db;
                assert.ok(await db.collection("operational_workers").findOne({ status: "stopped" }));
                assert.equal((await guest.get("/health/ready")).status, 200);
            } finally { await running.shutdown(); }
        });
    } finally { await f.close(); }
});
