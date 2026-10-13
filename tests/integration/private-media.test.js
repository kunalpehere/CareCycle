import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { startWorkflowFixture } from "../support/workflow-fixture.js";
import { mediaDigest, mediaKey, MEDIA_BUCKET, readPrivateMedia, removePrivateMedia, MediaStorageError } from "../../src/services/privateStorageService.js";
import { createMediaManifest, migratePrivateMedia, cleanupPrivateMedia } from "../../src/services/mediaMaintenanceService.js";

const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1kAAAAASUVORK5CYII=", "base64");
const pdf = Buffer.from("%PDF-1.4\nSynthetic private Day 22 evidence\n%%EOF");
test("private media persistence, history, migration and cleanup", { timeout: 180000 }, async t => {
    const f = await startWorkflowFixture();
    try {
        const db = f.mongoose.connection.db;
        const files = db.collection(`${MEDIA_BUCKET}.files`), chunks = db.collection(`${MEDIA_BUCKET}.chunks`);
        const donor = await f.User.create({ emailVerifiedAt: new Date(), name: "Synthetic Media Donor", email: "media-donor@example.invalid", password: "fixture", role: "donor" });
        const ngo = await f.User.create({ emailVerifiedAt: new Date(), name: "Synthetic Media NGO", email: "media-ngo@example.invalid", password: "fixture", role: "ngo" });
        const other = await f.User.create({ emailVerifiedAt: new Date(), name: "Synthetic Other NGO", email: "media-other@example.invalid", password: "fixture", role: "ngo" });
        const admin = await f.User.create({ name: "Synthetic Media Admin", email: "media-admin@example.invalid", password: "fixture", role: "admin" });
        const evidence = await f.saveVerificationDocument({ buffer: pdf, size: pdf.length, mimetype: "application/pdf", originalname: "evidence.pdf" });
        const orgData = owner => ({ owner: owner._id, name: "Synthetic Media Organization", contactPerson: "Synthetic Coordinator", contactEmail: owner.email, description: "Synthetic durable private media test organization", verificationStatus: "verified", verificationDocument: evidence });
        const org = await f.Organization.create(orgData(ngo)); await f.Organization.create(orgData(other));
        const [image] = await f.saveDonationImages([{ buffer: pixel, size: pixel.length, mimetype: "image/png", originalname: "C:\\fakepath\\pixel.png" }]);
        const listingData = refs => ({ donor: donor._id, equipment: "walker", condition: "good", quantity: 1, images: refs, description: "Synthetic durable private image" });
        const item = await f.Donation.create(listingData([image]));
        const owner = await f.client(donor), member = await f.client(ngo), outsider = await f.client(other), administrator = await f.client(admin), guest = await f.client();

        await t.test("bytes live in private storage with immutable hashes and no public URL", async () => {
            assert.equal(image.storage, "gridfs"); assert.equal(image.originalName, "pixel.png"); assert.equal(image.sha256, mediaDigest(pixel));
            assert.deepEqual(await readPrivateMedia("donations", image), pixel);
            for (const response of [await owner.get(`/donations/images/${image.filename}`), await member.get(`/ngo/equipment/${item.id}/images/${image.filename}`), await administrator.get(`/admin/listings/${item.id}/images/${image.filename}`)]) {
                assert.equal(response.status, 200); assert.deepEqual(response.body, pixel); assert.match(response.headers.get("cache-control"), /private.*no-store/); assert.equal(response.headers.get("x-content-type-options"), "nosniff");
            }
            for (const url of [`/uploads/donations/${image.filename}`, `/private_media/${image.filename}`, `/uploads/verification-documents/${evidence.filename}`]) assert.equal((await guest.get(url)).status, 404);
            assert.equal((await outsider.get(`/organizations/${org.id}/verification-document`)).status, 403);
            assert.equal((await guest.get(`/donations/images/${image.filename}`)).status, 401);
        });
        await t.test("fresh processes read identical bytes from different deployment working directories", async () => {
            const reader = fileURLToPath(new URL("../support/media-reader.js", import.meta.url));
            const cwd = path.join(f.runtime, "replacement-deployment"); await mkdir(cwd);
            for (let attempt = 0; attempt < 2; attempt++) {
                const result = await promisify(execFile)(process.execPath, [reader, Buffer.from(JSON.stringify(image)).toString("base64")], { cwd, env: process.env, windowsHide: true, timeout: 30000 });
                assert.equal(result.stdout.trim(), image.sha256);
            }
        });
        await t.test("only accepted/completed participants retain history access after discovery closes", async () => {
            const request = await f.DonationRequest.create({ donation: item._id, organization: org._id, requestedBy: ngo._id, quantity: 1, beneficiary: "Synthetic media beneficiaries", message: "Synthetic private media history request" });
            const url = `/ngo/requests/${request.id}/images/${image.filename}`;
            assert.equal((await member.get(url)).status, 404);
            await f.Donation.updateOne({ _id: item._id }, { $set: { status: "completed", allocatedQuantity: 1, handedOverQuantity: 1, moderationStatus: "hidden" } });
            for (const status of ["accepted", "completed"]) {
                await f.DonationRequest.updateOne({ _id: request._id }, { $set: { status } });
                assert.deepEqual((await member.get(url)).body, pixel);
                assert.match((await member.get("/ngo/requests")).text, new RegExp(`/ngo/requests/${request.id}/images/`));
                assert.equal((await outsider.get(url)).status, 404);
                assert.equal((await member.get(`/ngo/equipment/${item.id}/images/${image.filename}`)).status, 404);
            }
            await f.DonationRequest.updateOne({ _id: request._id }, { $set: { status: "cancelled" } });
            assert.equal((await member.get(url)).status, 404);
        });
        await t.test("corrupt stored bytes fail closed before a response is sent", async () => {
            await assert.rejects(readPrivateMedia("donations", { ...image, sha256: undefined }), MediaStorageError);
            await assert.rejects(readPrivateMedia("donations", { ...image, storage: "unknown" }), MediaStorageError);
            await assert.rejects(readPrivateMedia("donations", { ...image, filename: "../private.png" }), { status: 404 });
            const key = mediaKey("donations", image.filename), original = await chunks.findOne({ files_id: key });
            await chunks.updateOne({ _id: original._id }, { $set: { data: Buffer.alloc(pixel.length) } });
            assert.equal((await owner.get(`/donations/images/${image.filename}`)).status, 503);
            await chunks.updateOne({ _id: original._id }, { $set: { data: original.data } });
            assert.deepEqual(await readPrivateMedia("donations", image), pixel);
        });
        await t.test("compensation never deletes media still referenced by a record", async () => {
            await removePrivateMedia("donations", image);
            await removePrivateMedia("verification-documents", evidence);
            assert.deepEqual(await readPrivateMedia("donations", image), pixel);
            assert.deepEqual(await readPrivateMedia("verification-documents", evidence), pdf);
        });
        await t.test("invalid uploads and partial multi-file failures leave no files/chunks/leases", async () => {
            const count = await files.countDocuments(), chunkCount = await chunks.countDocuments();
            await assert.rejects(f.saveDonationImages([{ buffer: Buffer.from("invalid"), size: 7, mimetype: "image/png", originalname: "bad.png" }]), { status: 400 });
            await db.command({ collMod: `${MEDIA_BUCKET}.files`, validator: { "metadata.mimeType": { $ne: "image/jpeg" } } });
            const jpeg = Buffer.from([255, 216, 255, 0]);
            try {
                await assert.rejects(f.saveDonationImages([{ buffer: pixel, size: pixel.length, mimetype: "image/png", originalname: "first.png" }, { buffer: jpeg, size: jpeg.length, mimetype: "image/jpeg", originalname: "second.jpg" }]), MediaStorageError);
            } finally { await db.command({ collMod: `${MEDIA_BUCKET}.files`, validator: {} }); }
            assert.equal(await files.countDocuments(), count); assert.equal(await chunks.countDocuments(), chunkCount);
            assert.equal(await db.collection(`${MEDIA_BUCKET}_uploads`).countDocuments(), 0);
        });

        let legacyItem, legacyOrg, manifest;
        const root = path.join(f.runtime, "uploads");
        await t.test("manifest dry run verifies counts/integrity and detects missing/changed originals", async () => {
            const legacyImage = { filename: "legacy-day22.png", originalName: "legacy.png", mimeType: "image/png", size: pixel.length };
            const legacyDocument = { filename: "legacy-day22.pdf", originalName: "legacy.pdf", mimeType: "application/pdf", size: pdf.length };
            await mkdir(path.join(root, "donations"), { recursive: true }); await mkdir(path.join(root, "verification-documents"), { recursive: true });
            await writeFile(path.join(root, "donations", legacyImage.filename), pixel); await writeFile(path.join(root, "verification-documents", legacyDocument.filename), pdf);
            legacyItem = await f.Donation.create(listingData([legacyImage]));
            await f.Donation.create(listingData([legacyImage]));
            const legacyOwner = await f.User.create({ name: "Synthetic Legacy NGO", email: "media-legacy@example.invalid", password: "fixture", role: "ngo" });
            legacyOrg = await f.Organization.create({ ...orgData(legacyOwner), verificationDocument: legacyDocument });
            manifest = await createMediaManifest(); assert.equal(manifest.fileCount, 2); assert.equal(manifest.referenceCount, 3); assert.equal(manifest.totalBytes, pixel.length + pdf.length);
            assert.equal((await migratePrivateMedia(manifest)).changedReferences, 0);
            const cli = fileURLToPath(new URL("../../scripts/maintain-private-media.js", import.meta.url));
            const manifestPath = path.join(f.runtime, "day22-manifest.json");
            const invoke = args => promisify(execFile)(process.execPath, [cli, ...args], { cwd: f.runtime, env: process.env, windowsHide: true, timeout: 30000 });
            const planned = await invoke(["manifest", "--manifest", manifestPath]);
            assert.equal(JSON.parse(planned.stdout).fileCount, 2);
            assert.deepEqual(JSON.parse(await readFile(manifestPath, "utf8")), manifest);
            assert.equal(JSON.parse((await invoke(["migrate", "--manifest", manifestPath])).stdout).changedReferences, 0);
            await assert.rejects(invoke(["migrate", "--manifest", manifestPath, "--apply"]), { code: 1 });
            await assert.rejects(invoke(["manifest", "--manifest", manifestPath]), { code: 1 });
            const before = await files.countDocuments();
            await writeFile(path.join(root, "donations", legacyImage.filename), Buffer.alloc(pixel.length));
            await assert.rejects(migratePrivateMedia(manifest, { apply: true })); assert.equal(await files.countDocuments(), before);
            await unlink(path.join(root, "donations", legacyImage.filename)); await assert.rejects(createMediaManifest(), { status: 404 });
            await writeFile(path.join(root, "donations", legacyImage.filename), pixel);
        });
        await t.test("failed reference switch rolls back all records and retry reuses verified copies", async () => {
            await db.command({ collMod: "organizations", validator: { "verificationDocument.storage": { $ne: "gridfs" } } });
            try { await assert.rejects(migratePrivateMedia(manifest, { apply: true })); }
            finally { await db.command({ collMod: "organizations", validator: {} }); }
            assert.equal((await f.Donation.findById(legacyItem.id)).images[0].storage, undefined);
            assert.equal((await f.Organization.findById(legacyOrg.id)).verificationDocument.storage, undefined);
            const copiedCount = await files.countDocuments();
            assert.equal((await migratePrivateMedia(manifest, { apply: true })).changedReferences, 3);
            assert.equal(await files.countDocuments(), copiedCount);
            const moved = (await f.Donation.findById(legacyItem.id).lean()).images[0];
            assert.deepEqual(await readPrivateMedia("donations", moved), pixel);
            assert.deepEqual(await readFile(path.join(root, "donations", moved.filename)), pixel);
            assert.deepEqual(await readFile(path.join(root, "verification-documents", "legacy-day22.pdf")), pdf);
            assert.equal((await createMediaManifest()).fileCount, 0);
        });
        await t.test("cleanup keeps referenced/recent files and local originals; removes aged orphan files and interrupted chunks", async () => {
            const [orphan] = await f.saveDonationImages([{ buffer: pixel, size: pixel.length, mimetype: "image/png", originalname: "orphan.png" }]);
            assert.equal((await cleanupPrivateMedia()).candidates.length, 0);
            const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
            await files.updateMany({}, { $set: { uploadDate: old } });
            const incomplete = "donations/interrupted-day22.png";
            await db.collection(`${MEDIA_BUCKET}_uploads`).insertOne({ _id: incomplete, startedAt: old });
            await chunks.insertOne({ files_id: incomplete, n: 0, data: Buffer.from("partial") });
            const report = await cleanupPrivateMedia(); assert.equal(report.deleted, 0); assert.deepEqual(report.candidates, [mediaKey("donations", orphan.filename), incomplete].sort());
            assert.equal((await cleanupPrivateMedia({ apply: true })).deleted, 2);
            assert.equal(await chunks.countDocuments({ files_id: incomplete }), 0);
            assert.deepEqual(await readPrivateMedia("donations", image), pixel); assert.deepEqual(await readPrivateMedia("verification-documents", evidence), pdf);
            assert.deepEqual(await readFile(path.join(root, "donations", "legacy-day22.png")), pixel);
            assert.equal((await cleanupPrivateMedia()).candidates.length, 0);
        });
        await t.test("unavailable durable storage never writes to a local fallback", async () => {
            await f.mongoose.disconnect();
            await assert.rejects(readPrivateMedia("donations", image), MediaStorageError);
            await assert.rejects(f.saveDonationImages([{ buffer: pixel, size: pixel.length, mimetype: "image/png", originalname: "fallback.png" }]), MediaStorageError);
        });
    } finally { await f.close(); }
});
