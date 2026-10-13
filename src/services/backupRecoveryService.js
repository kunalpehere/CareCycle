import mongoose from "mongoose";
import path from "node:path";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile, stat, realpath } from "node:fs/promises";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { mediaKey, mediaDigest, readPrivateMedia } from "./privateStorageService.js";
import { quantityAccounting } from "./quantityContract.js";
import { requestAccounting } from "./fulfillmentAccounting.js";
import { assertRecoveryReleased } from "./recoveryGuardService.js";

const bson = mongoose.mongo.BSON;
const ephemeral = new Set(["security_sessions", "security_limits", "operational_workers", "operational_recovery"]);
const validCollection = name => typeof name === "string" && /^[a-z][a-z0-9_.-]{0,100}$/.test(name) && !name.startsWith("system.");
const keyBytes = key => { if (typeof key !== "string" || !/^[a-f0-9]{64}$/i.test(key) || /^(..)\1+$/.test(key)) throw new Error("Use an independent random 32-byte backup key."); return Buffer.from(key, "hex"); };
const signature = (manifest, key) => createHmac("sha256", createHmac("sha256", key).update("carecycle-backup-manifest-v1").digest()).update(JSON.stringify(manifest)).digest("hex");
const hashFile = async filename => { const hash = createHash("sha256"); let size = 0; for await (const chunk of createReadStream(filename)) { hash.update(chunk); size += chunk.length; } return { sha256: hash.digest("hex"), size }; };
export const restrictRecoveryDirectory = async directory => {
    directory = path.join(await realpath(path.dirname(path.resolve(directory))), path.basename(directory));
    for (let publicRoot of [path.resolve("public"), fileURLToPath(new URL("../../public", import.meta.url))]) {
        try { publicRoot = await realpath(publicRoot); } catch { /* An absent public directory cannot serve files. */ }
        const relative = path.relative(publicRoot, directory);
        const outside = relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
        if (!relative || !outside) throw new Error("Recovery packages/uploads must be outside public assets.");
    }
    await mkdir(directory, { mode: 0o700 }); // Existing directories are never reused.
    if (process.platform === "win32") {
        const { stdout } = await promisify(execFile)("whoami.exe", ["/user", "/fo", "csv", "/nh"], { windowsHide: true });
        const sid = stdout.match(/S-1-5-\d+(?:-\d+)+/)?.[0]; if (!sid) throw new Error("Cannot establish private backup ownership.");
        await promisify(execFile)("icacls.exe", [path.resolve(directory), "/inheritance:r", "/grant:r", `*${sid}:(OI)(CI)F`], { windowsHide: true });
    } else if ((await stat(directory)).mode & 0o077) throw new Error("Backup directory permissions are not private.");
};
const safeDestination = (root, file) => {
    if (typeof file !== "string" || !/^(collections\/[a-z][a-z0-9_.-]*\.bin|metadata\/[a-z][a-z0-9_.-]*\.bin|legacy\/\d+\.bin)$/.test(file)) throw new Error("Invalid package path.");
    return path.join(root, ...file.split("/"));
};
const encryptFile = async (root, file, input, key) => {
    const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv), destination = safeDestination(root, file);
    await pipeline(Readable.from(input), cipher, createWriteStream(destination, { flags: "wx", mode: 0o600 }));
    return { file, iv: iv.toString("hex"), tag: cipher.getAuthTag().toString("hex"), ...await hashFile(destination) };
};
const decryptedStream = (root, entry, key) => {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(entry.iv, "hex")); decipher.setAuthTag(Buffer.from(entry.tag, "hex"));
    const source = createReadStream(safeDestination(root, entry.file));
    source.on("error", error => decipher.destroy(error)); source.pipe(decipher);
    decipher.once("close", () => source.destroy());
    return decipher;
};
const documentsFrom = async function* (root, entry, key) {
    let pending = Buffer.alloc(0);
    for await (const chunk of decryptedStream(root, entry, key)) {
        pending = Buffer.concat([pending, chunk]);
        while (pending.length >= 4) {
            const size = pending.readInt32LE(0);
            if (size < 5 || size > 16 * 1024 * 1024) throw new Error("Invalid BSON frame.");
            if (pending.length < size) break;
            yield bson.deserialize(pending.subarray(0, size)); pending = pending.subarray(size);
        }
    }
    if (pending.length) throw new Error("Truncated BSON archive.");
};
const collectionDigest = async (db, name, transform = value => value) => {
    const hash = createHash("sha256"); let count = 0;
    for await (const document of db.collection(name).find({}).sort({ _id: 1 })) { hash.update(bson.serialize(transform(document))); count++; }
    return { count, digest: hash.digest("hex") };
};
const indexContract = index => ({ name: index.name, key: index.key, unique: Boolean(index.unique), sparse: Boolean(index.sparse), partialFilterExpression: index.partialFilterExpression || null, expireAfterSeconds: index.expireAfterSeconds ?? null, collation: index.collation || null });
const canonical = value => value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : Array.isArray(value) ? value.map(canonical) : value;
const fileReferences = async (db, legacyRoot) => {
    const files = new Map();
    for (const [collection, kind] of [["donations", "donations"], ["organizations", "verification-documents"]]) {
        for await (const document of db.collection(collection).find({})) for (const reference of collection === "donations" ? document.images || [] : document.verificationDocument?.filename ? [document.verificationDocument] : []) {
            const key = mediaKey(kind, reference.filename), bytes = await readPrivateMedia(kind, reference, { legacyRoot });
            const entry = { kind, filename: reference.filename, mimeType: reference.mimeType, size: bytes.length, sha256: mediaDigest(bytes), storage: reference.storage || "legacy" };
            if (files.has(key) && JSON.stringify(files.get(key)) !== JSON.stringify(entry)) throw new Error("Shared media references disagree.");
            files.set(key, entry);
        }
    }
    return [...files.values()].sort((a, b) => mediaKey(a.kind, a.filename).localeCompare(mediaKey(b.kind, b.filename)));
};
export const backupDatabase = async (connection, { directory, key, maintenanceConfirmed = false } = {}) => {
    if (!maintenanceConfirmed) throw new Error("Stop all application, worker and maintenance writers before backup.");
    const secret = keyBytes(key), db = connection.db;
    await assertRecoveryReleased(connection);
    // Media reads deliberately use the configured application connection.
    if (connection !== mongoose.connection) throw new Error("Backup requires the selected application connection.");
    const media = await fileReferences(db);
    const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map(item => item.name).filter(name => !ephemeral.has(name) && !name.startsWith("system.")).sort();
    if (names.some(name => !validCollection(name))) throw new Error("Unsupported collection name.");
    const before = new Map(); for (const name of names) before.set(name, await collectionDigest(db, name));
    const start = new Date();
    const root = path.resolve(directory);
    const publicRoot = path.resolve("public"); if (root === publicRoot || root.startsWith(publicRoot + path.sep)) throw new Error("Backups must be outside public assets.");
    await restrictRecoveryDirectory(root);
    for (const folder of ["collections", "metadata", "legacy"]) await mkdir(path.join(root, folder), { mode: 0o700 });
    const manifest = { version: 1, id: randomUUID(), database: db.databaseName, capturedAt: start.toISOString(), consistency: "offline_stopped_writers", permissions: "owner_only", encryption: "AES-256-GCM", excluded: [...ephemeral].sort(), collections: [], media: [], files: [] };
    for (const name of names) {
        const info = await db.listCollections({ name }).next(), indexes = await db.collection(name).listIndexes().toArray();
        manifest.files.push(await encryptFile(root, `metadata/${name}.bin`, [bson.serialize({ options: info.options, indexes })], secret));
        const input = async function* () { for await (const document of db.collection(name).find({}).sort({ _id: 1 })) yield bson.serialize(document); };
        const entry = await encryptFile(root, `collections/${name}.bin`, input(), secret); manifest.files.push(entry);
        manifest.collections.push({ name, ...before.get(name) });
    }
    for (const reference of media) {
        const entry = { ...reference };
        if (reference.storage === "legacy") {
            const bytes = await readPrivateMedia(reference.kind, { ...reference, storage: undefined });
            const encrypted = await encryptFile(root, `legacy/${manifest.media.length}.bin`, [bytes], secret); manifest.files.push(encrypted); entry.file = encrypted.file;
        }
        manifest.media.push(entry);
    }
    const afterNames = (await db.listCollections({}, { nameOnly: true }).toArray()).map(item => item.name).filter(name => !ephemeral.has(name) && !name.startsWith("system.")).sort();
    if (JSON.stringify(names) !== JSON.stringify(afterNames)) throw new Error("Collections changed during backup.");
    for (const name of names) if (JSON.stringify(before.get(name)) !== JSON.stringify(await collectionDigest(db, name))) throw new Error("Data changed during backup. Keep writers stopped and create a new package.");
    if (JSON.stringify(media) !== JSON.stringify(await fileReferences(db))) throw new Error("Media changed during backup.");
    await writeFile(path.join(root, "manifest.json"), JSON.stringify({ manifest, signature: signature(manifest, secret) }, null, 2), { flag: "wx", mode: 0o600 });
    await verifyBackupPackage(root, key);
    return { directory: root, backupId: manifest.id, collections: names.length, files: media.length, capturedAt: manifest.capturedAt };
};
export const verifyBackupPackage = async (directory, key) => {
    const secret = keyBytes(key), root = await realpath(directory);
    const packageData = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8")); const manifest = packageData.manifest;
    if (!manifest || manifest.version !== 1 || !/^[a-f0-9-]{36}$/.test(manifest.id) || typeof packageData.signature !== "string" || !/^[a-f0-9]{64}$/.test(packageData.signature)) throw new Error("Invalid backup manifest.");
    if (!timingSafeEqual(Buffer.from(signature(manifest, secret), "hex"), Buffer.from(packageData.signature, "hex"))) throw new Error("Backup authentication failed.");
    const seen = new Set();
    for (const entry of manifest.files) {
        if (seen.has(entry.file) || !/^[a-f0-9]{24}$/.test(entry.iv) || !/^[a-f0-9]{32}$/.test(entry.tag)) throw new Error("Invalid encrypted package entry."); seen.add(entry.file);
        const filename = safeDestination(root, entry.file), resolved = await realpath(filename);
        if (resolved !== filename) throw new Error("Package symlinks are not permitted.");
        const actual = await hashFile(filename); if (actual.size !== entry.size || actual.sha256 !== entry.sha256) throw new Error("Backup file checksum failed.");
        // Authenticate all encrypted bytes before creating a restore target.
        for await (const chunk of decryptedStream(root, entry, secret)) { void chunk; }
    }
    for (const entry of manifest.collections) {
        if (!validCollection(entry.name) || ephemeral.has(entry.name)) throw new Error("Invalid backup collection.");
        const archive = manifest.files.find(file => file.file === `collections/${entry.name}.bin`), hash = createHash("sha256"); let count = 0;
        if (!archive || !seen.has(`metadata/${entry.name}.bin`)) throw new Error("Incomplete collection package.");
        for await (const document of documentsFrom(root, archive, secret)) { hash.update(bson.serialize(document)); count++; }
        if (count !== entry.count || hash.digest("hex") !== entry.digest) throw new Error("Backup record count/integrity mismatch.");
    }
    return { root, manifest, secret };
};

