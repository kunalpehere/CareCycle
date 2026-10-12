import test from 'node:test';
import assert from 'node:assert/strict';
import { startWorkflowFixture } from '../support/workflow-fixture.js';

test('NGO workspace, request pagination and discovery retain ownership and privacy', { timeout: 180000 }, async t => {
    const f = await startWorkflowFixture();
    try {
        const donor = await f.User.create({ name: 'Synthetic Day16 Donor', email: 'private-day16@example.invalid', password: 'fixture', role: 'donor' });
        const ngo = await f.User.create({ name: 'Synthetic Day16 NGO', email: 'ngo-day16@example.invalid', password: 'fixture', role: 'ngo' });
        const other = await f.User.create({ name: 'Synthetic Day16 Other', email: 'other-day16@example.invalid', password: 'fixture', role: 'ngo' });
        const bytes = Buffer.from('%PDF-1.4\nSYNTHETIC\n%%EOF');
        const document = await f.saveVerificationDocument({ buffer: bytes, size: bytes.length, mimetype: 'application/pdf', originalname: 'synthetic.pdf' });
        const org = await f.Organization.create({ owner: ngo._id, name: 'Synthetic Day16 Organization', description: 'Synthetic NGO workspace test organization', contactPerson: 'Synthetic Coordinator', contactEmail: ngo.email, verificationStatus: 'verified', verificationDocument: document, address: { city: 'Pune' } });
        const member = await f.client(ngo), foreign = await f.client(other), owner = await f.client(donor);
        const items = await f.Donation.insertMany(Array.from({ length: 14 }, (_, i) => ({ donor: donor._id, equipment: 'walker', condition: 'good', quantity: 5, description: `Synthetic discovery listing ${i}`, location: { city: 'Day16 Pune', state: 'Maharashtra' } })));
        const request = await f.DonationRequest.create({ donation: items[0]._id, organization: org._id, requestedBy: ngo._id, quantity: 2, beneficiary: 'Synthetic beneficiary summary', message: 'Synthetic equipment request need' });
        await t.test('unverified onboarding and private pending requests', async () => {
            assert.match((await foreign.get('/ngo/dashboard')).text, /Start verification/);
            assert.equal((await foreign.get('/ngo/equipment')).status, 403);
            const dashboard = await member.get('/ngo/dashboard'); assert.equal(dashboard.status, 200); assert.match(dashboard.text, /Waiting for donor decision/); assert.ok(!dashboard.text.includes(donor.email));
            assert.ok(!(await member.get('/ngo/requests')).text.includes(donor.email));
            for (const status of ['pending', 'rejected']) {
                await f.Organization.updateOne({ _id: org._id }, { $set: { verificationStatus: status, rejectionReason: 'Synthetic updated evidence required' } });
                const html = (await member.get('/ngo/dashboard')).text; assert.match(html, status === 'pending' ? /administrator review/ : /Synthetic updated evidence required/); assert.ok(!html.includes('Requests and collection steps'));
                assert.equal((await member.get('/ngo/requests')).status, 403);
            }
            await f.Organization.updateOne({ _id: org._id }, { $set: { verificationStatus: 'verified' } });
        });
        await t.test('accepted commitments surface collection without revealing coordination on dashboard', async () => {
            assert.equal((await owner.post(`/donor/requests/${request.id}/accept`)).status, 302);
            assert.match((await member.get('/ngo/dashboard')).text, /Arrange pickup/);
            assert.ok((await member.get('/ngo/requests?status=accepted')).text.includes(donor.email));
            assert.ok(!(await member.get('/ngo/dashboard')).text.includes(donor.email));
            await f.Organization.create({ owner: other._id, name: 'Synthetic Other Organization', description: 'Synthetic unrelated verified organization', contactPerson: 'Synthetic Other Coordinator', contactEmail: other.email, verificationStatus: 'verified', verificationDocument: document, address: { city: 'Pune' } });
            assert.match((await foreign.get('/ngo/requests')).text, /No requests yet/);
            assert.ok(!(await foreign.get('/ngo/dashboard')).text.includes('Arrange pickup'));
            assert.equal((await foreign.get(`/ngo/requests/${request.id}/pickup`)).status, 404);
        });
        await t.test('history is bounded, filterable, clamped and organization scoped', async () => {
            await f.DonationRequest.insertMany(items.slice(1).map(item => ({ donation: item._id, organization: org._id, requestedBy: ngo._id, quantity: 1, status: 'rejected', beneficiary: 'Synthetic previous attempt', message: 'Synthetic rejected request need' })));
            const first = (await member.get('/ngo/requests?status=rejected')).text; assert.equal((first.match(/class="surface request-card"/g) || []).length, 12); assert.match(first, /status=rejected&amp;page=2|status=rejected&page=2/);
            const last = (await member.get('/ngo/requests?status=rejected&page=999')).text; assert.equal((last.match(/class="surface request-card"/g) || []).length, 1); assert.match(last, /Page 2 of 2/);
            assert.match((await member.get('/ngo/requests?status=completed')).text, /No matching requests/);
        });
        await t.test('discovery preserves filters on details, counts remaining stock and recovers empty results', async () => {
            const html = (await member.get('/ngo/equipment?equipment=walker&condition=good&location=Day16&page=2')).text;
            assert.match(html, /Page 2 of 2/); assert.match(html, /equipment=walker&amp;condition=good&amp;location=Day16&amp;page=2/);
            const detailLinks = [...html.matchAll(/href="\/ngo\/equipment\/[a-f0-9]{24}([^\"]*)"/g)];
            assert.equal(detailLinks.length, 6);
            for (const [, context] of detailLinks) assert.match(context, /equipment=walker&amp;condition=good&amp;location=Day16&amp;page=2/);
            const detail = (await member.get(`/ngo/equipment/${items[0].id}?equipment=walker&location=Day16&page=2`)).text; assert.match(detail, /Available quantity<\/dt><dd>3/); assert.match(detail, /equipment=walker&amp;location=Day16&amp;page=2/); assert.ok(!detail.includes(donor.email));
            assert.match((await member.get('/ngo/equipment?location=NoSyntheticMatch')).text, /Show all available equipment/);
            assert.match((await member.get('/ngo/equipment?location=Day16&page=999')).text, /Page 2 of 2/);
        });
    } finally { await f.close(); }
});
