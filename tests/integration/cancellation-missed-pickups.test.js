import test from "node:test";
import assert from "node:assert/strict";
import { startWorkflowFixture } from "../support/workflow-fixture.js";
import { runTransaction } from "../../src/services/transactionService.js";

test("accepted cancellation and missed pickup HTTP/database workflows", { timeout: 180000 }, async t => {
    const fixture = await startWorkflowFixture();
    const { User, Organization, Donation, DonationRequest, mongoose, client } = fixture;
    let seq = 0, owner, member;
    try {
        const user = role => User.create({ emailVerifiedAt: new Date(), name: `Synthetic ${role}`, email: `day10-${++seq}@example.invalid`, password: "unused-fixture", role });
        const donor = await user("donor"), ngo = await user("ngo"), foreignDonor = await user("donor"), foreignNgo = await user("ngo"), admin = await user("admin");
        const orgData = actor => ({ owner: actor._id, name: "Synthetic Day 10 NGO", contactPerson: "Synthetic Coordinator", contactEmail: actor.email, description: "Synthetic collection test organization", verificationStatus: "verified", address: { city: "Pune", state: "Maharashtra" }, verificationDocument: { filename: "synthetic.pdf", originalName: "synthetic.pdf", mimeType: "application/pdf", size: 1 } });
        const org = await Organization.create(orgData(ngo)), foreignOrg = await Organization.create(orgData(foreignNgo));
        t.beforeEach(async () => { owner = await client(donor); member = await client(ngo); });
        const proposal = (future = false) => ({ start: new Date(future ? "2090-01-01T10:00Z" : "2000-01-01T10:00Z"), end: new Date(future ? "2090-01-01T12:00Z" : "2000-01-01T12:00Z"), localStart: future ? "2090-01-01T10:00" : "2000-01-01T10:00", localEnd: future ? "2090-01-01T12:00" : "2000-01-01T12:00", timeZone: "UTC", address: "PRIVATE_DAY10_COLLECTION", instructions: "PRIVATE_DAY10_COORDINATION", proposedBy: donor._id, proposerRole: "donor" });
        const match = async (status = null, future = false) => {
            const item = await Donation.create({ donor: donor._id, equipment: "wheelchair", condition: "good", quantity: 5, allocatedQuantity: 2, description: "Synthetic Day 10 equipment", location: { city: "Pune", state: "Maharashtra" } });
            const request = await DonationRequest.create({ donation: item._id, organization: org._id, requestedBy: ngo._id, quantity: 2, status: "accepted", beneficiary: "Synthetic community beneficiaries", message: "Synthetic collection equipment need", responseNote: "Preserved acceptance note", respondedAt: new Date("2026-01-01"), respondedBy: donor._id,
                pickup: status ? { status, version: 1, proposal: proposal(future), confirmedBy: status === "confirmed" ? ngo._id : null, confirmedAt: status === "confirmed" ? new Date("2000-01-01") : null, history: [{ action: "proposed", actor: donor._id, actorRole: "donor", at: new Date("2000-01-01"), version: 1, proposal: proposal(future) }] } : null });
            return { item, request };
        };
        const url = (role, request, action = "") => `/${role}/requests/${request.id}/pickup${action ? "/" + action : ""}`;
        const body = (version = 0, extra = {}) => ({ _version: String(version), reason: "PRIVATE_DAY10_REASON: collection cannot proceed", noHandover: "yes", ...extra });
        const state = async ({ item, request }) => ({ item: await Donation.collection.findOne({ _id: item._id }), request: await DonationRequest.collection.findOne({ _id: request._id }) });

        await t.test("either participant can cancel an unarranged legacy acceptance and release exactly once", async () => {
            for (const [actor, role] of [[owner, "donor"], [member, "ngo"]]) {
                const records = await match();
                await DonationRequest.collection.updateOne({ _id: records.request._id }, { $unset: { handedOverQuantity: "", pickup: "" } });
                assert.equal((await actor.post(url(role, records.request, "cancel"), body())).status, 302);
                const saved = await state(records); assert.equal(saved.item.allocatedQuantity, 0); assert.equal(saved.item.__v, 1); assert.equal(saved.request.status, "cancelled");
                assert.equal(saved.request.cancellation.releasedQuantity, 2); assert.equal(saved.request.pickup.history.length, 1); assert.equal(saved.request.pickup.proposal, null);
                assert.equal(saved.request.responseNote, "Preserved acceptance note"); assert.equal(saved.request.respondedAt.toISOString(), "2026-01-01T00:00:00.000Z");
                assert.equal((await actor.post(url(role, records.request, "cancel"), body())).status, 409);
                assert.deepEqual(await state(records), saved);
                const history = await actor.get(url(role, records.request)); assert.equal(history.status, 200); assert.match(history.text, /reserved units were released/); assert.doesNotMatch(history.text, /Cancel accepted request|Submit pickup proposal/);
                assert.match((await member.get(`/ngo/equipment/${records.item.id}`)).text, /<dt>Available quantity<\/dt><dd>5<\/dd>/);
            }
        });
        await t.test("foreign roles, guests, CSRF and forged actor/release fields cannot bypass cancellation scope", async () => {
            const records = await match("confirmed"); const before = await state(records);
            for (const [actor, role, code] of [[await client(), "donor", 401], [await client(foreignDonor), "donor", 404], [await client(foreignNgo), "ngo", 404], [await client(admin), "donor", 403]]) {
                assert.equal((await actor.post(url(role, records.request, "cancel"), body(1))).status, code);
            }
            assert.equal((await owner.post(url("donor", records.request, "cancel"), body(1, { _csrf: "bad" }))).status, 403);
            assert.deepEqual(await state(records), before);
            assert.equal((await member.post(url("ngo", records.request, "cancel"), body(1, { actorId: donor.id, actorRole: "donor", releasedQuantity: "99", quantity: "99" }))).status, 302);
            const saved = await state(records); assert.equal(saved.request.cancellation.actorRole, "ngo"); assert.equal(String(saved.request.cancellation.actor), ngo.id); assert.equal(saved.request.cancellation.releasedQuantity, 2);
        });
        await t.test("invalid reasons, missing handover declaration and stale versions leave commitments intact", async () => {
            const records = await match("confirmed"); const before = await state(records);
            for (const extra of [{ reason: "short" }, { reason: "x".repeat(501) }, { noHandover: "" }]) assert.equal((await owner.post(url("donor", records.request, "cancel"), body(1, extra))).status, 422);
            assert.equal((await owner.post(url("donor", records.request, "cancel"), body(0))).status, 409);
            assert.deepEqual(await state(records), before);
        });
        await t.test("simultaneous participant cancellations release one commitment and retain one event", async () => {
            const records = await match("confirmed");
            const results = await Promise.all([owner.post(url("donor", records.request, "cancel"), body(1)), member.post(url("ngo", records.request, "cancel"), body(1))]);
            assert.deepEqual(results.map(response => response.status).sort(), [302, 409]);
            const saved = await state(records); assert.equal(saved.item.allocatedQuantity, 0); assert.equal(saved.request.pickup.history.filter(event => event.action === "cancelled").length, 1);
        });
        await t.test("cancellation reopens exhausted legacy listings and also resolves missed/proposed plans", async () => {
            const exhausted = await match("proposed");
            await Donation.updateOne({ _id: exhausted.item._id }, { $set: { allocatedQuantity: 5, status: "matched" } });
            await DonationRequest.updateOne({ _id: exhausted.request._id }, { $set: { quantity: 5 } });
            assert.equal((await member.get(`/ngo/equipment/${exhausted.item.id}`)).status, 404);
            assert.equal((await owner.post(url("donor", exhausted.request, "cancel"), body(1))).status, 302);
            const saved = await state(exhausted); assert.equal(saved.item.status, "available"); assert.equal(saved.item.allocatedQuantity, 0);
            assert.match((await member.get(`/ngo/equipment/${exhausted.item.id}`)).text, /<dt>Available quantity<\/dt><dd>5<\/dd>/);
            const missed = await match("confirmed");
            assert.equal((await owner.post(url("donor", missed.request, "missed"), body(1))).status, 302);
            assert.equal((await member.post(url("ngo", missed.request, "cancel"), body(2))).status, 302);
            const cancelled = await state(missed); assert.equal(cancelled.item.allocatedQuantity, 0); assert.equal(cancelled.request.pickup.history[1].action, "missed"); assert.equal(cancelled.request.pickup.history[2].action, "cancelled");
        });
        await t.test("missed reports require an ended confirmed window and never release units", async () => {
            for (const [status, future] of [[null, false], ["proposed", false], ["confirmed", true]]) {
                const records = await match(status, future); const before = await state(records);
                assert.equal((await member.post(url("ngo", records.request, "missed"), body(status ? 1 : 0))).status, 409); assert.deepEqual(await state(records), before);
            }
            const records = await match("confirmed");
            assert.equal((await member.post(url("ngo", records.request, "missed"), body(1))).status, 302);
            assert.equal((await member.post(url("ngo", records.request, "missed"), body(1))).status, 409);
            const saved = await state(records); assert.equal(saved.item.allocatedQuantity, 2); assert.equal(saved.request.status, "accepted"); assert.equal(saved.request.pickup.status, "missed"); assert.equal(saved.request.pickup.history.length, 2);
        });
        await t.test("disagreement blocks release/rescheduling; only disputing participant can withdraw it", async () => {
            const records = await match("confirmed");
            assert.equal((await member.post(url("ngo", records.request, "missed"), body(1))).status, 302);
            assert.equal((await member.post(url("ngo", records.request, "dispute"), body(2))).status, 409);
            assert.equal((await owner.post(url("donor", records.request, "dispute"), body(2))).status, 302);
            assert.equal((await member.post(url("ngo", records.request, "resolve"), body(3))).status, 409);
            const before = await state(records);
            assert.equal((await member.post(url("ngo", records.request, "cancel"), body(3))).status, 409);
            const revised = { _version: "3", localStart: "2090-01-02T10:00", localEnd: "2090-01-02T12:00", timeZone: "UTC", address: "Revised synthetic address" };
            assert.equal((await member.post(url("ngo", records.request, "propose"), revised)).status, 409);
            assert.deepEqual(await state(records), before);
            assert.match((await member.get(url("ngo", records.request))).text, /participants disagree|Contact/);
            assert.equal((await owner.post(url("donor", records.request, "resolve"), body(3))).status, 302);
            assert.equal((await member.post(url("ngo", records.request, "propose"), { ...revised, _version: "4" })).status, 302);
            const saved = await state(records); assert.equal(saved.request.pickup.status, "proposed"); assert.equal(saved.request.pickup.confirmedBy, null); assert.equal(saved.request.pickup.missedReport, null); assert.equal(saved.item.allocatedQuantity, 2);
            assert.equal((await member.post(url("ngo", records.request, "confirm"), { _version: "5" })).status, 409);
            assert.equal((await owner.post(url("donor", records.request, "confirm"), { _version: "5" })).status, 302);
        });
        await t.test("cancellation racing rescheduling has one outcome and preserves accounting", async () => {
            const records = await match("confirmed");
            const results = await Promise.all([owner.post(url("donor", records.request, "cancel"), body(1)), member.post(url("ngo", records.request, "propose"), { _version: "1", localStart: "2090-01-02T10:00", localEnd: "2090-01-02T12:00", timeZone: "UTC", address: "Revised synthetic address" })]);
            assert.deepEqual(results.map(response => response.status).sort(), [302, 409]);
            const saved = await state(records); assert.equal(saved.item.allocatedQuantity, saved.request.status === "cancelled" ? 0 : 2); assert.equal(saved.request.pickup.history.length, 2);
        });
        await t.test("failed release rolls back request cancellation/history and retry recovers", async () => {
            const records = await match("confirmed"); const before = await state(records);
            await mongoose.connection.db.command({ collMod: Donation.collection.name, validator: { $expr: { $ne: ["$_id", records.item._id] } }, validationLevel: "strict", validationAction: "error" });
            try { assert.equal((await owner.post(url("donor", records.request, "cancel"), body(1))).status, 500); assert.deepEqual(await state(records), before); }
            finally { await mongoose.connection.db.command({ collMod: Donation.collection.name, validator: {} }); }
            assert.equal((await owner.post(url("donor", records.request, "cancel"), body(1))).status, 302);
            assert.equal((await state(records)).item.allocatedQuantity, 0);
        });
        await t.test("handover evidence blocks release and cancellation racing a synthetic transfer remains consistent", async () => {
            for (const where of ["request", "listing"]) {
                const records = await match();
                if (where === "request") await DonationRequest.updateOne({ _id: records.request._id }, { $set: { handedOverQuantity: 1 } });
                else await Donation.updateOne({ _id: records.item._id }, { $set: { handedOverQuantity: 1 } });
                const before = await state(records); assert.equal((await owner.post(url("donor", records.request, "cancel"), body())).status, 409); assert.deepEqual(await state(records), before);
            }
            const records = await match();
            // Test-only writer establishes the shared request/listing transaction
            // contract for Day 11. This does not add an application handover route.
            const transfer = () => runTransaction(mongoose.connection, async session => {
                const changed = await DonationRequest.findOneAndUpdate({ _id: records.request._id, status: "accepted", pickup: null, handedOverQuantity: 0 }, { $set: { status: "completed", handedOverQuantity: 2 } }, { session });
                if (!changed) return false;
                await Donation.updateOne({ _id: records.item._id }, { $inc: { handedOverQuantity: 2 } }, { session }); return true;
            });
            const [response, transferred] = await Promise.all([owner.post(url("donor", records.request, "cancel"), body()), transfer()]);
            const saved = await state(records);
            assert.equal(saved.item.allocatedQuantity, transferred ? 2 : 0); assert.equal(saved.item.handedOverQuantity, transferred ? 2 : 0);
            assert.equal(saved.request.status, transferred ? "completed" : "cancelled"); assert.equal(response.status, transferred ? 409 : 302);
        });
        await t.test("release racing sibling acceptance preserves independent stock and retry history", async () => {
            const records = await match();
            const sibling = await DonationRequest.create({ donation: records.item._id, organization: foreignOrg._id, requestedBy: foreignNgo._id, quantity: 3, beneficiary: "Synthetic other beneficiaries", message: "Synthetic other equipment collection need" });
            const results = await Promise.all([member.post(url("ngo", records.request, "cancel"), body()), owner.post(`/donor/requests/${sibling.id}/accept`)]);
            assert.ok(results.every(response => response.status === 302));
            const saved = await state(records); assert.equal(saved.item.allocatedQuantity, 3); assert.equal((await DonationRequest.findById(sibling.id)).status, "accepted");
            assert.equal((await member.post(`/ngo/equipment/${records.item.id}/requests`, { quantity: "2", beneficiary: "Synthetic retry beneficiaries", message: "Synthetic retry equipment need statement" })).status, 302);
            assert.equal((await DonationRequest.findById(records.request.id)).status, "cancelled"); assert.equal(await DonationRequest.countDocuments({ donation: records.item._id, organization: org._id }), 2);
        });
        await t.test("private history, suspension and verification gates remain enforced", async () => {
            const records = await match("confirmed");
            assert.equal((await owner.post(url("donor", records.request, "cancel"), body(1))).status, 302);
            const response = await member.get(url("ngo", records.request)); assert.match(response.headers.get("cache-control"), /private.*no-store/); assert.match(response.text, /PRIVATE_DAY10_REASON/);
            assert.doesNotMatch((await (await client(foreignNgo)).get(url("ngo", records.request))).text, /PRIVATE_DAY10/);
            assert.match((await member.get("/ngo/requests")).text, /View collection history/);
            await User.updateOne({ _id: donor._id }, { $set: { status: "suspended" } });
            assert.equal((await owner.post(url("donor", records.request, "cancel"), body(1))).status, 401);
            await User.updateOne({ _id: donor._id }, { $set: { status: "active" } });
            await Organization.updateOne({ _id: org._id }, { $set: { verificationStatus: "pending" } });
            assert.equal((await member.get(url("ngo", records.request))).status, 403);
            await Organization.updateOne({ _id: org._id }, { $set: { verificationStatus: "verified" } });
        });
    } finally { await fixture.close(); }
});
