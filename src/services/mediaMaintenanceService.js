import mongoose from "mongoose";
import { readPrivateMedia, writePrivateMedia, mediaDigest, mediaKey, MEDIA_BUCKET } from "./privateStorageService.js";
import { matchesImageSignature } from "./imageService.js";
import { matchesDocumentSignature } from "./verificationDocumentService.js";

const collections = ["donations", "organizations"];
const entriesFor = document => document.images ? document.images.map((reference, slot) => ({ kind: "donations", slot, reference })) :
    document.verificationDocument?.filename ? [{ kind: "verification-documents", slot: null, reference: document.verificationDocument }] : [];
const validBytes = (kind, reference, bytes) => (kind === "donations" ? matchesImageSignature : matchesDocumentSignature)({ buffer: bytes, mimetype: reference.mimeType });

export const createMediaManifest = async ({ legacyRoot } = {}) => {
    const db = mongoose.connection.db;
    const entries = [];
    for (const collection of collections) {
        for await (const document of db.collection(collection).find({}).sort({ _id: 1 })) {
            for (const entry of entriesFor(document)) {
                if (entry.reference.storage === "gridfs") continue;
                const bytes = await readPrivateMedia(entry.kind, entry.reference, { legacyRoot });
                if (!validBytes(entry.kind, entry.reference, bytes)) throw new Error("A legacy file has an invalid signature. No references changed.");
                entries.push({ collection, ownerId: String(document._id), slot: entry.slot, kind: entry.kind, filename: entry.reference.filename,
                    mimeType: entry.reference.mimeType, size: bytes.length, sha256: mediaDigest(bytes) });
            }
        }
    }
    const uniqueFiles = new Map(entries.map(entry => [mediaKey(entry.kind, entry.filename), entry]));
    return { version: 1, database: db.databaseName, fileCount: uniqueFiles.size, referenceCount: entries.length,
        totalBytes: [...uniqueFiles.values()].reduce((sum, entry) => sum + entry.size, 0), entries };
};

const sameManifest = (left, right) => JSON.stringify(left) === JSON.stringify(right);
export const migratePrivateMedia = async (manifest, { apply = false, legacyRoot } = {}) => {
    // Recompute every source hash/count before copying anything. A stale, altered,
    // cross-database or partially applied manifest must be regenerated.
    const current = await createMediaManifest({ legacyRoot });
    if (!sameManifest(manifest, current)) throw new Error("Manifest no longer matches source files and references. Regenerate the dry run.");
    if (!apply) return { verifiedFiles: current.fileCount, verifiedBytes: current.totalBytes, changedReferences: 0 };
    const db = mongoose.connection.db;
    const updates = new Map();
    // Verify every destination before any reference changes. Successful copies
    // survive a failed migration and can be reused on retry; originals stay intact.
    for (const entry of current.entries) {
        const groupKey = `${entry.collection}/${entry.ownerId}`;
        let group = updates.get(groupKey);
        if (!group) {
            const document = await db.collection(entry.collection).findOne({ _id: new mongoose.Types.ObjectId(entry.ownerId) });
            if (!document) throw new Error("A source record changed during migration.");
            group = { collection: entry.collection, document, updates: {} }; updates.set(groupKey, group);
        }
        const reference = entry.slot === null ? group.document.verificationDocument : group.document.images[entry.slot];
        const bytes = await readPrivateMedia(entry.kind, reference, { legacyRoot });
        if (mediaDigest(bytes) !== entry.sha256) throw new Error("A source file changed during migration.");
        const saved = await writePrivateMedia(entry.kind, reference, bytes);
        const copied = await readPrivateMedia(entry.kind, saved);
        if (!copied.equals(bytes)) throw new Error("Copied file integrity check failed.");
        group.updates[entry.slot === null ? "verificationDocument" : `images.${entry.slot}`] = saved;
    }
    // Verify source membership and count once more before the atomic switch.
    if (!sameManifest(current, await createMediaManifest({ legacyRoot }))) throw new Error("Source files or references changed while copying.");
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            for (const group of updates.values()) {
                const field = group.collection === "donations" ? "images" : "verificationDocument";
                const result = await db.collection(group.collection).updateOne({ _id: group.document._id, [field]: group.document[field] },
                    { $set: group.updates, $inc: { __v: 1 } }, { session });
                if (result.matchedCount !== 1) throw new Error("Reference changed during migration. All reference changes rolled back.");
            }
        }, { writeConcern: { w: "majority" }, readConcern: { level: "snapshot" } });
    } finally { await session.endSession(); }
    return { verifiedFiles: current.fileCount, verifiedBytes: current.totalBytes, changedReferences: current.referenceCount };
};

export const cleanupPrivateMedia = async ({ apply = false, now = new Date() } = {}) => {
    const db = mongoose.connection.db;
    const referenced = new Set();
    for (const collection of collections) {
        for await (const document of db.collection(collection).find({})) {
            for (const entry of entriesFor(document)) if (entry.reference.storage === "gridfs") referenced.add(mediaKey(entry.kind, entry.reference.filename));
        }
    }
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const candidates = new Set();
    for await (const file of db.collection(`${MEDIA_BUCKET}.files`).find({ uploadDate: { $lte: cutoff } })) if (!referenced.has(file._id)) candidates.add(file._id);
    for await (const lease of db.collection(`${MEDIA_BUCKET}_uploads`).find({ startedAt: { $lte: cutoff } })) if (!referenced.has(lease._id)) candidates.add(lease._id);
    let deleted = 0;
    if (apply) {
        for (const key of candidates) {
            // Recheck current references immediately before removal. Maintenance
            // attestation is still required: GridFS deletion is not transactional.
            const slash = key.indexOf("/"); const kind = key.slice(0, slash), filename = key.slice(slash + 1);
            mediaKey(kind, filename);
            const inUse = kind === "donations" ? await db.collection("donations").findOne({ images: { $elemMatch: { filename, storage: "gridfs" } } }) :
                await db.collection("organizations").findOne({ "verificationDocument.filename": filename, "verificationDocument.storage": "gridfs" });
            if (inUse) throw new Error("A cleanup candidate became referenced. Stop all writers and repeat the dry run.");
            await db.collection(`${MEDIA_BUCKET}.files`).deleteOne({ _id: key }, { writeConcern: { w: "majority" } });
            await db.collection(`${MEDIA_BUCKET}.chunks`).deleteMany({ files_id: key }, { writeConcern: { w: "majority" } });
            await db.collection(`${MEDIA_BUCKET}_uploads`).deleteOne({ _id: key }, { writeConcern: { w: "majority" } });
            deleted++;
        }
    }
    // Local originals and untracked chunks are intentionally never swept.
    return { graceHours: 24, candidates: [...candidates].sort(), deleted };
};
