import test from "node:test";
import assert from "node:assert/strict";
import { startWorkflowFixture } from "../support/workflow-fixture.js";

test("Day 20 accountable moderation and private exception review", { timeout: 180000 }, async t => {
    const f = await startWorkflowFixture();
    try {
        const { AuditLog } = await import("../../src/models/AuditLog.js");
        const { moderateUser, moderateListing } = await import("../../src/services/adminReviewService.js");
        const { acceptPendingRequest, createPendingRequest } = await import("../../src/services/matchingService.js");
        const { changeListing } = await import("../../src/services/listingPolicyService.js");
        await AuditLog.init(); let seq = 0;
        const user = role => f.User.create({ name: `Synthetic ${role} Review ${++seq}`, email: `review20-${seq}@example.invalid`, password: "fixture", role, emailVerifiedAt: new Date() });
        const setup = async () => {
            const donor = await user("donor"), member = await user("ngo"), admin = await user("admin");
            const listing = await f.Donation.create({ donor: donor._id, equipment: "walker", condition: "good", quantity: 5, allocatedQuantity: 2, description: "Synthetic listing review", location: { city: "Review20" } });
            const bytes = Buffer.from("%PDF-1.4\nSYNTHETIC_PRIVATE_REVIEW20\n%%EOF");
            const document = await f.saveVerificationDocument({ buffer: bytes, size: bytes.length, mimetype: "application/pdf", originalname: "synthetic20.pdf" });
            const org = await f.Organization.create({ owner: member._id, name: `Synthetic Review NGO ${seq}`, contactPerson: "Synthetic Coordinator", contactEmail: member.email, description: "Synthetic private organization review fixture", verificationStatus: "verified", verificationDocument: document });
            const request = await f.DonationRequest.create({ donation: listing._id, organization: org._id, requestedBy: member._id, quantity: 2, status: "accepted", beneficiary: "PRIVATE_BENEFICIARY_REVIEW20", message: "PRIVATE_NEED_REVIEW20_INFORMATION" });
            return { donor, member, admin, listing, request, org, reviewer: await f.client(admin) };
        };
        await t.test("suspension/reinstatement are atomic, audited, versioned and do not resurrect old cookies", async () => {
            const { donor, admin, listing, request, reviewer } = await setup(); const old = await f.client(donor);
            const body = { _version: "0", reason: "Synthetic accountable suspension reason" };
            assert.equal((await reviewer.post(`/admin/users/${donor.id}/suspended`, body)).status, 302);
            assert.equal((await reviewer.post(`/admin/users/${donor.id}/suspended`, body)).status, 409);
            assert.equal(await AuditLog.countDocuments({ targetId: donor._id }), 1);
            assert.equal((await f.Donation.findById(listing.id)).allocatedQuantity, 2);
            assert.equal((await f.DonationRequest.findById(request.id)).status, "accepted");
            assert.equal((await old.get("/donor/dashboard")).status, 401);
            const exceptions = await reviewer.get("/admin/exceptions?status=suspended");
            assert.equal(exceptions.status, 200); assert.match(exceptions.text, new RegExp(request.id));
            assert.ok(!exceptions.text.includes("PRIVATE_BENEFICIARY_REVIEW20"));
            assert.equal((await reviewer.post(`/admin/users/${donor.id}/active`, { _version: "1", reason: "Synthetic reviewed reactivation reason" })).status, 302);
            assert.equal((await old.get("/donor/dashboard")).status, 401);
            assert.equal((await f.Donation.findById(listing.id)).donorSuspended, false);
            assert.equal(await AuditLog.countDocuments({ targetId: donor._id }), 2);
            const fresh = await f.client(await f.User.findById(donor.id)); assert.equal((await fresh.get("/donor/dashboard")).status, 200);
        });
        await t.test("audit failure rolls back suspension and listing gates", async () => {
            const { donor, admin, listing } = await setup();
            await f.mongoose.connection.db.command({ collMod: AuditLog.collection.name, validator: { action: { $ne: "user.suspended" } }, validationLevel: "strict", validationAction: "error" });
            try { await assert.rejects(moderateUser({ userId: donor.id, actorId: admin.id, status: "suspended", version: 0, reason: "Synthetic rollback suspension reason" })); }
            finally { await f.mongoose.connection.db.command({ collMod: AuditLog.collection.name, validator: {} }); }
            const unchanged = await f.User.findById(donor.id);
            assert.equal(unchanged.status, "active"); assert.equal(unchanged.authVersion, 0);
            assert.equal((await f.Donation.findById(listing.id)).donorSuspended, false);
            assert.equal(await AuditLog.countDocuments({ targetId: donor._id }), 0);
        });
        await t.test("listing hide/restore gates discovery and new acceptance without changing commitments", async () => {
            const { donor, member, admin, listing, request, org, reviewer } = await setup(); const ngo = await f.client(member);
            assert.equal((await reviewer.post(`/admin/listings/${listing.id}/hidden`, { _version: "0", reason: "Synthetic listing evidence requires review", status: "completed", quantity: "100" })).status, 302);
            assert.equal((await ngo.get(`/ngo/equipment/${listing.id}`)).status, 404);
            assert.equal((await f.Donation.findById(listing.id)).quantity, 5);
            assert.equal((await f.Donation.findById(listing.id)).status, "available");
            assert.equal((await f.DonationRequest.findById(request.id)).status, "accepted");
            assert.equal((await ngo.get(`/ngo/requests/${request.id}/pickup`)).status, 200);
            assert.equal(await createPendingRequest({ donation: listing._id, organization: new f.mongoose.Types.ObjectId(), requestedBy: member._id, quantity: 1, beneficiary: "Synthetic beneficiary summary", message: "Synthetic need statement for moderation" }), null);
            assert.equal((await reviewer.post(`/admin/listings/${listing.id}/visible`, { _version: "1", reason: "Synthetic reviewed equipment declarations" })).status, 302);
            assert.equal((await ngo.get(`/ngo/equipment/${listing.id}`)).status, 200);
            const owner = await f.client(donor); assert.equal((await owner.get("/donor/dashboard")).status, 200);
        });
        await t.test("competing hide/accept and suspend/accept preserve one serial outcome and accounting", async () => {
            for (const mode of ["hide", "suspend"]) {
                const { donor, member, admin, listing, org } = await setup();
                const otherOrg = new f.mongoose.Types.ObjectId();
                const pending = await f.DonationRequest.create({ donation: listing._id, organization: otherOrg, requestedBy: member._id, quantity: 1, beneficiary: "Synthetic beneficiary summary", message: "Synthetic need statement for concurrent review" });
                const [moderated, accepted] = await Promise.all([
                    mode === "hide" ? moderateListing({ donationId: listing.id, actorId: admin.id, status: "hidden", version: 0, reason: "Synthetic concurrent listing review" }) : moderateUser({ userId: donor.id, actorId: admin.id, status: "suspended", version: 0, reason: "Synthetic concurrent account review" }),
                    acceptPendingRequest({ request: pending, donorId: donor.id, respondedBy: donor.id })
                ]);
                const stored = await f.Donation.findById(listing.id);
                assert.equal(stored.allocatedQuantity, accepted.accepted ? 3 : 2);
                assert.equal(stored.quantity, 5);
                if (mode === "hide" && moderated) assert.equal(accepted.accepted, false);
                if (mode === "suspend") {
                    assert.equal(moderated, true); assert.equal(stored.donorSuspended, true);
                    assert.equal((await changeListing({ donationId: listing.id, donorId: donor.id, expectedVersion: stored.__v, action: "quantity", value: { quantity: 6 } })).changed, false);
                }
            }
        });
        await t.test("organization review rejects stale evidence; competing decisions and audit rollback are safe", async () => {
            const { org, reviewer } = await setup();
            await f.Organization.updateOne({ _id: org.id }, { $set: { verificationStatus: "pending" }, $inc: { __v: 1 } });
            const body = { _version: "0", reason: "Synthetic evidence reviewed for this decision", evidenceReviewed: "yes" };
            assert.equal((await reviewer.post(`/admin/organizations/${org.id}/approve`, body)).status, 409);
            body._version = "1";
            await f.mongoose.connection.db.command({ collMod: AuditLog.collection.name, validator: { targetType: { $ne: "organization" } }, validationLevel: "strict", validationAction: "error" });
            try { assert.equal((await reviewer.post(`/admin/organizations/${org.id}/approve`, body)).status, 500); }
            finally { await f.mongoose.connection.db.command({ collMod: AuditLog.collection.name, validator: {} }); }
            assert.equal((await f.Organization.findById(org.id)).verificationStatus, "pending");
            const results = await Promise.all([reviewer.post(`/admin/organizations/${org.id}/approve`, body), reviewer.post(`/admin/organizations/${org.id}/reject`, body)]);
            assert.deepEqual(results.map(item => item.status).sort(), [302, 409]);
            assert.equal(await AuditLog.countDocuments({ targetId: org._id }), 1);
            const review = await reviewer.get(`/admin/organizations/${org.id}/review`); assert.match(review.text, /Synthetic evidence reviewed/);
        });
        await t.test("review notes are atomic, private and never alter or resolve workflow accounting", async () => {
            const { request, reviewer, donor, member, org } = await setup();
            const body = { _version: "0", _stamp: request.updatedAt.toISOString(), reason: "Synthetic administrative follow-up note", status: "completed", releasedQuantity: "2" };
            assert.equal((await reviewer.post(`/admin/requests/${request.id}/note`, body)).status, 302);
            assert.equal((await reviewer.post(`/admin/requests/${request.id}/note`, body)).status, 409);
            const current = await f.DonationRequest.findById(request.id); assert.equal(current.status, "accepted"); assert.equal(current.releasedQuantity, 0);
            const review = await reviewer.get(`/admin/requests/${request.id}/review`); assert.match(review.text, /administrative follow-up/); assert.ok(!review.text.includes("PRIVATE_NEED_REVIEW20"));
            for (const actor of [await f.client(), await f.client(donor), await f.client(member)]) {
                assert.ok([401, 403].includes((await actor.get(`/admin/requests/${request.id}/review`)).status));
                assert.ok([401, 403].includes((await actor.post(`/admin/requests/${request.id}/note`, body)).status));
            }
            assert.equal((await reviewer.post(`/admin/requests/${request.id}/note`, { ...body, _csrf: "wrong" })).status, 403);
            const stranger = await f.client(await user("ngo")); assert.equal((await stranger.get(`/organizations/${org.id}/verification-document`)).status, 403);
            assert.equal((await reviewer.get(`/organizations/${org.id}/verification-document`)).status, 200);
        });
        await t.test("old suspended accounts remain excluded; paginated queues use truthful totals", async () => {
            const { donor, member, listing, reviewer } = await setup();
            await f.User.updateOne({ _id: donor.id }, { $set: { status: "suspended" } });
            const ngo = await f.client(member); assert.equal((await ngo.get(`/ngo/equipment/${listing.id}`)).status, 404);
            const accounts = await reviewer.get("/admin/users?role=donor&page=999999"); assert.equal(accounts.status, 200); assert.match(accounts.text, /records match/);
            for (const path of ["/admin/listings", "/admin/exceptions?status=missed", "/admin/dashboard?status=rejected", `/admin/users/${donor.id}/review`]) assert.equal((await reviewer.get(path)).status, 200, path);
        });
        await t.test("failed listing/note audits leave no unexplained moderation or workflow write", async () => {
            const { listing, request, reviewer } = await setup();
            await f.mongoose.connection.db.command({ collMod: AuditLog.collection.name, validator: { targetType: { $nin: ["donation", "request"] } }, validationLevel: "strict", validationAction: "error" });
            try {
                assert.equal((await reviewer.post(`/admin/listings/${listing.id}/hidden`, { _version: "0", reason: "Synthetic failed listing review reason" })).status, 500);
                assert.equal((await reviewer.post(`/admin/requests/${request.id}/note`, { _version: "0", _stamp: request.updatedAt.toISOString(), reason: "Synthetic failed review note reason" })).status, 500);
            } finally { await f.mongoose.connection.db.command({ collMod: AuditLog.collection.name, validator: {} }); }
            assert.equal((await f.Donation.findById(listing.id)).moderationStatus, "visible");
            const stored = await f.DonationRequest.findById(request.id); assert.equal(stored.__v, 0); assert.equal(stored.status, "accepted");
        });
    } finally { await f.close(); }
});
