import test from "node:test";
import assert from "node:assert/strict";
import { startWorkflowFixture } from "../support/workflow-fixture.js";

test("donor workspace reflects committed workflow states and stays owner scoped", { timeout: 180000 }, async t => {
    const f = await startWorkflowFixture();
    try {
        const donor = await f.User.create({ name: "Synthetic Workspace Donor", email: "workspace-donor@example.invalid", password: "fixture", role: "donor" });
        const outsider = await f.User.create({ name: "Synthetic Other Donor", email: "workspace-other@example.invalid", password: "fixture", role: "donor" });
        const ngo = await f.User.create({ name: "Synthetic Workspace NGO", email: "workspace-ngo@example.invalid", password: "fixture", role: "ngo" });
        const evidence = Buffer.from("%PDF-1.4\nSYNTHETIC_WORKSPACE_EVIDENCE\n%%EOF");
        const document = await f.saveVerificationDocument({ buffer: evidence, size: evidence.length, mimetype: "application/pdf", originalname: "synthetic-workspace.pdf" });
        const org = await f.Organization.create({ owner: ngo._id, name: "Synthetic Workspace Organization", description: "Synthetic workspace organization for regression checks", contactPerson: "Synthetic Coordinator", verificationDocument: document, verificationStatus: "verified", contactEmail: ngo.email, address: { city: "Pune", state: "Maharashtra" } });
        const item = await f.Donation.create({ donor: donor._id, equipment: "walker", condition: "good", quantity: 5, description: "Synthetic workspace equipment", location: { city: "Pune", state: "Maharashtra" } });
        const request = await f.DonationRequest.create({ donation: item._id, organization: org._id, requestedBy: ngo._id, quantity: 2, beneficiary: "PRIVATE_WORKSPACE_BENEFICIARY", message: "PRIVATE_WORKSPACE_NEED_STATEMENT" });
        const owner = await f.client(donor), member = await f.client(ngo), foreign = await f.client(outsider);
        const view = async (url = "/donor/dashboard") => { const response = await owner.get(url); assert.equal(response.status, 200); return response.text; };
        const quantities = (html, expected) => {
            for (const [label, value] of Object.entries(expected)) assert.ok(html.includes(`<dt>${label}</dt><dd>${value}</dd>`), `${label} should be ${value}`);
        };
        await t.test("pending tasks link to a single owned request and omit private coordination", async () => {
            const html = await view();
            assert.match(html, /Review request/); assert.match(html, /Synthetic Workspace Organization/);
            assert.ok(html.includes(`/donor/requests?request=${request.id}`));
            assert.ok(!html.includes('PRIVATE_WORKSPACE_BENEFICIARY')); assert.ok(!html.includes(ngo.email));
            assert.ok(!html.includes(`/donations/${item.id}/edit`));
            quantities(html, { "Total offered": 5, "Available to request": 5, "Reserved, not handed over": 0, "NGO acknowledged": 0 });
            assert.equal((await owner.get(`/donor/requests?request=${request.id}`)).status, 200);
            assert.equal((await foreign.get(`/donor/requests?request=${request.id}`)).status, 404);
            assert.equal((await owner.get('/donor/requests?request=invalid')).status, 404);
            assert.ok(!(await foreign.get('/donor/dashboard')).text.includes('Synthetic workspace equipment'));
        });
        await t.test("acceptance changes availability and surfaces pickup without rewriting lifecycle records", async () => {
            assert.equal((await owner.post(`/donor/requests/${request.id}/accept`)).status, 302);
            const html = await view('/donor/dashboard?filter=pickups&equipment=walker');
            assert.match(html, /Arrange pickup/);
            quantities(html, { "Available to request": 3, "Reserved, not handed over": 2, "Handed over": 0 });
            const before = await f.DonationRequest.findById(request.id).lean();
            await view();
            assert.deepEqual(await f.DonationRequest.findById(request.id).lean(), before);
        });
        const pickup = `/donor/requests/${request.id}/pickup`;
        await t.test("NGO proposal requires donor confirmation and time zone remains explicit", async () => {
            const localStart = new Date(Date.now() + 3600000).toISOString().slice(0, 16), localEnd = new Date(Date.now() + 7200000).toISOString().slice(0, 16);
            assert.equal((await member.post(`/ngo/requests/${request.id}/pickup/propose`, { _version: 0, localStart, localEnd, timeZone: "UTC", address: "PRIVATE_WORKSPACE_ADDRESS", instructions: "PRIVATE_WORKSPACE_INSTRUCTIONS" })).status, 302);
            const html = await view(); assert.match(html, /Confirm pickup proposal/); assert.match(html, /Collection window:/); assert.match(html, /\(UTC\)/);
            assert.ok(!html.includes('PRIVATE_WORKSPACE_ADDRESS')); assert.ok(!html.includes('PRIVATE_WORKSPACE_INSTRUCTIONS'));
            assert.equal((await owner.post(`${pickup}/confirm`, { _version: 1 })).status, 302);
            assert.match(await view(), /Upcoming confirmed pickup/);
            // Only this disposable fixture advances the window to exercise handover without a wall-clock wait.
            await f.DonationRequest.updateOne({ _id: request._id }, { $set: { "pickup.proposal.start": new Date("2000-01-01T10:00Z"), "pickup.proposal.end": new Date("2000-01-01T12:00Z") } });
            assert.match(await view(), /Record handover or review collection/);
        });
        await t.test("partial handover waits for NGO acknowledgement without calling reserved units received", async () => {
            assert.equal((await owner.post(`${pickup}/handover`, { _version: 2, quantity: 1, equipmentMatches: "yes", conditionReviewed: "yes", accessoriesExplained: "yes" })).status, 302);
            const html = await view('/donor/dashboard?filter=waiting'); assert.match(html, /Waiting for NGO acknowledgement/);
            quantities(html, { "Available to request": 3, "Reserved, not handed over": 1, "Handed over": 1, "NGO acknowledged": 0 });
            const record = await f.DonationRequest.findById(request.id);
            const transferId = record.fulfillment.transfers[0].id;
            assert.equal((await member.post(`/ngo/requests/${request.id}/pickup/receipt-dispute`, { _version: 3, transferId, quantity: 0, reason: "Synthetic receipt discrepancy for review" })).status, 302);
            assert.match(await view('/donor/dashboard?filter=review'), /Resolve receipt discrepancy/);
            assert.equal((await owner.post(`${pickup}/resolution-propose`, { _version: 4, transferId, quantity: 1, reason: "Synthetic agreement after receipt review" })).status, 302);
            assert.match(await view('/donor/dashboard?filter=waiting'), /Waiting for NGO resolution confirmation/);
            assert.equal((await member.post(`/ngo/requests/${request.id}/pickup/resolution-confirm`, { _version: 5, transferId, quantity: 1, reason: "Synthetic receipt resolution confirmation", receiptConfirmed: "yes" })).status, 302);
            const acknowledged = await view(); assert.match(acknowledged, /Arrange remaining pickup/);
            quantities(acknowledged, { "NGO acknowledged": 1 });
        });
        await t.test("agreed remainder release completes a request while listing retains available stock", async () => {
            assert.equal((await owner.post(`${pickup}/remainder-propose`, { _version: 6, reason: "Synthetic agreement to release remaining equipment", noHandover: "yes", noFurtherHandover: "yes" })).status, 302);
            assert.match(await view(), /Waiting for NGO release confirmation/);
            assert.equal((await member.post(`/ngo/requests/${request.id}/pickup/remainder-confirm`, { _version: 7, reason: "Synthetic confirmation of remaining unit release", noHandover: "yes", noFurtherHandover: "yes" })).status, 302);
            const html = await view(); assert.match(html, /Donation receipt/); assert.match(html, /Request completed/);
            quantities(html, { "Available to request": 4, "Reserved, not handed over": 0, "Handed over": 1, "NGO acknowledged": 1 });
            assert.match(await view('/donor/dashboard?filter=waiting'), /No pending steps match/);
        });
        await t.test("empty, closed, cancelled and legacy records remain honest with filter recovery", async () => {
            const closed = await f.Donation.create({ donor: donor._id, equipment: "cane", condition: "used", quantity: 2, status: "withdrawn", location: { city: "Pune" } });
            await f.DonationRequest.create({ donation: closed._id, organization: org._id, requestedBy: ngo._id, quantity: 1, status: "cancelled", beneficiary: "Synthetic cancelled beneficiaries", message: "Synthetic cancelled request need" });
            const html = await view('/donor/dashboard?filter=history&equipment=cane'); assert.match(html, /cancelled/);
            quantities(html, { "Available to request": 0 });
            assert.ok(!html.includes(`/donations/${closed.id}/quantity`));
            assert.match(await view('/donor/dashboard?equipment=stethoscope'), /No listings match/);
            assert.match((await foreign.get('/donor/dashboard')).text, /No listings yet/);
            await f.User.collection.updateOne({ _id: donor._id }, { $set: { products: [{ equipment: "Synthetic older equipment", quality: "unknown" }] } });
            const legacy = await view(); assert.match(legacy, /Older donation history/); assert.match(legacy, /excluded from current quantities/); assert.ok(!legacy.includes('Run the documented'));
            const guest = await f.client(); assert.equal((await guest.get('/donor/dashboard')).status, 401);
            assert.equal((await member.get('/donor/dashboard')).status, 403);
        });
        await t.test("refresh racing acceptance sees one consistent quantity snapshot", async () => {
            const concurrent = await f.Donation.create({ donor: donor._id, equipment: "stethoscope", condition: "good", quantity: 5, location: { city: "Pune" } });
            const attempt = await f.DonationRequest.create({ donation: concurrent._id, organization: org._id, requestedBy: ngo._id, quantity: 2, beneficiary: "Synthetic snapshot beneficiaries", message: "Synthetic concurrent snapshot equipment need" });
            const [decision, ...reads] = await Promise.all([owner.post(`/donor/requests/${attempt.id}/accept`), ...Array.from({ length: 6 }, () => owner.get('/donor/dashboard?equipment=stethoscope'))]);
            assert.equal(decision.status, 302);
            for (const response of reads) {
                assert.equal(response.status, 200);
                const available = response.text.match(/<dt>Available to request<\/dt><dd>(\d+)<\/dd>/)[1];
                const reserved = response.text.match(/<dt>Reserved, not handed over<\/dt><dd>(\d+)<\/dd>/)[1];
                assert.ok(available === '5' && reserved === '0' || available === '3' && reserved === '2');
                assert.ok(!response.text.includes('<dd>Needs review</dd>'));
                assert.equal(response.text.includes('Arrange pickup'), available === '3');
            }
        });
    } finally { await f.close(); }
});
