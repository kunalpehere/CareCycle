import test from "node:test";
import assert from "node:assert/strict";
import { startWorkflowFixture } from "../support/workflow-fixture.js";

test("physical handover, receipt, correction and remainder transactions", { timeout: 180000 }, async t => {
    const fixture = await startWorkflowFixture();
    const { User, Organization, Donation, DonationRequest, mongoose, client } = fixture;
    let sequence = 0, owner, member;
    try {
        const user = role => User.create({ emailVerifiedAt: new Date(), name: `Synthetic ${role}`, email: `day11-${++sequence}@example.invalid`, password: "unused-fixture", role });
        const donor = await user("donor"), ngo = await user("ngo"), otherDonor = await user("donor"), otherNgo = await user("ngo"), admin = await user("admin");
        const orgData = actor => ({ owner: actor._id, name: "Synthetic Day 11 NGO", contactPerson: "Synthetic Coordinator", contactEmail: actor.email, description: "Synthetic handover verification organization", verificationStatus: "verified", address: { city: "Pune", state: "Maharashtra" }, verificationDocument: { filename: "synthetic.pdf", originalName: "synthetic.pdf", mimeType: "application/pdf", size: 1 } });
        const org = await Organization.create(orgData(ngo)), otherOrg = await Organization.create(orgData(otherNgo));
        t.beforeEach(async () => { owner = await client(donor); member = await client(ngo); });
        const match = async (total = 5, quantity = 2) => {
            const item = await Donation.create({ donor: donor._id, equipment: "wheelchair", condition: "good", quantity: total, allocatedQuantity: quantity, description: "Synthetic Day 11 listing", location: { city: "Pune", state: "Maharashtra" } });
            const proposal = { start: new Date("2000-01-01T10:00Z"), end: new Date("2000-01-01T12:00Z"), localStart: "2000-01-01T10:00", localEnd: "2000-01-01T12:00", timeZone: "UTC", address: "PRIVATE_DAY11_ADDRESS", instructions: "PRIVATE_DAY11_COORDINATION", proposedBy: donor._id, proposerRole: "donor" };
            const request = await DonationRequest.create({ donation: item._id, organization: org._id, requestedBy: ngo._id, quantity, status: "accepted", beneficiary: "Synthetic community beneficiaries", message: "Synthetic physical equipment transfer need", pickup: { status: "confirmed", version: 2, proposal, confirmedBy: ngo._id, confirmedAt: new Date("1999-12-31"), history: [{ action: "proposed", actor: donor._id, actorRole: "donor", at: new Date("1999-12-30"), version: 1, proposal }, { action: "confirmed", actor: ngo._id, actorRole: "ngo", at: new Date("1999-12-31"), version: 2, proposal }] } });
            return { item, request };
        };
        const url = (role, records, action = "") => `/${role}/requests/${records.request.id}/pickup${action ? "/" + action : ""}`;
        const hand = (quantity = 2, version = 2) => ({ _version: String(version), quantity: String(quantity), equipmentMatches: "yes", conditionReviewed: "yes", accessoriesExplained: "yes", notes: "PRIVATE_DAY11_HANDOVER_NOTE" });
        const read = records => DonationRequest.findById(records.request.id).lean();
        const raw = async records => ({ request: await DonationRequest.collection.findOne({ _id: records.request._id }), item: await Donation.collection.findOne({ _id: records.item._id }) });
        const receipt = async (records, version = 3, quantity = 2, extra = {}) => ({ _version: String(version), quantity: String(quantity), transferId: String((await read(records)).fulfillment.transfers[0]._id), receiptConfirmed: "yes", ...extra });
        const reason = (version, extra = {}) => ({ _version: String(version), reason: "PRIVATE_DAY11_REASON: agreed resolution of remaining commitment", noFurtherHandover: "yes", ...extra });
        const assertAccounting = async records => {
            const listing = await Donation.findById(records.item.id).lean();
            const requests = await DonationRequest.find({ donation: records.item._id, status: { $in: ["accepted", "completed"] } }).lean();
            assert.equal(listing.allocatedQuantity, requests.reduce((sum, request) => sum + request.quantity - request.releasedQuantity, 0));
            assert.equal(listing.handedOverQuantity, requests.reduce((sum, request) => sum + request.handedOverQuantity, 0));
            assert.ok(listing.handedOverQuantity <= listing.allocatedQuantity && listing.allocatedQuantity <= listing.quantity);
        };

        await t.test("donor records transfer but only NGO acknowledgement completes the request/listing", async () => {
            const records = await match(2);
            assert.equal((await owner.post(url("donor", records, "handover"), hand())).status, 302);
            let saved = await read(records); assert.equal(saved.status, "accepted"); assert.equal(saved.handedOverQuantity, 2); assert.equal(saved.acknowledgedQuantity, 0);
            assert.equal((await Donation.findById(records.item.id)).status, "available");
            assert.equal((await owner.post(url("donor", records, "acknowledge"), await receipt(records))).status, 409);
            assert.equal((await member.post(url("ngo", records, "acknowledge"), await receipt(records))).status, 302);
            saved = await read(records); assert.equal(saved.status, "completed"); assert.equal(saved.acknowledgedQuantity, 2); assert.ok(saved.fulfillment.completedAt);
            assert.equal((await Donation.findById(records.item.id)).status, "completed");
            assert.equal((await member.get(url("ngo", records))).status, 200); await assertAccounting(records);
        });
        await t.test("wrong actors, foreign IDs, CSRF, forged quantities and checklists are rejected", async () => {
            const records = await match(); const before = await raw(records);
            for (const [actor, role, status] of [[member, "ngo", 409], [await client(otherDonor), "donor", 404], [await client(otherNgo), "ngo", 404], [await client(admin), "donor", 403], [await client(), "donor", 401]]) assert.equal((await actor.post(url(role, records, "handover"), hand())).status, status);
            assert.equal((await owner.post(url("donor", records, "handover"), { ...hand(), _csrf: "bad" })).status, 403);
            assert.equal((await owner.post(url("donor", records, "handover"), { ...hand(), conditionReviewed: "no" })).status, 422);
            assert.equal((await owner.post(url("donor", records, "handover"), hand(3))).status, 409);
            assert.deepEqual(await raw(records), before);
            assert.equal((await owner.post(url("donor", records, "handover"), { ...hand(), actorRole: "ngo", acknowledgedQuantity: "2", status: "completed" })).status, 302);
            assert.equal((await read(records)).status, "accepted");
        });
        await t.test("only confirmed started windows permit transfer, and duplicate handovers cannot count twice", async () => {
            const records = await match();
            await DonationRequest.updateOne({ _id: records.request._id }, { $set: { "pickup.proposal.start": new Date("2090-01-01") } });
            assert.equal((await owner.post(url("donor", records, "handover"), hand())).status, 409);
            await DonationRequest.updateOne({ _id: records.request._id }, { $set: { "pickup.proposal.start": new Date("2000-01-01") } });
            const results = await Promise.all([owner.post(url("donor", records, "handover"), hand()), owner.post(url("donor", records, "handover"), hand())]);
            assert.deepEqual(results.map(response => response.status).sort(), [302, 409]);
            assert.equal((await read(records)).fulfillment.transfers.length, 1); await assertAccounting(records);
        });
        await t.test("partial handover retains remaining stock and can continue through a freshly confirmed pickup", async () => {
            const records = await match();
            assert.equal((await owner.post(url("donor", records, "handover"), hand(1))).status, 302);
            assert.equal((await member.post(url("ngo", records, "acknowledge"), await receipt(records, 3, 1))).status, 302);
            let saved = await read(records); assert.equal(saved.status, "accepted"); assert.equal(saved.handedOverQuantity, 1);
            assert.equal((await Donation.findById(records.item.id)).allocatedQuantity, 2);
            assert.match((await member.get(`/ngo/equipment/${records.item.id}`)).text, /<dt>Available quantity<\/dt><dd>3<\/dd>/);
            assert.equal((await member.post(url("ngo", records, "propose"), { _version: "4", localStart: "2090-01-01T10:00", localEnd: "2090-01-01T12:00", timeZone: "UTC", address: "Another private collection address" })).status, 302);
            assert.equal((await owner.post(url("donor", records, "confirm"), { _version: "5" })).status, 302);
            await DonationRequest.updateOne({ _id: records.request._id }, { $set: { "pickup.proposal.start": new Date("2000-01-01") } });
            assert.equal((await owner.post(url("donor", records, "handover"), hand(1, 6))).status, 302);
            saved = await read(records);
            assert.equal((await member.post(url("ngo", records, "acknowledge"), { _version: "7", quantity: "1", transferId: String(saved.fulfillment.transfers[1]._id), receiptConfirmed: "yes" })).status, 302);
            assert.equal((await read(records)).status, "completed"); await assertAccounting(records);
        });
        await t.test("acknowledgement count must match and concurrent receipts cannot duplicate completion", async () => {
            const records = await match(); await owner.post(url("donor", records, "handover"), hand());
            assert.equal((await member.post(url("ngo", records, "acknowledge"), await receipt(records, 3, 1))).status, 409);
            const values = await receipt(records);
            const results = await Promise.all([member.post(url("ngo", records, "acknowledge"), values), member.post(url("ngo", records, "acknowledge"), values)]);
            assert.deepEqual(results.map(response => response.status).sort(), [302, 409]);
            assert.equal((await read(records)).pickup.history.filter(event => event.action === "acknowledged").length, 1); await assertAccounting(records);
        });
        await t.test("discrepancy retains reservations and both original quantity claims until NGO confirms correction", async () => {
            const records = await match(); await owner.post(url("donor", records, "handover"), hand());
            assert.equal((await member.post(url("ngo", records, "receipt-dispute"), await receipt(records, 3, 1, { reason: "PRIVATE_DAY11_DISCREPANCY: one unit received in agreed condition" }))).status, 302);
            assert.equal((await owner.post(url("donor", records, "cancel"), { _version: "4", reason: "Should not release disputed transfers", noHandover: "yes" })).status, 409);
            assert.equal((await member.post(url("ngo", records, "remainder-propose"), reason(4))).status, 409);
            assert.equal((await owner.post(url("donor", records, "resolution-propose"), await receipt(records, 4, 1, { reason: "Agree one unit physically transferred; condition issue resolved" }))).status, 302);
            assert.equal((await owner.post(url("donor", records, "resolution-confirm"), await receipt(records, 5, 1, { reason: "Donor cannot acknowledge on behalf of NGO" }))).status, 409);
            assert.equal((await member.post(url("ngo", records, "resolution-confirm"), await receipt(records, 5, 1, { reason: "Confirm receipt and the documented condition resolution" }))).status, 302);
            const saved = await read(records); assert.equal(saved.fulfillment.transfers[0].declaredQuantity, 2); assert.equal(saved.fulfillment.transfers[0].quantity, 1); assert.equal(saved.handedOverQuantity, 1); assert.equal(saved.acknowledgedQuantity, 1); assert.equal(saved.status, "accepted");
            assert.equal((await Donation.findById(records.item.id)).allocatedQuantity, 2); await assertAccounting(records);
        });
        await t.test("receipt-dispute versus acknowledgement races preserve one receipt outcome", async () => {
            const records = await match(); await owner.post(url("donor", records, "handover"), hand()); const values = await receipt(records);
            const results = await Promise.all([member.post(url("ngo", records, "acknowledge"), values), member.post(url("ngo", records, "receipt-dispute"), { ...values, reason: "Equipment condition requires documented resolution" })]);
            assert.deepEqual(results.map(response => response.status).sort(), [302, 409]); await assertAccounting(records);
        });
        await t.test("agreed upward and zero corrections retain original claims and bounded physical totals", async () => {
            for (const [declared, actual] of [[1, 2], [2, 0]]) {
                const records = await match(); await owner.post(url("donor", records, "handover"), hand(declared));
                await member.post(url("ngo", records, "receipt-dispute"), await receipt(records, 3, actual, { reason: "Both participants need to reconcile the physical count" }));
                assert.equal((await owner.post(url("donor", records, "resolution-propose"), await receipt(records, 4, 3, { reason: "This proposed quantity exceeds the accepted commitment" }))).status, 409);
                assert.equal((await owner.post(url("donor", records, "resolution-propose"), await receipt(records, 4, actual, { reason: "Agree to correct the original physical transfer claim" }))).status, 302);
                assert.equal((await member.post(url("ngo", records, "resolution-confirm"), await receipt(records, 5, actual, { reason: "Confirm the corrected actual receipt count and condition" }))).status, 302);
                const saved = await read(records); assert.equal(saved.fulfillment.transfers[0].declaredQuantity, declared); assert.equal(saved.handedOverQuantity, actual); assert.equal(saved.acknowledgedQuantity, actual); await assertAccounting(records);
                if (actual === 0) {
                    assert.equal((await owner.post(url("donor", records, "cancel"), { _version: "6", reason: "Both participants confirmed no physical transfer occurred", noHandover: "yes" })).status, 302);
                    assert.equal((await Donation.findById(records.item.id)).allocatedQuantity, 0); await assertAccounting(records);
                }
            }
        });
        await t.test("a fully transferred listing completes only after every NGO acknowledges its own units", async () => {
            const records = await match(2, 1);
            await Donation.updateOne({ _id: records.item._id }, { $inc: { allocatedQuantity: 1 } });
            const first = await read(records);
            const sibling = await DonationRequest.create({ donation: records.item._id, organization: otherOrg._id, requestedBy: otherNgo._id, quantity: 1, status: "accepted", beneficiary: "Other synthetic receiving beneficiaries", message: "Other synthetic one unit handover request", pickup: { ...first.pickup, history: first.pickup.history, confirmedBy: otherNgo._id } });
            const second = { item: records.item, request: sibling }, otherMember = await client(otherNgo);
            assert.equal((await owner.post(url("donor", records, "handover"), hand(1))).status, 302);
            assert.equal((await member.post(url("ngo", records, "acknowledge"), await receipt(records, 3, 1))).status, 302);
            assert.equal((await owner.post(url("donor", second, "handover"), hand(1))).status, 302);
            assert.equal((await Donation.findById(records.item.id)).status, "available");
            assert.equal((await member.post(url("ngo", second, "acknowledge"), await receipt(second, 3, 1))).status, 404);
            assert.equal((await otherMember.post(url("ngo", second, "acknowledge"), await receipt(second, 3, 1))).status, 302);
            assert.equal((await Donation.findById(records.item.id)).status, "completed"); await assertAccounting(records);
        });
        await t.test("partial remainder release requires the counterparty and preserves actual transfers", async () => {
            const records = await match(); await owner.post(url("donor", records, "handover"), hand(1)); await member.post(url("ngo", records, "acknowledge"), await receipt(records, 3, 1));
            assert.equal((await owner.post(url("donor", records, "remainder-propose"), reason(4))).status, 302);
            assert.equal((await owner.post(url("donor", records, "remainder-confirm"), reason(5))).status, 409);
            assert.equal((await member.post(url("ngo", records, "remainder-propose"), reason(5))).status, 409);
            assert.equal((await member.post(url("ngo", records, "propose"), { _version: "5", localStart: "2090-01-01T10:00", localEnd: "2090-01-01T12:00", timeZone: "UTC", address: "Cannot overwrite pending release" })).status, 409);
            const values = reason(5); const results = await Promise.all([member.post(url("ngo", records, "remainder-confirm"), values), member.post(url("ngo", records, "remainder-confirm"), values)]);
            assert.deepEqual(results.map(response => response.status).sort(), [302, 409]);
            const saved = await read(records); assert.equal(saved.quantity, 2); assert.equal(saved.releasedQuantity, 1); assert.equal(saved.handedOverQuantity, 1); assert.equal(saved.status, "completed");
            assert.equal((await Donation.findById(records.item.id)).allocatedQuantity, 1); await assertAccounting(records);
        });
        await t.test("release proposer can withdraw; the other participant cannot erase the proposal", async () => {
            const records = await match(); await owner.post(url("donor", records, "handover"), hand(1)); await member.post(url("ngo", records, "acknowledge"), await receipt(records, 3, 1));
            await member.post(url("ngo", records, "remainder-propose"), reason(4));
            assert.equal((await owner.post(url("donor", records, "remainder-withdraw"), reason(5))).status, 409);
            assert.equal((await member.post(url("ngo", records, "remainder-withdraw"), reason(5))).status, 302);
            assert.equal((await read(records)).fulfillment.remainderProposal, null); await assertAccounting(records);
        });
        await t.test("real cancellation versus handover transactions preserve exactly one consistent outcome", async () => {
            const records = await match();
            const results = await Promise.all([owner.post(url("donor", records, "handover"), hand()), member.post(url("ngo", records, "cancel"), { _version: "2", reason: "Synthetic cancellation racing physical record", noHandover: "yes" })]);
            assert.deepEqual(results.map(response => response.status).sort(), [302, 409]);
            const saved = await read(records); assert.equal((await Donation.findById(records.item.id)).handedOverQuantity, saved.handedOverQuantity); await assertAccounting(records);
        });
        await t.test("failed handover/listing and failed acknowledgement/listing writes roll back both records", async () => {
            const records = await match();
            const rejectListing = () => mongoose.connection.db.command({ collMod: Donation.collection.name, validator: { $expr: { $ne: ["$_id", records.item._id] } }, validationLevel: "strict", validationAction: "error" });
            let before = await raw(records); await rejectListing();
            try { assert.equal((await owner.post(url("donor", records, "handover"), hand())).status, 500); assert.deepEqual(await raw(records), before); }
            finally { await mongoose.connection.db.command({ collMod: Donation.collection.name, validator: {} }); }
            assert.equal((await owner.post(url("donor", records, "handover"), hand())).status, 302);
            before = await raw(records); await rejectListing();
            try { assert.equal((await member.post(url("ngo", records, "acknowledge"), await receipt(records))).status, 500); assert.deepEqual(await raw(records), before); }
            finally { await mongoose.connection.db.command({ collMod: Donation.collection.name, validator: {} }); }
            assert.equal((await member.post(url("ngo", records, "acknowledge"), await receipt(records))).status, 302); await assertAccounting(records);
        });
        await t.test("sibling cancellation after a reconciled transfer does not release transferred units", async () => {
            const records = await match(); await owner.post(url("donor", records, "handover"), hand()); await member.post(url("ngo", records, "acknowledge"), await receipt(records));
            await Donation.updateOne({ _id: records.item._id }, { $inc: { allocatedQuantity: 1 } });
            const sibling = await DonationRequest.create({ donation: records.item._id, organization: otherOrg._id, requestedBy: otherNgo._id, quantity: 1, status: "accepted", beneficiary: "Other synthetic beneficiaries", message: "Another synthetic equipment need" });
            assert.equal((await owner.post(`/donor/requests/${sibling.id}/pickup/cancel`, { _version: "0", reason: "Only the untouched sibling commitment is cancelled", noHandover: "yes" })).status, 302);
            const listing = await Donation.findById(records.item.id); assert.equal(listing.handedOverQuantity, 2); assert.equal(listing.allocatedQuantity, 2); await assertAccounting(records);
        });
        await t.test("legacy unreconciled accounting and pending receipt withdrawal fail closed", async () => {
            const records = await match(); await Donation.updateOne({ _id: records.item._id }, { $set: { handedOverQuantity: 1 } }); const before = await raw(records);
            assert.equal((await owner.post(url("donor", records, "handover"), hand())).status, 409); assert.deepEqual(await raw(records), before);
            const full = await match(2); await owner.post(url("donor", full, "handover"), hand());
            const listing = await Donation.findById(full.item.id);
            assert.equal((await owner.post(`/donations/${full.item.id}/withdraw`, { _version: String(listing.__v) })).status, 409);
        });
        await t.test("private transfer history and suspension/verification gates remain enforced", async () => {
            const records = await match(); await owner.post(url("donor", records, "handover"), hand());
            const response = await member.get(url("ngo", records)); assert.equal(response.status, 200); assert.match(response.text, /PRIVATE_DAY11_HANDOVER_NOTE/); assert.match(response.headers.get("cache-control"), /private.*no-store/);
            for (const [actor, role] of [[await client(otherDonor), "donor"], [await client(otherNgo), "ngo"]]) assert.doesNotMatch((await actor.get(url(role, records))).text, /PRIVATE_DAY11/);
            await User.updateOne({ _id: donor._id }, { $set: { status: "suspended" } }); assert.equal((await owner.post(url("donor", records, "handover"), hand())).status, 401); await User.updateOne({ _id: donor._id }, { $set: { status: "active" } });
            await Organization.updateOne({ _id: org._id }, { $set: { verificationStatus: "pending" } }); assert.equal((await member.post(url("ngo", records, "acknowledge"), await receipt(records))).status, 403); await Organization.updateOne({ _id: org._id }, { $set: { verificationStatus: "verified" } });
        });
    } finally { await fixture.close(); }
});