const safeRestoreDocument = (name, document, at) => {
    if (name === "users") { document.authVersion = (document.authVersion || 0) + 1; document.notificationEmailEnabled = false; delete document.resetCredential; delete document.verificationCredential; }
    if (name === "notifications") { if (document.mailStatus === "pending") { document.mailStatus = "suppressed"; document.failureCode = "restore_suppressed"; } document.leaseToken = null; document.lockedUntil = null; }
    if (name === "lifecycle_events" && !document.processedAt) document.processedAt = at;
    return document;
};
export const restoreDatabase = async (connection, { directory, key, legacyDirectory, apply = false, maintenanceConfirmed = false } = {}) => {
    const bundle = await verifyBackupPackage(directory, key), db = connection.db;
    if (db.databaseName === bundle.manifest.database || !/^(CareCycle_restore_|carecycle_test_restore_)[a-zA-Z0-9_-]+$/.test(db.databaseName)) throw new Error("Select a separately named fresh restore database.");
    if (await db.listCollections({}, { nameOnly: true }).hasNext()) throw new Error("Restore target must be empty. No existing data is overwritten.");
    if (bundle.manifest.media.some(file => file.storage === "legacy")) {
        if (!legacyDirectory) throw new Error("A fresh legacy uploads directory is required.");
        try { await stat(legacyDirectory); throw new Error("Legacy restore directory must be fresh."); } catch (error) { if (error.code !== "ENOENT") throw error; }
    }
    if (!apply) return { mode: "dry-run", backupId: bundle.manifest.id, collections: bundle.manifest.collections.length, files: bundle.manifest.media.length };
    if (!maintenanceConfirmed) throw new Error("Restore requires stopped writers and isolated infrastructure.");
    const at = new Date(), writeConcern = { w: "majority", wtimeout: 5000 };
    await db.collection("operational_recovery").insertOne({ _id: "restore", state: "quarantined", backupId: bundle.manifest.id, restoredAt: at, verifiedAt: null }, { writeConcern });
    // The marker remains on any error. A partial target is never automatically dropped.
    for (const entry of bundle.manifest.collections) {
        const metadataEntry = bundle.manifest.files.find(file => file.file === `metadata/${entry.name}.bin`);
        let metadata; for await (const document of documentsFrom(bundle.root, metadataEntry, bundle.secret)) metadata = document;
        await db.createCollection(entry.name, metadata.options || {});
        const archive = bundle.manifest.files.find(file => file.file === `collections/${entry.name}.bin`);
        for await (const document of documentsFrom(bundle.root, archive, bundle.secret)) await db.collection(entry.name).insertOne(safeRestoreDocument(entry.name, document, at), { writeConcern });
        for (const index of metadata.indexes) if (index.name !== "_id_") { const { key: fields, v, ns, ...options } = index; await db.collection(entry.name).createIndex(fields, options); }
    }
    const legacy = bundle.manifest.media.filter(file => file.storage === "legacy");
    if (legacy.length) {
        if (!legacyDirectory) throw new Error("A fresh legacy uploads directory is required.");
        await restrictRecoveryDirectory(path.resolve(legacyDirectory));
        for (const kind of ["donations", "verification-documents"]) await mkdir(path.join(legacyDirectory, kind), { mode: 0o700 });
        for (const file of legacy) {
            mediaKey(file.kind, file.filename);
            const encrypted = bundle.manifest.files.find(entry => entry.file === file.file);
            await pipeline(decryptedStream(bundle.root, encrypted, bundle.secret), createWriteStream(path.join(legacyDirectory, file.kind, file.filename), { flags: "wx", mode: 0o600 }));
        }
    }
    await verifyRestoredDatabase(connection, { directory, key, legacyDirectory });
    await db.collection("operational_recovery").updateOne({ _id: "restore" }, { $set: { verifiedAt: new Date() } }, { writeConcern });
    return { mode: "restored_quarantined", backupId: bundle.manifest.id, collections: bundle.manifest.collections.length, files: bundle.manifest.media.length };
};

