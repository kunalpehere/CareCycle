import test from "node:test";
import assert from "node:assert/strict";
import { startWorkflowFixture } from "../support/workflow-fixture.js";

test("private receipt snapshots, revisions and outcome workflows", { timeout: 180000 }, async t => {
    const fixture = await startWorkflowFixture();
    const { User, Organization, Donation, DonationRequest, mongoose, client } = fixture;
    let seq = 0, owner, member;
    try {
        const user = role => User.create({ name: `Synthetic ${role}`, email: `day12-${++seq}@example.invalid`, password: "unused-fixture", role });
        const donor = await user("donor"), ngo = await user("ngo"), otherDonor = await user("donor"), otherNgo = await user("ngo"), admin = await user("admin");
        const orgData = actor => ({ owner: actor._id, name: "Synthetic Day 12 Organization", contactPerson: "Private Coordinator", contactEmail: actor.email, description: "Synthetic receipt verification organization", verificationStatus: "verified", address: { city: "Pune", state: "Maharashtra" }, verificationDocument: { filename: "synthetic.pdf", originalName: "synthetic.pdf", mimeType: "application/pdf", size: 1 } });
        const org = await Organization.create(orgData(ngo)); await Organization.create(orgData(otherNgo));
        t.beforeEach(async () => { owner = await client(donor); member = await client(ngo); });
        const match = async () => {
            const item = await Donation.create({ donor: donor._id, equipment: "wheelchair", condition: "good", quantity: 5, allocatedQuantity: 1, handedOverQuantity: 1, description: "Synthetic receipt listing", location: { city: "Pune", state: "Maharashtra" } });
            const at = new Date("2026-01-01T10:00Z"), acknowledgedAt = new Date("2026-01-01T11:00Z");
            const proposal = { start: at, end: acknowledgedAt, localStart: "2026-01-01T10:00", localEnd: "2026-01-01T11:00", timeZone: "UTC", address: "SECRET_DAY12_ADDRESS", instructions: "SECRET_DAY12_COORDINATION", proposedBy: donor._id, proposerRole: "donor" };
            const request = await DonationRequest.create({ donation: item._id, organization: org._id, requestedBy: ngo._id, quantity: 2, status: "completed", handedOverQuantity: 1, acknowledgedQuantity: 1, releasedQuantity: 1,
                beneficiary: "SECRET_DAY12_BENEFICIARY", message: "SECRET_DAY12_NEED_STATEMENT", listingSnapshot: { equipment: "wheelchair", condition: "good", totalQuantity: 5, location: item.location },
                fulfillment: { completedAt: acknowledgedAt, transfers: [{ declaredQuantity: 2, quantity: 1, donor: donor._id, at, checklist: { equipmentMatches: true, conditionReviewed: true, accessoriesExplained: true }, notes: "SECRET_DAY12_HANDOVER", status: "acknowledged", receivedQuantity: 1, receiptNotes: "SECRET_DAY12_RECEIPT_NOTE", acknowledgedBy: ngo._id, acknowledgedAt }] },
                pickup: { status: "acknowledged", version: 6, proposal, history: [{ action: "receipt_resolved", actor: ngo._id, actorRole: "ngo", at: acknowledgedAt, version: 5, proposal, quantity: 1, reason: "SECRET_DAY12_DISCREPANCY" }, { action: "remainder_released", actor: ngo._id, actorRole: "ngo", at: acknowledgedAt, version: 6, proposal, releasedQuantity: 1, reason: "SECRET_DAY12_REMAINDER_REASON" }] } });
            return { item, request };
        };
        const url = (role, records, suffix = "") => `/${role}/requests/${records.request.id}/receipt${suffix ? "/" + suffix : ""}`;
        const read = records => DonationRequest.findById(records.request.id).lean();
        const issue = async records => { assert.equal((await owner.post(url("donor", records, "issue"), { _version: "0" })).status, 302); return read(records); };
        const outcome = (version, note = "Synthetic aggregate mobility use at a community centre") => ({ _version: String(version), outcomeNote: note, aggregateOnly: "yes" });
        const amendment = (version, extra = {}) => ({ _version: String(version), donorName: "Corrected Synthetic Donor", organizationName: "Corrected Synthetic Organization", reason: "Correct a documented spelling error in participant names", aggregateOnly: "yes", ...extra });

        await t.test("only completed reconciled positive NGO receipts can be issued", async () => {
            for (const changes of [{ status: "accepted" }, { fulfillment: null }, { acknowledgedQuantity: 0 }, { "fulfillment.transfers.0.status": "disputed" }]) {
                const records = await match(); await DonationRequest.updateOne({ _id: records.request._id }, { $set: changes });
                assert.equal((await owner.post(url("donor", records, "issue"), { _version: "0" })).status, 409); assert.equal((await read(records)).receipt, null);
            }
        });
        await t.test("concurrent initial issuance persists one stable reference and revision", async () => {
            const records = await match();
            const results = await Promise.all([owner.post(url("donor", records, "issue"), { _version: "0" }), member.post(url("ngo", records, "issue"), { _version: "0" })]);
            assert.deepEqual(results.map(result => result.status).sort(), [302, 409]);
            const saved = await read(records); assert.equal(saved.receipt.revisions.length, 1); assert.equal(saved.receipt.version, 1); assert.equal(saved.receipt.reference, `CC-${records.request.id.toUpperCase()}`);
        });
        await t.test("repeated HTML downloads are byte-identical snapshots excluding private coordination", async () => {
            const records = await match(); const saved = await issue(records);
            const first = await owner.get(url("donor", records, "download") + "?revision=1");
            assert.equal(first.status, 200); assert.doesNotMatch(first.text, /SECRET_DAY12|@example\.invalid/); assert.match(first.text, /Actual quantity acknowledged by the NGO: 1/);
            await User.updateOne({ _id: donor._id }, { $set: { name: "Later Changed Donor Name" } });
            try { assert.deepEqual((await member.get(url("ngo", records, "download") + "?revision=1")).body, first.body); }
            finally { await User.updateOne({ _id: donor._id }, { $set: { name: donor.name } }); }
            assert.equal((await read(records)).receipt.revisions[0].html, saved.receipt.revisions[0].html);
            assert.match(first.headers.get("content-disposition"), /attachment.*-r1\.html/); assert.match(first.headers.get("cache-control"), /private.*no-store/); assert.match(first.headers.get("content-security-policy"), /script-src 'none'/);
        });
        await t.test("guests/foreign participants cannot read documents; active administration is read-only", async () => {
            const records = await match(); await issue(records);
            for (const [actor, role, code] of [[await client(), "donor", 401], [await client(otherDonor), "donor", 404], [await client(otherNgo), "ngo", 404]]) {
                for (const suffix of ["", "document", "download"]) assert.equal((await actor.get(url(role, records, suffix))).status, code);
            }
            const staff = await client(admin); assert.equal((await staff.get(url("admin", records, "download"))).status, 200);
            assert.match((await staff.get("/admin/receipts")).text, /Actual acknowledged quantity: 1/);
            assert.equal((await staff.post(url("admin", records, "outcome"), outcome(1))).status, 403); assert.equal((await staff.post(url("donor", records, "issue"), { _version: "0" })).status, 403);
        });
        await t.test("CSRF, bounds and privacy declarations protect unchanged receipt data", async () => {
            const records = await match(); await issue(records); const before = await read(records);
            assert.equal((await member.post(url("ngo", records, "outcome"), { ...outcome(1), _csrf: "bad" })).status, 403);
            assert.equal((await member.post(url("ngo", records, "outcome"), { ...outcome(1), aggregateOnly: "" })).status, 422);
            assert.equal((await member.post(url("ngo", records, "outcome"), outcome(1, "x".repeat(501)))).status, 422);
            assert.deepEqual(await read(records), before);
        });
        await t.test("only the NGO changes outcome notes and forged quantities/identity are ignored", async () => {
            const records = await match(); await issue(records);
            assert.equal((await owner.post(url("donor", records, "outcome"), outcome(1))).status, 409);
            const initial = (await owner.get(url("donor", records, "download") + "?revision=1")).body;
            assert.equal((await member.post(url("ngo", records, "outcome"), { ...outcome(1), acknowledgedQuantity: "99", donorName: "Forged Donor", reason: "Unvalidated forged reason", actorRole: "admin" })).status, 302);
            const saved = await read(records); assert.equal(saved.receipt.revisions.length, 2); assert.equal(saved.receipt.revisions[1].snapshot.acknowledgedQuantity, 1); assert.equal(saved.receipt.revisions[1].snapshot.donorName, donor.name); assert.equal(saved.receipt.revisions[1].actorRole, "ngo");
            assert.deepEqual((await member.get(url("ngo", records, "download") + "?revision=1")).body, initial);
            assert.equal((await member.post(url("ngo", records, "outcome"), outcome(2))).status, 409);
        });
        await t.test("name corrections publish only after counterparty confirmation and retain both reasons", async () => {
            const records = await match(); await issue(records); const original = (await owner.get(url("donor", records, "document"))).body;
            const fullReason = "R".repeat(500);
            assert.equal((await owner.post(url("donor", records, "amend"), amendment(1, { reason: fullReason, acknowledgedQuantity: "99" }))).status, 302);
            assert.deepEqual((await member.get(url("ngo", records, "document"))).body, original);
            assert.equal((await owner.post(url("donor", records, "confirm"), amendment(2))).status, 409);
            assert.equal((await member.post(url("ngo", records, "confirm"), amendment(2, { reason: "The NGO confirms these participant name corrections" }))).status, 302);
            const saved = await read(records), revision = saved.receipt.revisions[1]; assert.equal(revision.snapshot.donorName, "Corrected Synthetic Donor"); assert.equal(revision.snapshot.acknowledgedQuantity, 1); assert.equal(revision.amendmentEvidence.proposalReason, fullReason); assert.match(revision.amendmentEvidence.confirmationReason, /NGO confirms/);
            assert.deepEqual((await owner.get(url("donor", records, "download") + "?revision=1")).body, original);
        });
        await t.test("only the proposer withdraws a correction; pending proposals cannot be overwritten", async () => {
            const records = await match(); await issue(records); await member.post(url("ngo", records, "amend"), amendment(1));
            assert.equal((await owner.post(url("donor", records, "withdraw"), amendment(2))).status, 409);
            assert.equal((await owner.post(url("donor", records, "amend"), amendment(2))).status, 409);
            assert.equal((await member.post(url("ngo", records, "withdraw"), amendment(2))).status, 302);
            const saved = await read(records); assert.equal(saved.receipt.amendment, null); assert.equal(saved.receipt.revisions.length, 1); assert.equal(saved.receipt.events.length, 3);
        });
        await t.test("concurrent outcome updates or stale correction forms append one revision", async () => {
            const records = await match(); await issue(records);
            const results = await Promise.all([member.post(url("ngo", records, "outcome"), outcome(1, "Synthetic mobility support use")), member.post(url("ngo", records, "outcome"), outcome(1, "Synthetic rehabilitation equipment use"))]);
            assert.deepEqual(results.map(result => result.status).sort(), [302, 409]); assert.equal((await read(records)).receipt.revisions.length, 2);
            assert.equal((await owner.post(url("donor", records, "amend"), amendment(1))).status, 409);
        });
        await t.test("failed revision persistence leaves prior snapshots intact and retry recovers", async () => {
            const records = await match(); await issue(records); const before = await read(records);
            await mongoose.connection.db.command({ collMod: DonationRequest.collection.name, validator: { $expr: { $lte: [{ $size: { $ifNull: ["$receipt.revisions", []] } }, 1] } }, validationLevel: "strict", validationAction: "error" });
            try { assert.equal((await member.post(url("ngo", records, "outcome"), outcome(1))).status, 500); assert.deepEqual(await read(records), before); }
            finally { await mongoose.connection.db.command({ collMod: DonationRequest.collection.name, validator: {} }); }
            assert.equal((await member.post(url("ngo", records, "outcome"), outcome(1))).status, 302);
        });
        await t.test("suspension and revoked verification block saved receipt access", async () => {
            const records = await match(); await issue(records);
            await User.updateOne({ _id: donor._id }, { $set: { status: "suspended" } }); assert.equal((await owner.get(url("donor", records, "download"))).status, 401); await User.updateOne({ _id: donor._id }, { $set: { status: "active" } });
            await Organization.updateOne({ _id: org._id }, { $set: { verificationStatus: "pending" } }); assert.equal((await member.get(url("ngo", records, "download"))).status, 403); await Organization.updateOne({ _id: org._id }, { $set: { verificationStatus: "verified" } });
        });
        await t.test("invalid revision selectors never silently return a different recorded revision", async () => {
            const records = await match(); await issue(records);
            for (const selector of ["0", "-1", "1.5", "99", "bad", "01"]) assert.equal((await owner.get(url("donor", records, "download") + `?revision=${selector}`)).status, 404);
            assert.equal((await owner.get(url("donor", records, "document") + "?revision=1")).status, 200);
            assert.equal((await Donation.findById(records.item.id)).handedOverQuantity, 1); assert.equal((await Donation.findById(records.item.id)).allocatedQuantity, 1);
        });
    } finally { await fixture.close(); }
});
