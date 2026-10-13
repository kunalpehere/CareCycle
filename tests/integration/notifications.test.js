import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { startWorkflowFixture } from "../support/workflow-fixture.js";

test("durable private notification outbox and bounded email delivery", { timeout: 180000 }, async t => {
    const fixture = await startWorkflowFixture();
    const { User, Organization, Donation, DonationRequest, client, mongoose } = fixture;
    const { LifecycleEvent } = await import("../../src/models/LifecycleEvent.js");
    const { Notification } = await import("../../src/models/Notification.js");
    const { processOutboxBatch, recordRequestEvent, recordOrganizationEvent } = await import("../../src/services/notificationService.js");
    const { processEmailBatch, emailRetryDelay } = await import("../../src/services/notificationWorker.js");
    const { runTransaction } = await import("../../src/services/transactionService.js");
    let sequence = 0;
    try {
        const user = role => User.create({ emailVerifiedAt: new Date(), name: `Synthetic ${role}`, email: `day13-${++sequence}@example.invalid`, password: "unused-fixture", role });
        const donor = await user("donor"), ngo = await user("ngo"), stranger = await user("donor"), admin = await user("admin");
        const org = await Organization.create({ owner: ngo._id, name: "Synthetic Day 13 NGO", contactPerson: "Synthetic Coordinator", contactEmail: ngo.email, description: "Synthetic notification organization", verificationStatus: "verified", address: { city: "Pune", state: "Maharashtra" }, verificationDocument: { filename: "synthetic.pdf", originalName: "synthetic.pdf", mimeType: "application/pdf", size: 1 } });
        let owner, member, foreign, listing, request;
        t.beforeEach(async () => {
            await Notification.deleteMany({}); await LifecycleEvent.deleteMany({});
            await User.updateMany({ _id: { $in: [donor._id, ngo._id] } }, { $set: { status: "active", notificationEmailEnabled: false } });
            await Organization.updateOne({ _id: org._id }, { $set: { verificationStatus: "verified" } });
            owner = await client(donor); member = await client(ngo); foreign = await client(stranger);
            listing = await Donation.create({ donor: donor._id, equipment: "wheelchair", condition: "good", quantity: 5, description: "Synthetic Day 13 listing", location: { city: "Pune", state: "Maharashtra" } });
            request = await DonationRequest.create({ donation: listing._id, organization: org._id, requestedBy: ngo._id, status: "pending", quantity: 2, beneficiary: "PRIVATE_DAY13_BENEFICIARY", message: "PRIVATE_DAY13_REQUEST_NEED" });
        });
        const accept = () => owner.post(`/donor/requests/${request.id}/accept`);
        const notice = () => Notification.findOne({ recipient: donor._id }).lean();
        const validator = (collection, reject) => mongoose.connection.db.command({ collMod: collection.collectionName, validator: reject ? { _id: { $exists: false } } : {}, validationLevel: "strict", validationAction: "error" });

        await t.test("request submission records both real owners and excludes private input", async () => {
            await DonationRequest.deleteOne({ _id: request._id });
            assert.equal((await member.post(`/ngo/equipment/${listing.id}/requests`, { quantity: "2", beneficiary: "PRIVATE_DAY13_BENEFICIARY", message: "PRIVATE_DAY13_REQUEST_NEED", recipient: stranger.id })).status, 302);
            const event = await LifecycleEvent.findOne().lean(); assert.equal(event.kind, "request_submitted");
            assert.deepEqual(event.recipients.map(value => String(value.user)).sort(), [donor.id, ngo.id].sort());
            assert.doesNotMatch(JSON.stringify(event), /PRIVATE_DAY13|example.invalid/);
        });
        await t.test("event insertion failure rolls back acceptance and stock; retry succeeds", async () => {
            await validator(LifecycleEvent.collection, true);
            try { assert.equal((await accept()).status, 500); }
            finally { await validator(LifecycleEvent.collection, false); }
            assert.equal((await DonationRequest.findById(request.id)).status, "pending");
            assert.equal((await Donation.findById(listing.id)).allocatedQuantity, 0);
            assert.equal(await LifecycleEvent.countDocuments(), 0);
            assert.equal((await accept()).status, 302); assert.equal(await LifecycleEvent.countDocuments(), 1);
        });
        await t.test("inbox failure cannot reverse committed acceptance and worker retry recovers", async () => {
            assert.equal((await accept()).status, 302);
            await validator(Notification.collection, true);
            try { await assert.rejects(processOutboxBatch()); }
            finally { await validator(Notification.collection, false); }
            assert.equal((await DonationRequest.findById(request.id)).status, "accepted");
            assert.equal((await Donation.findById(listing.id)).allocatedQuantity, 2);
            assert.equal((await LifecycleEvent.findOne()).processedAt, null);
            await Promise.all([processOutboxBatch(), processOutboxBatch()]);
            assert.equal(await Notification.countDocuments(), 2);
            await runTransaction(mongoose.connection, session => recordRequestEvent({ request, kind: "request_accepted", key: "accepted", session }));
            await processOutboxBatch(); assert.equal(await Notification.countDocuments(), 2);
            assert.equal((await accept()).status, 409);
        });
        await t.test("queued events survive separate worker processes and do not duplicate on restart", async () => {
            assert.equal((await accept()).status, 302);
            const script = fileURLToPath(new URL("../../scripts/process-notifications.js", import.meta.url));
            for (let index = 0; index < 2; index++) {
                const result = spawnSync(process.execPath, [script, "--once"], { env: process.env, cwd: fixture.runtime, timeout: 30000, encoding: "utf8" });
                assert.equal(result.status, 0, result.stderr);
            }
            assert.equal(await Notification.countDocuments(), 2); assert.ok((await LifecycleEvent.findOne()).processedAt);
        });
        await t.test("inbox/read/open/preferences enforce ownership, CSRF and current verification", async () => {
            await accept(); await processOutboxBatch(); const row = await notice();
            assert.equal((await foreign.post(`/notifications/${row._id}/read`)).status, 404);
            assert.equal((await foreign.get(`/notifications/${row._id}/open`)).status, 404);
            assert.equal((await owner.post(`/notifications/${row._id}/read`, { _csrf: "forged" })).status, 403);
            assert.equal((await owner.post(`/notifications/${row._id}/read`)).status, 302);
            const readAt = (await notice()).readAt;
            await owner.post(`/notifications/${row._id}/read`); assert.deepEqual((await notice()).readAt, readAt);
            const page = await owner.get("/notifications"); assert.equal(page.status, 200);
            assert.match(page.headers.get("cache-control"), /private.*no-store/); assert.doesNotMatch(page.text, /PRIVATE_DAY13|day13-\d+@/);
            assert.equal((await owner.get(`/notifications/${row._id}/open`)).headers.get("location"), "/donor/requests");
            await owner.post("/notifications/preferences", { email: "enabled", userId: stranger.id });
            assert.equal((await User.findById(donor.id)).notificationEmailEnabled, true);
            assert.equal((await User.findById(stranger.id)).notificationEmailEnabled, false);
            assert.equal((await owner.post("/notifications/preferences", { email: "wrong" })).status, 422);
            const ngoNotice = await Notification.findOne({ recipient: ngo._id });
            await Organization.updateOne({ _id: org._id }, { $set: { verificationStatus: "pending" } });
            assert.equal((await member.get(`/notifications/${ngoNotice.id}/open`)).status, 403);
            await User.updateOne({ _id: donor._id }, { $set: { status: "suspended" } });
            assert.equal((await owner.get("/notifications")).status, 401);
        });
        await t.test("suspended or changed-role recipients are omitted before inbox creation", async () => {
            await accept(); await User.updateOne({ _id: donor._id }, { $set: { status: "suspended" } });
            await User.updateOne({ _id: ngo._id }, { $set: { role: "donor" } });
            try { await processOutboxBatch(); assert.equal(await Notification.countDocuments(), 0); }
            finally { await User.updateOne({ _id: ngo._id }, { $set: { role: "ngo" } }); }
        });
        await t.test("pending NGO members receive verification updates and admins receive application notices", async () => {
            await Organization.updateOne({ _id: org._id }, { $set: { verificationStatus: "pending" } });
            await runTransaction(mongoose.connection, async session => recordOrganizationEvent({ organization: await Organization.findById(org.id).session(session), kind: "organization_submitted", session }));
            await processOutboxBatch();
            assert.equal(await Notification.countDocuments({ recipient: admin._id, kind: "organization_submitted" }), 1);
            assert.match((await member.get("/notifications")).text, /Organization application submitted/);
            const reviewer = await client(admin);
            assert.equal((await reviewer.post(`/admin/organizations/${org.id}/approve`)).status, 302);
            await processOutboxBatch();
            assert.equal(await Notification.countDocuments({ recipient: ngo._id, kind: "organization_verified" }), 1);
            assert.equal((await reviewer.post(`/admin/organizations/${org.id}/approve`)).status, 409);
        });
        await t.test("pickup proposals and confirmations create distinct durable updates", async () => {
            await accept();
            assert.equal((await owner.post(`/donor/requests/${request.id}/pickup/propose`, { _version: "0", localStart: "2090-01-10T10:00", localEnd: "2090-01-10T12:00", timeZone: "Asia/Kolkata", address: "PRIVATE_DAY13_PICKUP_ADDRESS", instructions: "PRIVATE_DAY13_PICKUP_INSTRUCTIONS" })).status, 302);
            assert.equal((await member.post(`/ngo/requests/${request.id}/pickup/confirm`, { _version: "1" })).status, 302);
            await processOutboxBatch();
            assert.deepEqual((await Notification.find({ recipient: donor._id }).lean()).map(row => row.kind).sort(), ["pickup_confirmed", "pickup_proposed", "request_accepted"]);
            assert.doesNotMatch(JSON.stringify(await LifecycleEvent.find().lean()), /PRIVATE_DAY13/);
        });
        await t.test("missing sender consumes no attempts and five fake failures retain inbox and allocation", async () => {
            await User.updateOne({ _id: donor._id }, { $set: { notificationEmailEnabled: true } });
            await accept(); await processOutboxBatch(); let row = await notice(), now = new Date(Date.now() + 1000);
            assert.equal(await processEmailBatch({ now }), 0); assert.equal((await notice()).attempts, 0);
            const sent = [];
            for (let attempt = 1; attempt <= 5; attempt++) {
                assert.equal(await processEmailBatch({ now, send: async mail => { sent.push(mail); throw new Error("PRIVATE_PROVIDER_SECRET"); } }), 1);
                row = await notice(); assert.equal(row.attempts, attempt); now = new Date(now.getTime() + emailRetryDelay(attempt) + 1);
            }
            assert.equal(await processEmailBatch({ now, send: async () => assert.fail("sixth attempt") }), 0);
            assert.equal(row.mailStatus, "failed"); assert.equal(row.failureCode, "delivery_failed");
            assert.equal(new Set(sent.map(mail => mail.messageId)).size, 1);
            assert.doesNotMatch(JSON.stringify(sent) + JSON.stringify(row), /PRIVATE_DAY13|PRIVATE_PROVIDER_SECRET/);
            assert.equal((await Donation.findById(listing.id)).allocatedQuantity, 2);
            assert.match((await owner.get("/notifications")).text, /Equipment request accepted/);
        });
        await t.test("handover, NGO acknowledgement and receipt issue persist separate private updates", async () => {
            await accept();
            const proposal = { start: new Date("2000-01-01T10:00Z"), end: new Date("2000-01-01T12:00Z"), localStart: "2000-01-01T10:00", localEnd: "2000-01-01T12:00", timeZone: "UTC", address: "PRIVATE_DAY13_ADDRESS", instructions: "PRIVATE_DAY13_INSTRUCTIONS", proposedBy: donor._id, proposerRole: "donor" };
            await DonationRequest.updateOne({ _id: request._id }, { $set: { pickup: { status: "confirmed", version: 2, proposal, confirmedBy: ngo._id, confirmedAt: new Date("1999-12-31"), history: [{ action: "confirmed", actor: ngo._id, actorRole: "ngo", at: new Date("1999-12-31"), version: 2, proposal }] } } });
            assert.equal((await owner.post(`/donor/requests/${request.id}/pickup/handover`, { _version: "2", quantity: "2", equipmentMatches: "yes", conditionReviewed: "yes", accessoriesExplained: "yes", notes: "PRIVATE_DAY13_HANDOVER" })).status, 302);
            const transfer = (await DonationRequest.findById(request.id)).fulfillment.transfers[0];
            assert.equal((await member.post(`/ngo/requests/${request.id}/pickup/acknowledge`, { _version: "3", quantity: "2", transferId: String(transfer._id), receiptConfirmed: "yes" })).status, 302);
            assert.equal((await owner.post(`/donor/requests/${request.id}/receipt/issue`, { _version: "0" })).status, 302);
            await processOutboxBatch();
            assert.deepEqual((await Notification.find({ recipient: donor._id }).lean()).map(row => row.kind).sort(), ["acknowledged", "handed_over", "receipt_issued", "request_accepted"]);
            const receiptNotice = await Notification.findOne({ recipient: donor._id, kind: "receipt_issued" });
            assert.equal((await owner.get(`/notifications/${receiptNotice.id}/open`)).headers.get("location"), `/donor/requests/${request.id}/receipt`);
            assert.doesNotMatch(JSON.stringify(await LifecycleEvent.find().lean()), /PRIVATE_DAY13/);
        });
        await t.test("simultaneous workers claim one email and expired crash leases recover", async () => {
            await User.updateOne({ _id: donor._id }, { $set: { notificationEmailEnabled: true } });
            await accept(); await processOutboxBatch(); const row = await notice(); let calls = 0;
            await Promise.all([processEmailBatch({ send: async () => { calls++; } }), processEmailBatch({ send: async () => { calls++; } })]);
            assert.equal(calls, 1); assert.equal((await notice()).mailStatus, "sent");
            const now = new Date();
            await Notification.updateOne({ _id: row._id }, { $set: { mailStatus: "pending", attempts: 1, leaseToken: "crashed-worker", lockedUntil: new Date(now.getTime() - 1), nextAttemptAt: now } });
            assert.equal(await processEmailBatch({ now, send: async () => { calls++; } }), 1);
            assert.equal((await notice()).attempts, 2);
            await Notification.updateOne({ _id: row._id }, { $set: { mailStatus: "pending", attempts: 5, leaseToken: "last-crash", lockedUntil: new Date(now.getTime() - 1) } });
            await processEmailBatch({ now, send: async () => assert.fail("retry after limit") });
            assert.equal((await notice()).mailStatus, "failed");
        });
        await t.test("opt-out and revoked eligibility suppress pending mail before sending", async () => {
            await User.updateMany({ _id: { $in: [donor._id, ngo._id] } }, { $set: { notificationEmailEnabled: true } });
            await accept(); await processOutboxBatch();
            await owner.post("/notifications/preferences", { email: "disabled" });
            await Organization.updateOne({ _id: org._id }, { $set: { verificationStatus: "rejected" } });
            await processEmailBatch({ send: async () => assert.fail("ineligible email") });
            assert.equal(await Notification.countDocuments({ mailStatus: "suppressed" }), 2);
        });
    } finally { await fixture.close(); }
});
