import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { Donation } from "../../src/models/Donation.js";
import { DonationRequest } from "../../src/models/DonationRequest.js";
import { User } from "../../src/models/User.js";
import { Organization } from "../../src/models/Organization.js";
import { acceptPendingRequest, createPendingRequest } from "../../src/services/matchingService.js";
import { availableListingQuery } from "../../src/services/availabilityService.js";
import { startIsolatedDatabase } from "../support/database.js";
import { createApp } from "../../src/app.js";
import { createAccessToken } from "../../src/services/tokenService.js";
import { updateDonation } from "../../src/controllers/donationController.js";

test("transactional matching and remaining stock on an isolated replica set", { timeout: 180000 }, async t => {
    const database = await startIsolatedDatabase();
    let server;
    try {
        await mongoose.connect(database.getUri(), { dbName: process.env.MONGO_DB_NAME });
        await Promise.all([Donation.init(), DonationRequest.init(), User.init(), Organization.init()]);
        const donor = await User.create({ name: "Synthetic Donor", email: "private-donor@example.invalid", password: "unused-fixture", role: "donor" });
        const otherDonor = await User.create({ name: "Other Donor", email: "other@example.invalid", password: "unused-fixture", role: "donor" });
        const ngo = await User.create({ name: "Synthetic NGO", email: "ngo@example.invalid", password: "unused-fixture", role: "ngo" });
        const organizationId = new mongoose.Types.ObjectId();
        await Organization.collection.insertOne({ _id: organizationId, owner: ngo._id, name: "Synthetic Organization", verificationStatus: "verified",
            contactEmail: "private-org@example.invalid", contactPerson: "Synthetic Coordinator", description: "Synthetic community equipment organization", address: { city: "Pune", state: "Maharashtra" } });
        const listing = (values = {}) => Donation.create({ donor: donor._id, equipment: "walker", condition: "good", quantity: 5,
            description: "Synthetic matching fixture", location: { city: "Pune", state: "Maharashtra" }, ...values });
        const requestData = (item, quantity, organization = new mongoose.Types.ObjectId()) => ({ donation: item._id, quantity,
            organization, requestedBy: ngo._id, beneficiary: "Synthetic beneficiary summary", message: "Synthetic equipment need statement" });
        const pending = (item, quantity) => DonationRequest.create(requestData(item, quantity));
        const accept = request => acceptPendingRequest({ request, donorId: donor._id, respondedBy: donor._id });
        server = createApp().listen(0, "127.0.0.1");
        await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
        const origin = `http://127.0.0.1:${server.address().port}`;
        const get = (path, user = ngo) => fetch(origin + path, { headers: { Cookie: `token=${createAccessToken(user.id)}` }, redirect: "manual" });
        const form = async (path, user = ngo) => {
            const response = await get(path, user);
            const html = await response.text();
            const token = html.match(/name="_csrf" value="([^"]+)"/)?.[1];
            const session = response.headers.getSetCookie().map(cookie => cookie.split(";")[0]).join("; ");
            return { html, token, cookie: `token=${createAccessToken(user.id)}; ${session}` };
        };
        const post = (path, state, values = {}) => fetch(origin + path, { method: "POST", redirect: "manual",
            headers: { Cookie: state.cookie, "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ _csrf: state.token, ...values }) });

        await t.test("partial then full allocation uses persisted request quantity", async () => {
            const item = await listing();
            const first = await pending(item, 2);
            const result = await accept({ _id: first._id, quantity: 99, donation: new mongoose.Types.ObjectId() });
            assert.equal(result.accepted, true);
            assert.equal(result.donation.allocatedQuantity, 2);
            assert.equal(result.donation.status, "available");
            assert.ok(await Donation.exists({ _id: item._id, ...availableListingQuery() }));
            assert.equal((await accept(await pending(item, 3))).accepted, true);
            assert.equal((await Donation.findById(item.id)).allocatedQuantity, 5);
            assert.equal(await Donation.exists({ _id: item._id, ...availableListingQuery() }), null);
            assert.equal((await accept(await pending(item, 1))).reason, "capacity");
        });

        await t.test("competing acceptances cannot exceed total capacity", async () => {
            const item = await listing({ quantity: 3 });
            const requests = await Promise.all([pending(item, 2), pending(item, 2)]);
            const results = await Promise.all(requests.map(accept));
            assert.equal(results.filter(result => result.accepted).length, 1);
            assert.equal((await Donation.findById(item.id)).allocatedQuantity, 2);
            assert.equal(await DonationRequest.countDocuments({ donation: item._id, status: "accepted" }), 1);
        });

        await t.test("simultaneous and repeated acceptance reserve exactly once", async () => {
            const item = await listing();
            const request = await pending(item, 2);
            const results = await Promise.all([accept(request), accept(request), accept(request)]);
            assert.equal(results.filter(result => result.accepted).length, 1);
            assert.equal((await accept(request)).reason, "already_decided");
            assert.equal((await Donation.findById(item.id)).allocatedQuantity, 2);
        });

        await t.test("acceptance racing pending cancellation leaves one consistent outcome", async () => {
            const item = await listing();
            const request = await pending(item, 2);
            await Promise.all([accept(request), DonationRequest.findOneAndUpdate({ _id: request._id, status: "pending" }, { $set: { status: "cancelled" } })]);
            const final = await DonationRequest.findById(request.id);
            assert.ok(["accepted", "cancelled"].includes(final.status));
            assert.equal((await Donation.findById(item.id)).allocatedQuantity, final.status === "accepted" ? 2 : 0);
        });

        await t.test("edit loaded before acceptance cannot overwrite the new commitment", async () => {
            const item = await listing();
            const edit = await form(`/donations/${item.id}/edit`, donor);
            assert.equal((await post(`/donations/${item.id}/edit`, edit, {
                equipment: "walker", condition: "good", quantity: "5", description: "Synthetic normal edit",
                city: "Pune", state: "Maharashtra", postalCode: "411001"
            })).status, 302, "Normal edits without commitments remain usable.");
            assert.equal((await Donation.findById(item.id)).description, "Synthetic normal edit");
            const stale = await Donation.findById(item.id);
            await accept(await pending(item, 2));
            let status;
            const response = { status(code) { status = code; return this; }, send() {} };
            await updateDonation({ ownedDonation: stale, auth: { userId: donor.id }, files: [], body: {
                equipment: "walker", condition: "good", quantity: "1", description: "Synthetic stale edit",
                city: "Pune", state: "Maharashtra", postalCode: "411001"
            } }, response, error => { throw error; });
            assert.equal(status, 409);
            const final = await Donation.findById(item.id);
            assert.equal(final.quantity, 5);
            assert.equal(final.allocatedQuantity, 2);
        });

        await t.test("failed acceptance write rolls back reservation and listing status", async () => {
            const item = await listing({ status: "matched" });
            const request = await pending(item, 2);
            await mongoose.connection.db.command({ collMod: "donation_requests", validator: { status: { $ne: "accepted" } } });
            try { await assert.rejects(accept(request)); }
            finally { await mongoose.connection.db.command({ collMod: "donation_requests", validator: {} }); }
            const unchanged = await Donation.findById(item.id);
            assert.equal(unchanged.allocatedQuantity, 0);
            assert.equal(unchanged.status, "matched");
            assert.equal((await DonationRequest.findById(request.id)).status, "pending");
        });

        await t.test("new requests respect remaining quantity and closed listings", async () => {
            const item = await listing();
            await accept(await pending(item, 2));
            assert.equal(await createPendingRequest(requestData(item, 4)), null);
            assert.ok(await createPendingRequest(requestData(item, 3)));
            for (const status of ["withdrawn", "completed"]) {
                const closed = await listing({ status });
                assert.equal(await createPendingRequest(requestData(closed, 1)), null);
            }
            await accept(await pending(item, 3));
            assert.equal(await createPendingRequest(requestData(item, 1)), null);
        });

        await t.test("request creation versus exhaustion is serialized", async () => {
            const item = await listing({ quantity: 1 });
            const commitment = await pending(item, 1);
            const [accepted, created] = await Promise.all([accept(commitment), createPendingRequest(requestData(item, 1))]);
            assert.equal(accepted.accepted, true);
            // Creation can precede acceptance, but it cannot reserve extra units.
            assert.ok(created === null || created.status === "pending");
            assert.equal((await Donation.findById(item.id)).allocatedQuantity, 1);
            if (created) assert.equal((await accept(created)).reason, "capacity");
        });

        await t.test("HTTP catalogue/detail/form use remaining stock and protect contacts", async () => {
            const item = await listing({ equipment: "wheelchair" });
            await accept(await pending(item, 2));
            const catalogue = await (await get("/ngo/equipment?equipment=wheelchair")).text();
            assert.match(catalogue, /<strong>3<\/strong> available/);
            assert.doesNotMatch(catalogue, /private-donor@example/);
            const detail = await form(`/ngo/equipment/${item.id}`);
            assert.match(detail.html, /max="3"/);
            assert.doesNotMatch(detail.html, /private-donor@example/);
            const invalid = await post(`/ngo/equipment/${item.id}/requests`, detail, { quantity: 4,
                beneficiary: "Synthetic beneficiary summary", message: "Synthetic equipment need statement" });
            assert.equal(invalid.status, 302);
            assert.equal(await DonationRequest.countDocuments({ donation: item._id, organization: organizationId }), 0);
            const valid = await post(`/ngo/equipment/${item.id}/requests`, detail, { quantity: 3,
                beneficiary: "Synthetic beneficiary summary", message: "Synthetic equipment need statement" });
            assert.equal(valid.status, 302);
            const request = await DonationRequest.findOne({ donation: item._id, organization: organizationId });
            assert.equal(request.quantity, 3);
            assert.doesNotMatch(await (await get("/ngo/requests")).text(), /private-donor@example/);
            assert.equal((await accept(request)).accepted, true);
            assert.match(await (await get("/ngo/requests")).text(), /private-donor@example/);
            assert.equal((await get(`/ngo/equipment/${item.id}`)).status, 404);
            assert.equal((await post(`/ngo/equipment/${item.id}/requests`, detail, { quantity: 1 })).status, 409);
        });

        await t.test("foreign donor cannot accept and committed listings cannot be edited or withdrawn", async () => {
            const item = await listing();
            const request = await pending(item, 2);
            assert.equal((await acceptPendingRequest({ request, donorId: otherDonor._id, respondedBy: otherDonor._id })).reason, "ownership");
            assert.equal((await Donation.findById(item.id)).allocatedQuantity, 0);
            const foreign = await form("/donor/requests", otherDonor);
            assert.equal((await post(`/donor/requests/${request.id}/accept`, foreign)).status, 403);
            const state = await form("/donor/requests", donor);
            assert.equal((await post(`/donor/requests/${request.id}/accept`, state)).status, 302);
            assert.equal((await post(`/donor/requests/${request.id}/accept`, state)).status, 409);
            assert.equal((await get(`/donations/${item.id}/edit`, donor)).status, 409);
            assert.equal((await post(`/donations/${item.id}/withdraw`, state)).status, 409);
            assert.equal((await Donation.findById(item.id)).allocatedQuantity, 2);
            await Organization.collection.updateOne({ _id: organizationId }, { $set: { verificationStatus: "pending" } });
            assert.equal((await get("/ngo/equipment")).status, 403);
            await Organization.collection.updateOne({ _id: organizationId }, { $set: { verificationStatus: "verified" } });
            await User.updateOne({ _id: ngo._id }, { $set: { status: "suspended" } });
            assert.equal((await get("/ngo/equipment")).status, 302);
        });
    } finally {
        if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
        await mongoose.disconnect();
        await database.stop();
    }
});
