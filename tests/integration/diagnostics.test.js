import test from "node:test";
import assert from "node:assert/strict";
import { startWorkflowFixture } from "../support/workflow-fixture.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

test("Day 23 failure references, private diagnostics, readiness and worker degradation", { timeout: 180000 }, async t => {
    const f = await startWorkflowFixture();
    const lines = [], originalLog = console.log;
    console.log = line => { if (typeof line === "string" && line.startsWith("{")) lines.push(JSON.parse(line)); else originalLog(line); };
    const db = f.mongoose.connection.db;
    const { loadOperationalDiagnostics } = await import("../../src/services/diagnosticsService.js");
    const { processEmailBatch, startNotificationWorker } = await import("../../src/services/notificationWorker.js");
    const { processOutboxBatch } = await import("../../src/services/notificationService.js");
    const { issueAccountCredential } = await import("../../src/services/accountRecoveryService.js");
    let worker;
    const waitFor = async predicate => { for (let i = 0; i < 100; i++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 50)); } throw new Error("Diagnostic state was not published"); };
    try {
        const admin = await f.User.create({ name: "Synthetic Diagnostic Admin", email: "diagnostic-admin@example.invalid", password: "fixture", role: "admin" });
        const donor = await f.User.create({ emailVerifiedAt: new Date(), name: "Synthetic Diagnostic Donor", email: "PRIVATE_diagnostic-donor@example.invalid", password: "fixture", role: "donor", notificationEmailEnabled: true });
        const ngo = await f.User.create({ emailVerifiedAt: new Date(), name: "Synthetic Diagnostic NGO", email: "diagnostic-ngo@example.invalid", password: "fixture", role: "ngo", notificationEmailEnabled: true });
        const org = await f.Organization.create({ owner: ngo._id, name: "Synthetic Diagnostic Organization", contactPerson: "Synthetic Coordinator", contactEmail: ngo.email, description: "Synthetic private diagnostic verification organization", verificationStatus: "verified", verificationDocument: { filename: "synthetic.pdf", originalName: "private.pdf", mimeType: "application/pdf", size: 1 } });
        const owner = await f.client(donor), member = await f.client(ngo), administrator = await f.client(admin), guest = await f.client();
        const item = await f.Donation.create({ donor: donor._id, equipment: "walker", condition: "good", quantity: 1, description: "Synthetic diagnostic listing" });
        const request = await f.DonationRequest.create({ donation: item._id, organization: org._id, requestedBy: ngo._id, quantity: 1, beneficiary: "PRIVATE_DIAGNOSTIC_BENEFICIARY", message: "PRIVATE_DIAGNOSTIC_NEED_TEXT" });

        await t.test("public probes avoid sessions and expose no database/storage internals", async () => {
            const live = await guest.get("/health/live", { "X-Request-ID": "PRIVATE_INJECTED" }), ready = await guest.get("/health/ready");
            assert.equal(live.status, 200); assert.deepEqual(JSON.parse(live.text), { status: "alive" }); assert.deepEqual(JSON.parse(ready.text), { status: "ready" });
            assert.equal(live.headers.get("set-cookie"), null); assert.equal(ready.headers.get("set-cookie"), null); assert.match(live.headers.get("cache-control"), /no-store/);
            assert.match(live.headers.get("x-request-id"), /^[a-f0-9-]{36}$/); assert.doesNotMatch(ready.text, /mongo|collection|private_media|URI|host/);
        });
        await t.test("diagnostics require an active administrator and contain aggregates only", async () => {
            assert.equal((await guest.get("/admin/diagnostics")).status, 401); assert.equal((await owner.get("/admin/diagnostics")).status, 403);
            const response = await administrator.get("/admin/diagnostics"); assert.equal(response.status, 200);
            assert.equal(JSON.parse(response.text).dependencies.ready, true); assert.doesNotMatch(response.text, /PRIVATE_|example.invalid|password|mongoUri/);
            const html = await administrator.get("/admin/diagnostics", { Accept: "text/html" }); assert.match(html.text, /Operational diagnostics/); assert.match(html.headers.get("cache-control"), /private.*no-store/);
        });
        await t.test("a deliberate failure is traceable from its browser reference without leaking input", async () => {
            await db.command({ collMod: "lifecycle_events", validator: { _id: { $exists: false } } });
            let response;
            try { response = await owner.post(`/donor/requests/${request.id}/accept`); }
            finally { await db.command({ collMod: "lifecycle_events", validator: {} }); }
            assert.equal(response.status, 500); const reference = response.headers.get("x-request-id");
            assert.ok(lines.some(line => line.reference === reference && line.event === "request.failed" && line.code === "internal_failure"));
            assert.equal((await f.DonationRequest.findById(request.id)).status, "pending");
            assert.doesNotMatch(JSON.stringify(lines), /PRIVATE_|example.invalid|beneficiary|password|cookie|token=/);
            const missing = await administrator.get("/not-found?token=PRIVATE_SECRET", { Accept: "text/html" });
            assert.equal(missing.status, 404); assert.ok(missing.text.includes(missing.headers.get("x-request-id"))); assert.doesNotMatch(JSON.stringify(lines), /PRIVATE_SECRET/);
        });
        await t.test("missing storage/security indexes make readiness unavailable while liveness stays usable", async () => {
            const storage = db.collection("private_media.chunks");
            await storage.dropIndex("files_id_1_n_1");
            try { const response = await guest.get("/health/ready"); assert.equal(response.status, 503); assert.deepEqual(JSON.parse(response.text), { status: "unavailable" }); assert.equal((await guest.get("/health/live")).status, 200); }
            finally { await storage.createIndex({ files_id: 1, n: 1 }, { unique: true }); }
            await db.collection("security_limits").dropIndex("limit_expiry");
            try { assert.equal((await guest.get("/health/ready")).status, 503); }
            finally { await db.collection("security_limits").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "limit_expiry" }); }
            assert.equal((await guest.get("/health/ready")).status, 200);
        });
        await t.test("email failures are logged and counted without undoing core workflows", async () => {
            assert.equal((await owner.post(`/donor/requests/${request.id}/accept`)).status, 302);
            await processOutboxBatch();
            await processEmailBatch({ send: async () => { throw new Error("PRIVATE_PROVIDER_PASSWORD private@example.invalid"); } });
            const report = await loadOperationalDiagnostics(); assert.ok(report.notifications.retrying > 0); assert.ok(report.metrics.emailFailed > 0);
            assert.equal((await f.DonationRequest.findById(request.id)).status, "accepted"); assert.equal((await member.get("/ngo/requests")).status, 200);
            assert.equal((await guest.get("/health/ready")).status, 200);
            assert.ok(lines.some(line => line.event === "mail.failed" && line.channel === "notification"));
            await issueAccountCredential(donor, "reset", { send: async () => { throw new Error("PRIVATE_RECOVERY_LINK"); } });
            assert.ok(lines.some(line => line.event === "mail.failed" && line.channel === "account"));
            assert.doesNotMatch(JSON.stringify(lines), /PRIVATE_|example.invalid|token=/);
        });
        await t.test("readiness has a response deadline and shares hung probes without accumulating work", async () => {
            const command = db.command.bind(db); let release, calls = 0;
            db.command = (value, options) => value.hello ? (calls++, new Promise(resolve => { release = resolve; })) : command(value, options);
            try {
                const start = Date.now();
                const responses = await Promise.all([guest.get("/health/ready"), guest.get("/health/ready")]);
                assert.ok(responses.every(response => response.status === 503)); assert.equal(calls, 1); assert.ok(Date.now() - start < 5000);
                assert.equal((await guest.get("/health/live")).status, 200);
            } finally { db.command = command; release({ isWritablePrimary: true, setName: "synthetic-replica" }); }
            await new Promise(resolve => setTimeout(resolve, 20));
            assert.equal((await guest.get("/health/ready")).status, 200);
        });
        await t.test("startup failures are correlated and sanitized, and occupied ports close the database client", async () => {
            // Match the application's default bind address/family on Windows.
            const occupied = createServer(); occupied.listen(0); await new Promise(resolve => occupied.once("listening", resolve));
            const entry = fileURLToPath(new URL("../../index.js", import.meta.url));
            try {
                for (const settings of [{ PORT: String(occupied.address().port) }, { JWT_SECRET: "PRIVATE_BAD_CONFIG" }]) {
                    let failure;
                    try { await promisify(execFile)(process.execPath, [entry], { env: { ...process.env, ...settings }, cwd: f.runtime, windowsHide: true, timeout: 30000 }); }
                    catch (error) { failure = error; }
                    assert.equal(failure?.code, 1, failure?.stdout || "Startup probe did not return its expected failure");
                    const record = JSON.parse(failure.stdout.trim()); assert.equal(record.event, "startup.failed"); assert.match(record.reference, /^[a-f0-9-]{36}$/);
                    assert.equal(record.code, settings.JWT_SECRET ? "configuration_invalid" : "startup_failed");
                    assert.doesNotMatch(failure.stdout + failure.stderr, /PRIVATE_|mongodb:|password|Error:/);
                }
            } finally { await new Promise(resolve => occupied.close(resolve)); }
        });
        await t.test("worker heartbeat, stopped and stale instances are observable with disabled mail", async () => {
            worker = startNotificationWorker({ intervalMs: 10000, send: null });
            await waitFor(async () => Boolean((await db.collection("operational_workers").findOne({ status: "idle" }))?.lastSuccessAt));
            let report = await loadOperationalDiagnostics(); assert.ok(report.notifications.workers.some(entry => entry.health === "healthy" && !entry.mailConfigured));
            await worker.stop(); worker = null;
            report = await loadOperationalDiagnostics(); assert.ok(report.notifications.workers.some(entry => entry.health === "stopped"));
            await db.collection("operational_workers").insertOne({ _id: "synthetic-stale", status: "idle", heartbeatAt: new Date(Date.now() - 60000), expiresAt: new Date(Date.now() + 60000) });
            report = await loadOperationalDiagnostics(); assert.ok(report.notifications.workers.some(entry => entry.health === "stale"));
            assert.ok(lines.some(line => line.event === "mail.disabled"));
        });
        await t.test("a failed worker batch is persisted and does not mark core readiness unavailable", async () => {
            await db.collection("lifecycle_events").updateOne({}, { $set: { processedAt: null } });
            await db.collection("notifications").deleteMany({});
            await db.command({ collMod: "notifications", validator: { _id: { $exists: false } } });
            try {
                worker = startNotificationWorker({ intervalMs: 10000, send: null });
                await waitFor(async () => Boolean((await db.collection("operational_workers").findOne({ status: "failed" }))?.lastFailureAt));
                const report = await loadOperationalDiagnostics(); assert.ok(report.notifications.workers.some(entry => entry.health === "degraded")); assert.ok(report.metrics.workerFailures > 0);
                assert.ok(lines.some(line => line.event === "worker.failed" && line.reference));
                assert.equal((await guest.get("/health/ready")).status, 200);
                assert.equal((await f.DonationRequest.findById(request.id)).status, "accepted");
            } finally { await db.command({ collMod: "notifications", validator: {} }); await worker.stop(); worker = null; }
        });
        await t.test("provider acceptance followed by persistence failure is not reported as failed delivery", async () => {
            await processOutboxBatch();
            const before = lines.filter(line => line.event === "mail.failed").length;
            await db.command({ collMod: "notifications", validator: { mailStatus: { $ne: "sent" } } });
            try { await assert.rejects(processEmailBatch({ send: async () => ({ accepted: true }) })); }
            finally { await db.command({ collMod: "notifications", validator: {} }); }
            assert.equal(lines.filter(line => line.event === "mail.failed").length, before);
            assert.ok(lines.some(line => line.event === "mail.sent" && line.channel === "notification"));
            assert.equal((await member.get("/ngo/requests")).status, 200);
        });
        await t.test("database disconnect denies readiness without blocking the live endpoint", async () => {
            await f.mongoose.disconnect(); assert.equal((await guest.get("/health/ready")).status, 503); assert.equal((await guest.get("/health/live")).status, 200);
        });
    } finally { if (worker) await worker.stop(); console.log = originalLog; await f.close(); }
});