export const verifyBusinessConsistency = async connection => {
    const db = connection.db;
    const [users, organizations, donations, requests, audits] = await Promise.all(["users", "organizations", "donations", "donation_requests", "audit_logs"].map(name => db.collection(name).find({}).toArray()));
    const userIds = new Set(users.map(item => String(item._id))), orgIds = new Set(organizations.map(item => String(item._id))), donationIds = new Set(donations.map(item => String(item._id)));
    const userById = new Map(users.map(item => [String(item._id), item])), orgById = new Map(organizations.map(item => [String(item._id), item]));
    for (const user of users) if (!["donor", "ngo", "admin"].includes(user.role) || !Number.isSafeInteger(user.authVersion ?? 0)) throw new Error("Restored account roles/versions are inconsistent.");
    for (const organization of organizations) if (userById.get(String(organization.owner))?.role !== "ngo") throw new Error("Organization owner is missing or has an invalid role.");
    for (const request of requests) {
        if (!donationIds.has(String(request.donation)) || !orgIds.has(String(request.organization)) || !userIds.has(String(request.requestedBy))) throw new Error("Request ownership references are inconsistent.");
        if (String(orgById.get(String(request.organization)).owner) !== String(request.requestedBy)) throw new Error("Request actor does not own its organization.");
        const accounting = requestAccounting(request); if (request.fulfillment && !accounting.tracked) throw new Error("Fulfillment transfer accounting is inconsistent.");
        if (request.receipt) {
            if (!userIds.has(String(request.receipt.donorId)) || request.receipt.reference !== `CC-${String(request._id).toUpperCase()}` || !request.receipt.revisions?.length) throw new Error("Receipt references are inconsistent.");
            for (const [index, revision] of request.receipt.revisions.entries()) if (revision.number !== index + 1 || !revision.html || revision.snapshot?.reference !== request.receipt.reference || !userIds.has(String(revision.actor))) throw new Error("Receipt revisions are inconsistent.");
        }
    }
    for (const donation of donations) {
        if (userById.get(String(donation.donor))?.role !== "donor") throw new Error("Donation owner is missing or has an invalid role.");
        const accounting = quantityAccounting(donation); const commitments = requests.filter(item => String(item.donation) === String(donation._id) && ["accepted", "completed"].includes(item.status));
        if (commitments.reduce((sum, item) => sum + item.quantity - (item.releasedQuantity || 0), 0) !== accounting.allocated || commitments.reduce((sum, item) => sum + (item.handedOverQuantity || 0), 0) !== accounting.handedOver) throw new Error("Listing allocations do not reconcile with requests.");
    }
    const targets = { user: userIds, organization: orgIds, donation: donationIds, request: new Set(requests.map(item => String(item._id))) };
    for (const audit of audits) if (!userIds.has(String(audit.actor)) || !targets[audit.targetType]?.has(String(audit.targetId))) throw new Error("Audit references are inconsistent.");
    return { users: users.length, organizations: organizations.length, donations: donations.length, requests: requests.length, receipts: requests.filter(item => item.receipt).length, audits: audits.length };
};
export const verifyRestoredDatabase = async (connection, { directory, key, legacyDirectory } = {}) => {
    const bundle = await verifyBackupPackage(directory, key), db = connection.db;
    const marker = await db.collection("operational_recovery").findOne({ _id: "restore", backupId: bundle.manifest.id }); if (!marker || marker.state !== "quarantined") throw new Error("Recovery verification requires its quarantined restore marker.");
    for (const entry of bundle.manifest.collections) {
        const hash = createHash("sha256"), archive = bundle.manifest.files.find(file => file.file === `collections/${entry.name}.bin`); let count = 0;
        for await (const document of documentsFrom(bundle.root, archive, bundle.secret)) { hash.update(bson.serialize(safeRestoreDocument(entry.name, document, marker.restoredAt))); count++; }
        const restored = await collectionDigest(db, entry.name); if (count !== restored.count || hash.digest("hex") !== restored.digest) throw new Error("Restored content does not match its verified backup and safety transformations.");
        const metadataEntry = bundle.manifest.files.find(file => file.file === `metadata/${entry.name}.bin`);
        let metadata; for await (const document of documentsFrom(bundle.root, metadataEntry, bundle.secret)) metadata = document;
        const restoredIndexes = await db.collection(entry.name).listIndexes().toArray();
        for (const expected of metadata.indexes) {
            const actual = restoredIndexes.find(index => index.name === expected.name);
            if (!actual || JSON.stringify(canonical(indexContract(expected))) !== JSON.stringify(canonical(indexContract(actual)))) throw new Error("Restored index contract is inconsistent.");
        }
    }
    for (const name of ephemeral) if (name !== "operational_recovery" && await db.collection(name).countDocuments()) throw new Error("Restored security or worker state is not empty.");
    const bucket = new mongoose.mongo.GridFSBucket(db, { bucketName: "private_media" });
    for (const file of bundle.manifest.media) {
        mediaKey(file.kind, file.filename); let bytes;
        if (file.storage === "legacy") bytes = await readFile(path.join(legacyDirectory, file.kind, file.filename));
        else { const parts = []; for await (const chunk of bucket.openDownloadStream(mediaKey(file.kind, file.filename))) parts.push(chunk); bytes = Buffer.concat(parts); }
        if (bytes.length !== file.size || mediaDigest(bytes) !== file.sha256) throw new Error("Restored private file integrity failed.");
    }
    return { ...await verifyBusinessConsistency(connection), files: bundle.manifest.media.length, notificationsQuarantined: true };
};
export const releaseRecovery = async (connection, options = {}) => {
    const verified = await verifyRestoredDatabase(connection, options);
    if (!options.apply) return { mode: "review_required", ...verified };
    if (!options.maintenanceConfirmed || !options.reviewConfirmed) throw new Error("Release requires verified recovery, stopped writers and operational/privacy review.");
    const result = await connection.db.collection("operational_recovery").updateOne({ _id: "restore", state: "quarantined" }, { $set: { state: "released", reviewedAt: new Date() } }, { writeConcern: { w: "majority", wtimeout: 5000 } });
    if (result.modifiedCount !== 1) throw new Error("Recovery release marker changed during review.");
    return { mode: "released", oldNotificationsSuppressed: true };
};
export const verifyCurrentDatabase = async (connection, { legacyDirectory } = {}) => {
    if (connection !== mongoose.connection) throw new Error("Select the current application connection for private-file verification.");
    await assertRecoveryReleased(connection);
    return { ...await verifyBusinessConsistency(connection), files: (await fileReferences(connection.db, legacyDirectory)).length };
};
