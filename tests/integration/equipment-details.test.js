import test from "node:test";
import assert from "node:assert/strict";
import { startWorkflowFixture } from "../support/workflow-fixture.js";
import { readPrivateMedia, MEDIA_BUCKET, mediaKey } from "../../src/services/privateStorageService.js";

test("equipment listing create/edit validates details, preserves drafts and protects existing records", { timeout: 180000 }, async t => {
    const f = await startWorkflowFixture();
    try {
        const donor = await f.User.create({ emailVerifiedAt: new Date(), name: "Synthetic Equipment Donor", email: "details-donor@example.invalid", password: "fixture", role: "donor" });
        const other = await f.User.create({ emailVerifiedAt: new Date(), name: "Synthetic Other Donor", email: "details-other@example.invalid", password: "fixture", role: "donor" });
        const actor = await f.client(donor), outsider = await f.client(other);
        const values = { equipment: 'wheelchair', quality: 'good', quantity: '3', description: 'Synthetic equipment details', city: 'Pune', state: 'Maharashtra', postalCode: '411001', brand: 'Synthetic Brand', model: 'Model 17', functionalStatus: 'partly_working', defects: 'Brake needs repair', missingAccessories: 'One footrest', wheelchair_spec_seatWidthCm: '42.5', wheelchair_spec_folding: 'yes' };
        let item;
        await t.test("creation persists declared details but no accounting or ownership fields from input", async () => {
            assert.equal((await actor.post('/donate', { ...values, donor: other.id, allocatedQuantity: '99' })).status, 302);
            item = await f.Donation.findOne({ donor: donor._id });
            assert.equal(item.details.specifications.seatWidthCm, 42.5); assert.equal(item.allocatedQuantity, 0);
            assert.match((await actor.get('/donor/dashboard')).text, /Brake needs repair/);
        });
        await t.test("invalid input returns field errors, escaped drafts and no writes", async () => {
            const before = await f.Donation.findById(item.id).lean();
            const response = await actor.post(`/donations/${item.id}/edit`, { ...values, _version: 0, quantity: 0, wheelchair_spec_seatWidthCm: '900', defects: '<script>synthetic draft</script>' });
            assert.equal(response.status, 400); assert.match(response.text, /error-quantity/); assert.match(response.text, /error-wheelchair_spec_seatWidthCm/);
            assert.match(response.text, /&lt;script&gt;synthetic draft/); assert.match(response.text, /Select any new image files again/);
            assert.deepEqual(await f.Donation.findById(item.id).lean(), before);
        });
        await t.test("category change clears irrelevant specifications and preserves ownership/stale guards", async () => {
            assert.equal((await outsider.post(`/donations/${item.id}/edit`, { ...values, _version: 0 })).status, 403);
            assert.equal((await actor.post(`/donations/${item.id}/edit`, { ...values, _version: 0, equipment: 'cane', cane_spec_heightAdjustable: 'no', wheelchair_spec_seatWidthCm: 'invalid' })).status, 302);
            const changed = await f.Donation.findById(item.id).lean();
            assert.deepEqual(changed.details.specifications, { heightAdjustable: 'no' });
            assert.equal((await actor.post(`/donations/${item.id}/edit`, { ...values, _version: 0 })).status, 409);
            assert.deepEqual(await f.Donation.findById(item.id).lean(), changed);
            assert.equal((await actor.post('/donate', { ...values, _csrf: 'wrong' })).status, 403);
        });
        await t.test("older records stay readable without a backfill or inferred claims", async () => {
            await f.Donation.collection.insertOne({ donor: donor._id, equipment: 'walker', condition: 'used', quantity: 1, description: 'Synthetic older listing', status: 'available', location: { city: 'Pune' }, createdAt: new Date() });
            assert.match((await actor.get('/donor/dashboard')).text, /Not provided/);
            const guest = await f.client(); assert.equal((await guest.get('/donor/dashboard')).status, 401);
        });
        await t.test("multipart image errors retain text and never save rejected files", async () => {
            const uploader = await f.client(donor);
            const files = f.mongoose.connection.db.collection(`${MEDIA_BUCKET}.files`);
            const before = await files.countDocuments();
            const send = async (bytes, mime = 'image/png', count = 1) => {
                const form = new FormData();
                for (const [key,value] of Object.entries(values)) form.set(key, value);
                for (let i = 0; i < count; i++) form.append('images', new Blob([bytes], { type: mime }), `synthetic-${i}.png`);
                return uploader.postMultipart('/donate', form);
            };
            for (const response of [await send(Buffer.from('not a PNG')), await send(Buffer.alloc(5 * 1024 * 1024 + 1)), await send(Buffer.from('synthetic'), 'text/plain'), await send(Buffer.from('synthetic'), 'image/png', 4)]) {
                assert.equal(response.status, 400); assert.match(response.text, /error-images/); assert.match(response.text, /value="Synthetic Brand"/);
            }
            assert.equal(await files.countDocuments(), before);
            assert.equal(await f.mongoose.connection.db.collection(`${MEDIA_BUCKET}_uploads`).countDocuments(), 0);
        });
        await t.test("failed edits keep trusted image previews/removal choices and successful edits remove only owned images", async () => {
            const imageActor = await f.client(donor);
            const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1kAAAAASUVORK5CYII=', 'base64');
            const [image] = await f.saveDonationImages([{ buffer: pixel, size: pixel.length, mimetype: 'image/png', originalname: 'synthetic.png' }]);
            await f.Donation.updateOne({ _id: item._id }, { $set: { images: [image] } });
            const response = await imageActor.post(`/donations/${item.id}/edit`, { ...values, equipment: 'cane', _version: 1, quantity: 0, removeImages: image.filename });
            assert.equal(response.status, 400); assert.ok(response.text.includes(`value="${image.filename}" checked`));
            assert.ok(response.text.includes(`/donations/images/${image.filename}`));
            assert.deepEqual(await readPrivateMedia('donations', image), pixel);
            assert.equal((await imageActor.post(`/donations/${item.id}/edit`, { ...values, equipment: 'cane', _version: 1, removeImages: image.filename, cane_spec_heightAdjustable: 'yes' })).status, 302);
            assert.equal(await f.mongoose.connection.db.collection(`${MEDIA_BUCKET}.files`).findOne({ _id: mediaKey('donations', image.filename) }), null);
        });
        await t.test("pending requests still lock equipment detail edits", async () => {
            const organization = new f.mongoose.Types.ObjectId();
            await f.DonationRequest.create({ donation: item._id, organization, requestedBy: donor._id, quantity: 1, beneficiary: 'Synthetic locked beneficiaries', message: 'Synthetic detail-lock request need' });
            const before = await f.Donation.findById(item.id).lean();
            assert.equal((await actor.post(`/donations/${item.id}/edit`, { ...values, _version: 2 })).status, 409);
            assert.deepEqual(await f.Donation.findById(item.id).lean(), before);
        });
    } finally { await f.close(); }
});
