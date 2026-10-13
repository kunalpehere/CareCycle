import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { startWorkflowFixture } from "../support/workflow-fixture.js";

test("database HTTP authorization, privacy and recovery boundaries", { timeout: 180000 }, async t => {
    const fixture = await startWorkflowFixture();
    const { User, Organization, Donation, DonationRequest, mongoose, client } = fixture;
    const documentBytes = Buffer.from("%PDF-1.4\nSYNTHETIC_PRIVATE_EVIDENCE_DAY8\n%%EOF");
    const imageBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1kAAAAASUVORK5CYII=", "base64");
    let sequence = 0;
    try {
        const user = (role, values = {}) => User.create({ emailVerifiedAt: new Date(), name: `Synthetic ${role} ${++sequence}`, email: `day8-${sequence}@example.invalid`, password: "unused-synthetic-fixture", role, ...values });
        const donor = await user("donor"), otherDonor = await user("donor"), ngo = await user("ngo"), otherNgo = await user("ngo"), admin = await user("admin");
        const document = await fixture.saveVerificationDocument({ buffer: documentBytes, size: documentBytes.length, mimetype: "application/pdf", originalname: "synthetic-evidence.pdf" });
        const organization = (owner, values = {}) => Organization.create({ owner: owner._id, name: `Synthetic Organization ${++sequence}`,
            contactPerson: "Private Synthetic Coordinator", contactEmail: `private-org-${sequence}@example.invalid`, phone: "SYNTHETIC_PRIVATE_PHONE",
            description: "Synthetic community organization for regression testing", verificationStatus: "verified", verificationDocument: document,
            address: { city: "Pune", state: "Maharashtra" }, ...values });
        const org = await organization(ngo), otherOrg = await organization(otherNgo);
        const [image] = await fixture.saveDonationImages([{ buffer: imageBytes, size: imageBytes.length, mimetype: "image/png", originalname: "synthetic-pixel.png" }]);
        const listing = (values = {}) => Donation.create({ donor: donor._id, equipment: "walker", condition: "good", quantity: 5,
            description: "Synthetic Day 8 equipment listing", location: { city: "Pune", state: "Maharashtra", postalCode: "411001" }, images: [image], ...values });
        const requestData = (values = {}) => ({ quantity: "2", beneficiary: "SYNTHETIC_PRIVATE_BENEFICIARY_DAY8", message: "SYNTHETIC_PRIVATE_NEED_STATEMENT_DAY8", ...values });
        const pending = (item, ownerOrg = org, values = {}) => DonationRequest.create({ donation: item._id, organization: ownerOrg._id,
            requestedBy: ownerOrg.owner, ...requestData(), ...values });
        const state = async item => ({ listing: await Donation.collection.findOne({ _id: item._id }), requests: await DonationRequest.collection.find({ donation: item._id }).sort({ _id: 1 }).toArray() });
        const assertAccounting = async item => {
            const current = await Donation.findById(item.id).lean();
            const commitments = await DonationRequest.find({ donation: item._id, status: { $in: ["accepted", "completed"] } }).lean();
            assert.equal(current.allocatedQuantity, commitments.reduce((sum, request) => sum + request.quantity, 0));
            assert.ok(current.allocatedQuantity >= 0 && current.allocatedQuantity <= current.quantity);
        };
        const privateMarkers = ["SYNTHETIC_PRIVATE_BENEFICIARY_DAY8", "SYNTHETIC_PRIVATE_NEED_STATEMENT_DAY8", org.contactEmail, "SYNTHETIC_PRIVATE_PHONE", donor.email];
        const assertPrivate = response => { for (const marker of privateMarkers) assert.ok(!response.text.includes(marker), `Unexpected private marker in HTTP ${response.status}`); };

        await t.test("guest, malformed and expired-token reads/writes cannot reach protected records", async () => {
            const item = await listing(), request = await pending(item);
            for (const actor of [await client(), await client(null, { token: "invalid-token" }), await client(null, { token: fixture.expiredToken(donor) })]) {
                for (const url of ["/ngo/requests", "/donor/requests", `/organizations/${org.id}/verification-document`, `/ngo/equipment/${item.id}`]) {
                    const response = await actor.get(url); assert.equal(response.status, 401); assertPrivate(response);
                }
                assert.equal((await actor.post(`/donor/requests/${request.id}/accept`)).status, 401);
            }
            assert.equal((await DonationRequest.findById(request.id)).status, "pending");
            await assertAccounting(item);
        });

        await t.test("foreign donors and participant roles cannot mutate another donor listing", async () => {
            const item = await listing(), request = await pending(item);
            const before = await state(item);
            for (const actor of [await client(otherDonor), await client(ngo), await client(admin)]) {
                for (const url of [`/donations/${item.id}/edit`, `/donations/${item.id}/quantity`]) assert.equal((await actor.get(url)).status, 403);
                for (const [url, values] of [[`/donations/${item.id}/quantity`, { quantity: 1, _version: 0 }], [`/donations/${item.id}/withdraw`, { _version: 0 }], [`/donor/requests/${request.id}/accept`, {}], [`/donor/requests/${request.id}/reject`, { responseNote: "Synthetic rejection reason" }]]) {
                    const response = await actor.post(url, values); assert.equal(response.status, 403); assertPrivate(response);
                }
            }
            assert.deepEqual(await state(item), before);
        });

        await t.test("pending, rejected and absent organization profiles cannot discover/request/cancel", async () => {
            const item = await listing();
            for (const verificationStatus of ["pending", "rejected", "absent"]) {
                const member = await user("ngo");
                const profile = verificationStatus === "absent" ? null : await organization(member, { verificationStatus });
                const request = profile ? await pending(item, profile) : await pending(item);
                const actor = await client(member);
                for (const url of ["/ngo/equipment", "/ngo/requests", `/ngo/equipment/${item.id}`, `/ngo/equipment/${item.id}/images/${image.filename}`]) assert.equal((await actor.get(url)).status, 403);
                assert.equal((await actor.post(`/ngo/equipment/${item.id}/requests`, requestData())).status, 403);
                assert.equal((await actor.post(`/ngo/requests/${request.id}/cancel`)).status, 403);
                if (profile) assert.equal((await actor.get(`/organizations/${profile.id}/verification-document`)).status, 200, "Members can still review their own pending/rejected evidence.");
                assert.equal((await DonationRequest.findById(request.id)).status, "pending");
            }
            await assertAccounting(item);
        });

        await t.test("suspension invalidates existing credentials for donor, NGO and admin actions", async () => {
            const item = await listing(), request = await pending(item);
            const before = await state(item);
            for (const member of [donor, ngo, admin]) {
                const actor = await client(member);
                await User.updateOne({ _id: member._id }, { $set: { status: "suspended" } });
                try {
                    for (const url of ["/ngo/equipment", "/donor/requests", `/organizations/${org.id}/verification-document`, `/donations/images/${image.filename}`]) assert.equal((await actor.get(url)).status, 401);
                    for (const url of [`/donor/requests/${request.id}/accept`, `/ngo/requests/${request.id}/cancel`, `/ngo/equipment/${item.id}/requests`, `/donations/${item.id}/withdraw`]) assert.equal((await actor.post(url, requestData())).status, 401);
                } finally { await User.updateOne({ _id: member._id }, { $set: { status: "active" } }); }
            }
            assert.deepEqual(await state(item), before);
        });

        await t.test("request history and guessed cancellation IDs stay scoped to the owner", async () => {
            const item = await listing(), request = await pending(item);
            const unrelatedNgo = await client(otherNgo), unrelatedDonor = await client(otherDonor);
            assertPrivate(await unrelatedNgo.get(`/ngo/requests?organization=${org.id}`));
            assertPrivate(await unrelatedDonor.get(`/donor/requests?donor=${donor.id}`));
            assert.equal((await unrelatedNgo.post(`/ngo/requests/${request.id}/cancel`)).status, 404);
            assert.equal((await DonationRequest.findById(request.id)).status, "pending");
        });

        await t.test("contact exchange is restricted by request state and matched participant", async () => {
            const item = await listing(), request = await pending(item);
            const owner = await client(donor), member = await client(ngo), outsider = await client(otherNgo);
            const donorBefore = await owner.get("/donor/requests");
            assert.ok(!donorBefore.text.includes(org.contactEmail));
            assert.ok(!(await member.get("/ngo/requests")).text.includes(donor.email));
            assert.equal((await owner.post(`/donor/requests/${request.id}/accept`)).status, 302);
            const matched = await member.get("/ngo/requests");
            assert.ok(matched.text.includes(donor.email));
            assert.match(matched.headers.get("cache-control") || "", /private.*no-store/);
            assert.ok((await owner.get("/donor/requests")).text.includes(org.contactEmail));
            assertPrivate(await outsider.get(`/ngo/equipment/${item.id}`));
            assertPrivate(await outsider.get("/ngo/requests"));
            await assertAccounting(item);
        });

        await t.test("pending/rejected/cancelled history hides contacts and matched legacy states allow them", async () => {
            for (const status of ["pending", "rejected", "cancelled", "accepted", "completed"]) {
                const owner = await user("donor"), member = await user("ngo"), profile = await organization(member);
                const committed = ["accepted", "completed"].includes(status);
                const item = await listing({ donor: owner._id, allocatedQuantity: committed ? 2 : 0, handedOverQuantity: status === "completed" ? 2 : 0 });
                await pending(item, profile, { status });
                const donorView = await (await client(owner)).get("/donor/requests");
                const ngoView = await (await client(member)).get("/ngo/requests");
                assert.equal(donorView.status, 200); assert.equal(ngoView.status, 200);
                assert.equal(donorView.text.includes(profile.contactEmail), committed);
                assert.equal(ngoView.text.includes(owner.email), committed);
                await assertAccounting(item);
            }
        });

        await t.test("private evidence allows only its owner and administrators and is never public-cacheable", async () => {
            let etag;
            for (const member of [ngo, admin]) {
                const response = await (await client(member)).get(`/organizations/${org.id}/verification-document`);
                assert.equal(response.status, 200); assert.deepEqual(response.body, documentBytes);
                assert.match(response.headers.get("cache-control") || "", /private.*no-store/);
                assert.equal(response.headers.get("x-content-type-options"), "nosniff");
                etag = response.headers.get("etag");
            }
            assert.ok(etag, "Use the actual file validator to test conditional access.");
            for (const [member, expected] of [[otherNgo, 403], [donor, 403], [null, 401]]) {
                const response = await (await client(member)).get(`/organizations/${org.id}/verification-document`, { "If-None-Match": etag });
                assert.equal(response.status, expected); assert.ok(!response.text.includes("SYNTHETIC_PRIVATE_EVIDENCE_DAY8"));
            }
            const guest = await client();
            for (const url of [`/uploads/verification-documents/${document.filename}`, `/verification-documents/${document.filename}`]) assert.equal((await guest.get(url)).status, 404);
        });

        await t.test("image access follows ownership, verification and remaining-stock boundaries", async () => {
            const item = await listing();
            const owner = await client(donor), member = await client(otherNgo);
            const ownImage = await owner.get(`/donations/images/${image.filename}`);
            assert.equal(ownImage.status, 200); assert.deepEqual(ownImage.body, imageBytes);
            assert.match(ownImage.headers.get("cache-control") || "", /private.*no-store/);
            assert.equal((await (await client(otherDonor)).get(`/donations/images/${image.filename}`)).status, 404);
            assert.deepEqual((await member.get(`/ngo/equipment/${item.id}/images/${image.filename}`)).body, imageBytes);
            await Donation.updateOne({ _id: item._id }, { $set: { status: "withdrawn" } });
            assert.equal((await member.get(`/ngo/equipment/${item.id}/images/${image.filename}`)).status, 404);
            assert.equal((await owner.get(`/donations/images/${image.filename}`)).status, 200);
            assert.equal((await (await client()).get(`/uploads/donations/${image.filename}`)).status, 404);
        });

        await t.test("CSRF rejection leaves data unchanged and forged identity fields are ignored", async () => {
            const item = await listing(), member = await client(ngo);
            const before = await state(item);
            assert.equal((await member.post(`/ngo/equipment/${item.id}/requests`, requestData({ _csrf: "wrong-token" }))).status, 403);
            assert.deepEqual(await state(item), before);
            assert.equal((await member.post(`/ngo/equipment/${item.id}/requests`, requestData({ organization: otherOrg.id, requestedBy: otherNgo.id, status: "accepted", allocatedQuantity: "99" }))).status, 302);
            const request = await DonationRequest.findOne({ donation: item._id });
            assert.equal(request.organization.toString(), org.id); assert.equal(request.requestedBy.toString(), ngo.id); assert.equal(request.status, "pending");
            await assertAccounting(item);
        });

        await t.test("concurrent HTTP duplicates create one request and preserve capacity", async () => {
            const item = await listing(), member = await client(ngo);
            const responses = await Promise.all([member.post(`/ngo/equipment/${item.id}/requests`, requestData()), member.post(`/ngo/equipment/${item.id}/requests`, requestData())]);
            assert.deepEqual(responses.map(response => response.status).sort(), [302, 409]);
            assert.equal(await DonationRequest.countDocuments({ donation: item._id }), 1);
            await assertAccounting(item);
        });

        await t.test("accept versus cancel through HTTP has one decision and replay preserves metadata", async () => {
            const item = await listing(), request = await pending(item);
            const owner = await client(donor), member = await client(ngo);
            const responses = await Promise.all([owner.post(`/donor/requests/${request.id}/accept`), member.post(`/ngo/requests/${request.id}/cancel`)]);
            assert.deepEqual(responses.map(response => response.status).sort(), [302, 409]);
            const final = await DonationRequest.collection.findOne({ _id: request._id });
            assert.ok(["accepted", "cancelled"].includes(final.status));
            assert.equal((await owner.post(`/donor/requests/${request.id}/accept`)).status, 409);
            assert.equal((await member.post(`/ngo/requests/${request.id}/cancel`)).status, 409);
            assert.deepEqual(await DonationRequest.collection.findOne({ _id: request._id }), final);
            await assertAccounting(item);
        });

        await t.test("failed request insertion rolls back listing touch and a valid retry recovers", async () => {
            const item = await listing(), member = await client(ngo), before = await state(item);
            await mongoose.connection.db.command({ collMod: "donation_requests", validator: { donation: { $ne: item._id } } });
            try { const response = await member.post(`/ngo/equipment/${item.id}/requests`, requestData()); assert.equal(response.status, 500); assertPrivate(response); }
            finally { await mongoose.connection.db.command({ collMod: "donation_requests", validator: {} }); }
            assert.deepEqual(await state(item), before);
            assert.equal((await member.post(`/ngo/equipment/${item.id}/requests`, requestData())).status, 302);
            await assertAccounting(item);
        });

        await t.test("failed sibling resolution rolls back acceptance, reservation and response metadata", async () => {
            const item = await listing({ quantity: 3 }), request = await pending(item), sibling = await pending(item, otherOrg);
            const owner = await client(donor), before = await state(item);
            await mongoose.connection.db.command({ collMod: "donation_requests", validator: { $or: [{ _id: { $ne: sibling._id } }, { status: { $ne: "cancelled" } }] } });
            try { assert.equal((await owner.post(`/donor/requests/${request.id}/accept`)).status, 500); }
            finally { await mongoose.connection.db.command({ collMod: "donation_requests", validator: {} }); }
            assert.deepEqual(await state(item), before);
            assert.equal((await owner.post(`/donor/requests/${request.id}/accept`)).status, 302);
            assert.equal((await DonationRequest.findById(sibling.id)).resolutionReason, "availability_changed");
            await assertAccounting(item);
        });
    } finally {
        await fixture.close();
        await assert.rejects(access(fixture.runtime), { code: "ENOENT" });
        assert.equal(mongoose.connection.readyState, 0);
    }
});
