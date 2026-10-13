import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { startWorkflowFixture } from "../support/workflow-fixture.js";
import { startIsolatedDatabase } from "../support/database.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { backupDatabase, verifyBackupPackage, restoreDatabase, verifyRestoredDatabase, verifyBusinessConsistency, releaseRecovery } from "../../src/services/backupRecoveryService.js";
import { assertRecoveryReleased, RecoveryQuarantineError } from "../../src/services/recoveryGuardService.js";

const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1kAAAAASUVORK5CYII=", "base64");
test("encrypted coordinated backup and isolated recovery drill", { timeout: 180000 }, async t => {
    const f = await startWorkflowFixture(); let target, targetDatabase;
    const key = randomBytes(32).toString("hex"), directory = path.join(f.runtime, "private-backup"), legacyDirectory = path.join(f.runtime, "restored-uploads");
    const targetName = `carecycle_test_restore_${randomBytes(6).toString("hex")}`;
    const times = {}; const start = performance.now();
    let afterSnapshot;
    try {
        const donor = await f.User.create({ emailVerifiedAt: new Date(), name: "Synthetic Recovery Donor", email: "PRIVATE_RESTORE_donor@example.invalid", password: "synthetic-password-hash", role: "donor", notificationEmailEnabled: true, resetCredential: { hash: "synthetic-old-reset", issuedAt: new Date(), expiresAt: new Date(Date.now() + 3600000) } });
        const ngo = await f.User.create({ emailVerifiedAt: new Date(), name: "Synthetic Recovery NGO", email: "recovery-ngo@example.invalid", password: "synthetic-password-hash", role: "ngo", notificationEmailEnabled: true });
        const evidence = await f.saveVerificationDocument({ buffer: Buffer.from("%PDF-1.4\nSYNTHETIC_RECOVERY_PRIVATE_EVIDENCE\n%%EOF"), size: Buffer.byteLength("%PDF-1.4\nSYNTHETIC_RECOVERY_PRIVATE_EVIDENCE\n%%EOF"), mimetype: "application/pdf", originalname: "synthetic-evidence.pdf" });
        const org = await f.Organization.create({ owner: ngo._id, name: "Synthetic Recovery Organization", contactPerson: "Synthetic Coordinator", contactEmail: ngo.email, description: "Synthetic organization for an isolated recovery drill", verificationStatus: "verified", verificationDocument: evidence });
        const [image] = await f.saveDonationImages([{ buffer: pixel, size: pixel.length, mimetype: "image/png", originalname: "synthetic-pixel.png" }]);
        const legacy = { filename: "synthetic-legacy.png", originalName: "synthetic.png", mimeType: "image/png", size: pixel.length };
        await mkdir(path.join(f.runtime, "uploads/donations"), { recursive: true }); await writeFile(path.join(f.runtime, "uploads/donations", legacy.filename), pixel);
        const donation = await f.Donation.create({ donor: donor._id, equipment: "walker", condition: "good", quantity: 3, allocatedQuantity: 1, handedOverQuantity: 1, images: [image, legacy], description: "Synthetic recoverable listing" });
        const at = new Date(), end = new Date(Date.now() + 1000);
        const completed = await f.DonationRequest.create({ donation: donation._id, organization: org._id, requestedBy: ngo._id, status: "completed", quantity: 1, handedOverQuantity: 1, acknowledgedQuantity: 1, beneficiary: "SYNTHETIC_PRIVATE_BENEFICIARY", message: "SYNTHETIC_PRIVATE_RECOVERY_REQUEST", fulfillment: { completedAt: end, transfers: [{ declaredQuantity: 1, quantity: 1, donor: donor._id, at, checklist: { equipmentMatches: true, conditionReviewed: true, accessoriesExplained: true }, status: "acknowledged", receivedQuantity: 1, acknowledgedBy: ngo._id, acknowledgedAt: end }] } });
        const reserved = await f.Donation.create({ donor: donor._id, equipment: "cane", condition: "good", quantity: 2, allocatedQuantity: 2, images: [image] });
        await f.DonationRequest.create({ donation: reserved._id, organization: org._id, requestedBy: ngo._id, status: "accepted", quantity: 2, beneficiary: "Synthetic remaining beneficiaries", message: "Synthetic outstanding recovery commitment" });
        const { changeReceipt } = await import("../../src/services/receiptService.js");
        assert.equal(await changeReceipt({ requestId: completed.id, version: 0, actorId: donor.id, actorRole: "donor", action: "issue", body: {} }), true);
        const { AuditLog } = await import("../../src/models/AuditLog.js"); await AuditLog.create({ actor: donor._id, action: "synthetic.recovery_fixture", targetType: "request", targetId: completed._id, details: { reason: "Synthetic recovery evidence" } });
        const { processOutboxBatch } = await import("../../src/services/notificationService.js"); await processOutboxBatch();
        const { Notification } = await import("../../src/models/Notification.js"); assert.ok(await Notification.countDocuments({ mailStatus: "pending" }));
        await f.mongoose.connection.db.collection("lifecycle_events").insertOne({ _id: "synthetic-unprocessed", kind: "synthetic", createdAt: new Date(), processedAt: null, recipients: [] });
        const sourceBefore = await f.DonationRequest.findById(completed.id).lean();
        targetDatabase = await startIsolatedDatabase();
        target = f.mongoose.createConnection(targetDatabase.getUri(), { dbName: targetName, autoCreate: false, autoIndex: false }); await target.asPromise();
        await t.test("offline backup requires maintenance, encrypts sensitive content and authenticates its manifest", async () => {
            await assert.rejects(backupDatabase(f.mongoose.connection, { directory, key }));
            const begin = performance.now(); const report = await backupDatabase(f.mongoose.connection, { directory, key, maintenanceConfirmed: true }); times.backupMs = Math.round(performance.now() - begin);
            assert.equal(report.files, 3);
            const bundle = await verifyBackupPackage(directory, key); assert.equal(bundle.manifest.permissions, "owner_only");
            for (const entry of bundle.manifest.files) assert.doesNotMatch((await readFile(path.join(directory, entry.file))).toString(), /PRIVATE_RESTORE|synthetic-password-hash|SYNTHETIC_PRIVATE/);
            if (process.platform !== "win32") assert.equal((await stat(directory)).mode & 0o077, 0);
            await assert.rejects(verifyBackupPackage(directory, randomBytes(32).toString("hex")));
            await assert.rejects(backupDatabase(f.mongoose.connection, { directory, key, maintenanceConfirmed: true }));
        });
        await t.test("interrupted restore remains quarantined and cannot overwrite its partial target", async () => {
            const partial = f.mongoose.createConnection(targetDatabase.getUri(), { dbName: `carecycle_test_restore_partial_${randomBytes(5).toString("hex")}`, autoCreate: false, autoIndex: false }); await partial.asPromise();
            const create = partial.db.createCollection.bind(partial.db);
            partial.db.createCollection = async (name, options) => { if (name === "donations") throw new Error("Synthetic interrupted restore"); return create(name, options); };
            try {
                const options = { directory, key, legacyDirectory: path.join(f.runtime, "partial-uploads"), apply: true, maintenanceConfirmed: true };
                await assert.rejects(restoreDatabase(partial, options));
                assert.equal((await partial.db.collection("operational_recovery").findOne({ _id: "restore" })).verifiedAt, null);
                await assert.rejects(assertRecoveryReleased(partial), RecoveryQuarantineError);
                await assert.rejects(restoreDatabase(partial, options));
            } finally { await partial.close(); }
        });
        await t.test("dry run changes no target records and corruption is rejected before restore", async () => {
            afterSnapshot = await f.User.create({ name: "Synthetic Post Backup User", email: "post-backup@example.invalid", password: "fixture", role: "donor" });
            const plan = await restoreDatabase(target, { directory, key, legacyDirectory }); assert.equal(plan.mode, "dry-run"); assert.equal(await target.db.listCollections().hasNext(), false);
            const { manifest } = await verifyBackupPackage(directory, key), entry = manifest.files[0], filename = path.join(directory, entry.file), original = await readFile(filename);
            await writeFile(filename, Buffer.from("corrupt"));
            try { await assert.rejects(restoreDatabase(target, { directory, key, legacyDirectory, apply: true, maintenanceConfirmed: true })); assert.equal(await target.db.listCollections().hasNext(), false); }
            finally { await writeFile(filename, original); }
        });
        await t.test("restore preserves business records/files/indexes while suppressing historical delivery and revoking sessions", async () => {
            const { manifest } = await verifyBackupPackage(directory, key); times.simulatedFailureAt = new Date().toISOString(); times.expectedDataLossWindowMs = Date.parse(times.simulatedFailureAt) - Date.parse(manifest.capturedAt);
            const begin = performance.now(); const report = await restoreDatabase(target, { directory, key, legacyDirectory, apply: true, maintenanceConfirmed: true }); times.restoreAndVerificationMs = Math.round(performance.now() - begin);
            assert.equal(report.mode, "restored_quarantined"); await assert.rejects(assertRecoveryReleased(target), RecoveryQuarantineError);
            const verify = await verifyRestoredDatabase(target, { directory, key, legacyDirectory }); assert.equal(verify.receipts, 1); assert.equal(verify.requests, 2); assert.equal(verify.audits, 1); assert.equal(verify.files, 3);
            assert.deepEqual((await target.db.collection("donation_requests").findOne({ _id: completed._id })).receipt, sourceBefore.receipt);
            const restored = await target.db.collection("users").findOne({ _id: donor._id }); assert.equal(restored.authVersion, donor.authVersion + 1); assert.equal(restored.resetCredential, undefined); assert.equal(restored.notificationEmailEnabled, false);
            assert.equal(await target.db.collection("users").findOne({ _id: afterSnapshot._id }), null); assert.ok(await f.User.findById(afterSnapshot.id));
            assert.equal(await target.db.collection("notifications").countDocuments({ mailStatus: "pending" }), 0);
            assert.equal(await target.db.collection("lifecycle_events").countDocuments({ processedAt: null }), 0);
            assert.equal(await target.db.collection("security_sessions").countDocuments(), 0);
            assert.deepEqual(await readFile(path.join(legacyDirectory, "donations", legacy.filename)), pixel);
            assert.ok((await target.db.collection("donation_requests").listIndexes().toArray()).some(index => index.unique && index.partialFilterExpression));
            await assert.rejects(restoreDatabase(target, { directory, key, legacyDirectory, apply: true, maintenanceConfirmed: true }));
            assert.deepEqual((await f.DonationRequest.findById(completed.id).lean()).receipt, sourceBefore.receipt);
        });
        await t.test("consistency checks reject broken allocations and release requires explicit reviewed verification", async () => {
            await target.db.collection("donations").updateOne({ _id: donation._id }, { $set: { allocatedQuantity: 0 } });
            await assert.rejects(verifyBusinessConsistency(target)); await assert.rejects(releaseRecovery(target, { directory, key, legacyDirectory, apply: true, maintenanceConfirmed: true, reviewConfirmed: true }));
            await target.db.collection("donations").updateOne({ _id: donation._id }, { $set: { allocatedQuantity: 1 } });
            const pairIndex = (await target.db.collection("donation_requests").listIndexes().toArray()).find(index => index.partialFilterExpression && index.unique);
            await target.db.collection("donation_requests").dropIndex(pairIndex.name); await assert.rejects(verifyRestoredDatabase(target, { directory, key, legacyDirectory }));
            await target.db.collection("donation_requests").createIndex(pairIndex.key, { name: pairIndex.name, unique: true, partialFilterExpression: pairIndex.partialFilterExpression });
            await assert.rejects(releaseRecovery(target, { directory, key, legacyDirectory, apply: true, maintenanceConfirmed: true }));
            assert.equal((await releaseRecovery(target, { directory, key, legacyDirectory })).mode, "review_required");
        });
        await t.test("CLI verifies recovery and restored application/notification sending remain blocked until reviewed release", async () => {
            const childEnv = { ...process.env, MONGO_URI: targetDatabase.getUri(), MONGO_DB_NAME: targetName, CARECYCLE_BACKUP_KEY: key };
            const invoke = (script, args = []) => promisify(execFile)(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), ...args], { env: childEnv, cwd: f.runtime, windowsHide: true, timeout: 30000 });
            const result = await invoke("../../scripts/recovery.js", ["verify-restore", "--target", targetName, "--directory", directory, "--legacy-dir", legacyDirectory]);
            assert.equal(JSON.parse(result.stdout).notificationsQuarantined, true);
            const packageCheck = await promisify(execFile)(process.execPath, [fileURLToPath(new URL("../../scripts/recovery.js", import.meta.url)), "verify-package", "--directory", directory], { env: { ...childEnv, MONGO_URI: "", JWT_SECRET: "", SESSION_SECRET: "" }, cwd: f.runtime, windowsHide: true, timeout: 30000 });
            assert.equal(JSON.parse(packageCheck.stdout).verified, true);
            const delivery = await invoke("../support/restored-delivery-probe.js"); assert.deepEqual(JSON.parse(delivery.stdout), { blocked: true, attempted: false });
            let failed; try { await invoke("../../index.js"); } catch (error) { failed = error; }
            assert.equal(failed?.code, 1); assert.equal(JSON.parse(failed.stdout).event, "startup.failed"); assert.equal(JSON.parse(failed.stdout).code, "recovery_quarantined"); assert.doesNotMatch(failed.stdout + failed.stderr, /PRIVATE_RESTORE|mongodb:|synthetic-password/);
            assert.equal((await releaseRecovery(target, { directory, key, legacyDirectory, apply: true, maintenanceConfirmed: true, reviewConfirmed: true })).mode, "released");
            await assertRecoveryReleased(target); assert.equal(await target.db.collection("notifications").countDocuments({ mailStatus: "pending" }), 0);
            const current = await invoke("../../scripts/recovery.js", ["verify-current", "--target", targetName, "--legacy-dir", legacyDirectory]); assert.equal(JSON.parse(current.stdout).files, 3);
            const original = await f.User.collection.findOne({ _id: donor._id }); assert.equal(original.authVersion, donor.authVersion); assert.equal(original.notificationEmailEnabled, true); assert.ok(original.resetCredential);
        });
        times.totalDrillMs = Math.round(performance.now() - start);
        times.expectedDataLossWindow = "Changes after capturedAt are not included; isolated drill performs no source writes during backup. Production RPO equals age of latest verified backup at failure.";
        const root = path.resolve(f.runtime, "../../"); await writeFile(path.join(root, "day24-recovery-drill.json"), JSON.stringify({ date: "2026-10-13", synthetic: true, measured: times, recovered: { users: 2, requests: 2, receipts: 1, audits: 1, privateFiles: 3 }, originalDataPreserved: true, oldNotificationDeliverySuppressed: true }, null, 2));
        console.log(`Synthetic recovery drill: backup ${times.backupMs} ms; restore and verification ${times.restoreAndVerificationMs} ms; total ${times.totalDrillMs} ms.`);
    } finally { if (target) await target.close(); if (targetDatabase) await targetDatabase.stop(); await f.close(); }
});
