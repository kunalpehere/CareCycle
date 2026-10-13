import test from "node:test";
import assert from "node:assert/strict";
import { startWorkflowFixture } from "../support/workflow-fixture.js";

test("pickup HTTP/database arrangement boundaries", { timeout: 180000 }, async t => {
    const fixture = await startWorkflowFixture();
    const { User, Organization, Donation, DonationRequest, client } = fixture;
    let sequence = 0;
    try {
        const user = role => User.create({ emailVerifiedAt: new Date(), name: `Synthetic ${role}`, email: `day9-${++sequence}@example.invalid`, password: "unused-fixture", role });
        const donor = await user("donor"), ngo = await user("ngo"), otherDonor = await user("donor"), otherNgo = await user("ngo"), admin = await user("admin");
        const organization = owner => Organization.create({ owner: owner._id, name: "Synthetic Day 9 NGO", contactPerson: "Synthetic Coordinator", contactEmail: owner.email, description: "Synthetic pickup test organization", verificationStatus: "verified", address: { city: "Pune", state: "Maharashtra" }, verificationDocument: { filename: "synthetic.pdf", originalName: "synthetic.pdf", mimeType: "application/pdf", size: 1 } });
        const org = await organization(ngo), otherOrg = await organization(otherNgo);
        const listing = await Donation.create({ donor: donor._id, equipment: "wheelchair", condition: "good", quantity: 5, allocatedQuantity: 4, description: "Synthetic Day 9 listing", location: { city: "Pune", state: "Maharashtra" } });
        const request = (values = {}) => DonationRequest.create({ donation: listing._id, organization: org._id, requestedBy: ngo._id, status: "accepted", quantity: 2, beneficiary: "Synthetic community beneficiaries", message: "Synthetic equipment collection requirement", ...values });
        const match = await request(), second = await request({ organization: otherOrg._id, requestedBy: otherNgo._id });
        let owner = await client(donor), member = await client(ngo);
        t.beforeEach(async () => { owner = await client(donor); member = await client(ngo); });
        const url = (role, record = match) => `/${role}/requests/${record.id}/pickup`;
        const body = (values = {}) => ({ _version: "0", localStart: "2090-01-10T10:00", localEnd: "2090-01-10T12:00", timeZone: "Asia/Kolkata", address: "PRIVATE_DAY9_ADDRESS", instructions: "PRIVATE_DAY9_INSTRUCTIONS", ...values });
        const read = () => DonationRequest.findById(match.id).lean();

        await t.test("accepted legacy requests need no migration and show arrange links", async () => {
            assert.equal((await owner.get(url("donor"))).status, 200);
            assert.equal((await member.get(url("ngo"))).status, 200);
            assert.match((await owner.get("/donor/requests")).text, /Arrange pickup/);
            assert.equal((await read()).pickup, null);
        });
        await t.test("guests, foreign participants and administrators cannot read or mutate plans", async () => {
            for (const [actor, role, status] of [[await client(), "donor", 401], [await client(otherDonor), "donor", 404], [await client(otherNgo), "ngo", 404], [await client(admin), "donor", 403], [member, "donor", 403]]) {
                assert.equal((await actor.get(url(role))).status, status);
                assert.equal((await actor.post(url(role) + "/propose", body())).status, status);
            }
            assert.equal((await read()).pickup, null);
        });
        await t.test("CSRF, version and input validation leave the request unchanged", async () => {
            assert.equal((await owner.post(url("donor") + "/propose", body({ _csrf: "invalid" }))).status, 403);
            for (const values of [{ _version: "-1" }, { _version: "" }]) assert.equal((await owner.post(url("donor") + "/propose", body(values))).status, 409);
            for (const values of [{ localStart: "2000-01-10T10:00" }, { localEnd: "2090-01-10T09:00" }, { timeZone: "Wrong/Zone" }, { address: "x" }, { instructions: "x".repeat(1001) }]) assert.equal((await owner.post(url("donor") + "/propose", body(values))).status, 422);
            assert.equal((await read()).pickup, null);
        });
        await t.test("concurrent proposals write exactly one plan/event and ignore forged actor fields", async () => {
            const results = await Promise.all([owner.post(url("donor") + "/propose", body({ proposedBy: ngo.id, proposerRole: "ngo" })), member.post(url("ngo") + "/propose", body())]);
            assert.deepEqual(results.map(result => result.status).sort(), [302, 409]);
            const saved = await read(); assert.equal(saved.pickup.history.length, 1); assert.equal(saved.pickup.version, 1);
            assert.equal(String(saved.pickup.proposal.proposedBy), saved.pickup.proposal.proposerRole === "donor" ? donor.id : ngo.id);
            assert.equal(saved.pickup.proposal.start.toISOString(), "2090-01-10T04:30:00.000Z");
        });
        await t.test("only the counterparty confirms; concurrent/repeated confirmations cannot duplicate events", async () => {
            const saved = await read(); const donorProposed = saved.pickup.proposal.proposerRole === "donor";
            const proposer = donorProposed ? owner : member, counterparty = donorProposed ? member : owner;
            const proposerRole = donorProposed ? "donor" : "ngo", otherRole = donorProposed ? "ngo" : "donor";
            assert.equal((await proposer.post(url(proposerRole) + "/confirm", { _version: "1" })).status, 409);
            const results = await Promise.all([counterparty.post(url(otherRole) + "/confirm", { _version: "1" }), counterparty.post(url(otherRole) + "/confirm", { _version: "1" })]);
            assert.deepEqual(results.map(result => result.status).sort(), [302, 409]);
            const confirmed = await read(); assert.equal(confirmed.pickup.status, "confirmed"); assert.equal(confirmed.pickup.history.length, 2);
            assert.equal(String(confirmed.pickup.confirmedBy), donorProposed ? ngo.id : donor.id);
        });
        await t.test("rescheduling clears confirmation, retains snapshots and rejects old confirmation forms", async () => {
            assert.equal((await member.post(url("ngo") + "/propose", body({ _version: "2", localStart: "2090-01-11T10:00", localEnd: "2090-01-11T12:00", address: "REVISED_PRIVATE_ADDRESS" }))).status, 302);
            const revised = await read(); assert.equal(revised.pickup.status, "proposed"); assert.equal(revised.pickup.confirmedBy, null); assert.equal(revised.pickup.confirmedAt, null);
            assert.equal(revised.pickup.history.length, 3); assert.equal(revised.pickup.history[0].proposal.address, "PRIVATE_DAY9_ADDRESS");
            assert.equal(revised.pickup.history[2].action, "rescheduled");
            assert.equal((await owner.post(url("donor") + "/confirm", { _version: "2" })).status, 409);
            assert.equal((await owner.post(url("donor") + "/confirm", { _version: "3" })).status, 302);
        });
        await t.test("two NGOs on one listing retain independent plans without changing quantities", async () => {
            const secondMember = await client(otherNgo);
            assert.equal((await secondMember.post(url("ngo", second) + "/propose", body({ address: "SECOND_PRIVATE_ADDRESS" }))).status, 302);
            const secondPage = await secondMember.get(url("ngo", second));
            assert.ok(!secondPage.text.includes("REVISED_PRIVATE_ADDRESS"));
            assert.equal((await read()).pickup.version, 4);
            const current = await Donation.findById(listing.id); assert.equal(current.allocatedQuantity, 4); assert.equal(current.handedOverQuantity, 0); assert.equal(current.quantity, 5);
            assert.match((await member.get(`/ngo/equipment/${listing.id}`)).text, /<dt>Available quantity<\/dt><dd>1<\/dd>/);
        });
        await t.test("coordination is private, escaped and never cacheable", async () => {
            const response = await owner.get(url("donor")); assert.equal(response.status, 200);
            assert.match(response.headers.get("cache-control"), /private.*no-store/); assert.match(response.headers.get("vary"), /Cookie/);
            assert.match(response.text, /REVISED_PRIVATE_ADDRESS/);
            for (const result of [await (await client(otherDonor)).get(url("donor")), await (await client(otherNgo)).get(url("ngo")), await member.get(`/ngo/equipment/${listing.id}`)]) assert.doesNotMatch(result.text, /REVISED_PRIVATE_ADDRESS|PRIVATE_DAY9_INSTRUCTIONS/);
        });
        await t.test("suspension and revoked NGO verification block existing sessions", async () => {
            await User.updateOne({ _id: donor._id }, { $set: { status: "suspended" } });
            assert.equal((await owner.get(url("donor"))).status, 401);
            assert.equal((await owner.post(url("donor") + "/propose", body({ _version: "4" }))).status, 401);
            await User.updateOne({ _id: donor._id }, { $set: { status: "active" } });
            await Organization.updateOne({ _id: org._id }, { $set: { verificationStatus: "pending" } });
            assert.equal((await member.get(url("ngo"))).status, 403);
            assert.equal((await member.post(url("ngo") + "/confirm", { _version: "4" })).status, 403);
            await Organization.updateOne({ _id: org._id }, { $set: { verificationStatus: "verified" } });
            assert.equal((await read()).pickup.version, 4);
        });
        await t.test("nonaccepted requests cannot arrange pickups and past proposals cannot be confirmed", async () => {
            for (const status of ["pending", "rejected", "cancelled", "completed"]) {
                await DonationRequest.updateOne({ _id: match._id }, { $set: { status } });
                assert.equal((await member.get(url("ngo"))).status, 409);
                assert.equal((await owner.post(url("donor") + "/propose", body({ _version: "4" }))).status, 409);
            }
            await DonationRequest.updateOne({ _id: match._id }, { $set: { status: "accepted", "pickup.status": "proposed", "pickup.proposal.proposerRole": "ngo", "pickup.proposal.start": new Date("2000-01-01") } });
            assert.equal((await owner.post(url("donor") + "/confirm", { _version: "4" })).status, 409);
            assert.equal((await owner.post(url("donor") + "/propose", body({ _version: "4" }))).status, 302);
        });
    } finally { await fixture.close(); }
});
