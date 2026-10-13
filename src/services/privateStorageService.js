import mongoose from "mongoose";
import { createHash } from "node:crypto";
import path from "node:path";
import { open, unlink } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export const MEDIA_BUCKET = "private_media";
export const mediaDigest = bytes => createHash("sha256").update(bytes).digest("hex");
const limits = { donations: 5 * 1024 * 1024, "verification-documents": 8 * 1024 * 1024 };
const mimeTypes = { donations: ["image/jpeg", "image/png", "image/webp"], "verification-documents": ["application/pdf", "image/jpeg", "image/png"] };
export class MediaStorageError extends Error {
    constructor() { super("Private file storage is temporarily unavailable. Please try again later."); this.status = 503; }
}
export const mediaKey = (kind, filename) => {
    if (!Object.hasOwn(limits, kind) || typeof filename !== "string" || !/^[a-zA-Z0-9_-]+\.(jpg|png|webp|pdf)$/.test(filename)) throw Object.assign(new Error("File not found"), { status: 404 });
    return `${kind}/${filename}`;
};
export const legacyMediaPath = (kind, filename, root = path.resolve("uploads")) => {
    mediaKey(kind, filename);
    return path.join(root, kind, filename);
};
const bucket = () => {
    if (mongoose.connection.readyState !== 1) throw new MediaStorageError();
    return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: MEDIA_BUCKET, writeConcern: { w: "majority", wtimeout: 5000 }, readPreference: "primary" });
};
export const initializePrivateStorage = async connection => {
    await connection.db.collection(`${MEDIA_BUCKET}.files`).createIndex({ filename: 1, uploadDate: 1 });
    await connection.db.collection(`${MEDIA_BUCKET}.chunks`).createIndex({ files_id: 1, n: 1 }, { unique: true });
};

// Immutable bytes: no lossy normalization, extracted EXIF, or public derivatives.
// Hashes cover the exact original, including embedded metadata.
export const writePrivateMedia = async (kind, reference, bytes) => {
    const key = mediaKey(kind, reference.filename);
    if (!mimeTypes[kind].includes(reference.mimeType) || !Buffer.isBuffer(bytes) || !bytes.length || bytes.length > limits[kind] || reference.size !== bytes.length) throw Object.assign(new Error("Invalid file size or type."), { status: 400 });
    const sha256 = mediaDigest(bytes);
    const storage = bucket();
    try {
        const existing = await storage.find({ _id: key }).next();
        if (existing) {
            const stored = await readPrivateMedia(kind, { ...reference, storage: "gridfs", sha256 });
            if (!stored.equals(bytes)) throw new MediaStorageError();
        } else {
            const db = mongoose.connection.db;
            // A lease prevents simultaneous writers from replacing immutable bytes
            // and makes interrupted chunks identifiable for aged orphan cleanup.
            await db.collection(`${MEDIA_BUCKET}_uploads`).insertOne({ _id: key, startedAt: new Date() }, { writeConcern: { w: "majority" } });
            const stream = storage.openUploadStreamWithId(key, key, { metadata: { kind, mimeType: reference.mimeType, sha256, policy: "original-v1" } });
            try {
                await pipeline(Readable.from([bytes]), stream);
                await db.collection(`${MEDIA_BUCKET}_uploads`).deleteOne({ _id: key });
            } catch (error) {
                await stream.abort().catch(() => undefined);
                // Keep the lease if compensation cannot finish; cleanup can retry.
                await removePrivateMedia(kind, { ...reference, storage: "gridfs" });
                throw error;
            }
        }
        return { ...reference, storage: "gridfs", sha256 };
    } catch (error) { if (error instanceof MediaStorageError) throw error; throw new MediaStorageError(); }
};

export const readPrivateMedia = async (kind, reference, { legacyRoot } = {}) => {
    const key = mediaKey(kind, reference.filename);
    if (!mimeTypes[kind].includes(reference.mimeType) || (reference.storage !== undefined && reference.storage !== "gridfs") ||
        (reference.storage === "gridfs" && (typeof reference.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(reference.sha256)))) throw new MediaStorageError();
    let bytes;
    if (reference.storage !== "gridfs") {
        let handle;
        try {
            handle = await open(legacyMediaPath(kind, reference.filename, legacyRoot), "r");
            const stat = await handle.stat();
            if (!stat.isFile() || stat.size !== reference.size || stat.size < 1 || stat.size > limits[kind]) throw new MediaStorageError();
            // Bound legacy reads too, even if a local file grows while reading.
            const data = Buffer.alloc(stat.size + 1); let length = 0;
            while (length < data.length) {
                const result = await handle.read(data, length, data.length - length, length);
                if (!result.bytesRead) break;
                length += result.bytesRead;
            }
            bytes = data.subarray(0, length);
        }
        catch (error) { if (error.code === "ENOENT") throw Object.assign(new Error("File not found"), { status: 404 }); throw new MediaStorageError(); }
        finally { if (handle) await handle.close(); }
    } else {
        const storage = bucket();
        try {
            const file = await storage.find({ _id: key }).next();
            if (!file) throw Object.assign(new Error("File not found"), { status: 404 });
            if (file.length !== reference.size || file.length > limits[kind] || file.metadata?.mimeType !== reference.mimeType || file.metadata?.sha256 !== reference.sha256) throw new MediaStorageError();
            const chunks = []; let size = 0;
            for await (const chunk of storage.openDownloadStream(key)) {
                size += chunk.length;
                if (size > limits[kind]) throw new MediaStorageError();
                chunks.push(chunk);
            }
            bytes = Buffer.concat(chunks);
        } catch (error) { if (error.status === 404) throw error; throw new MediaStorageError(); }
    }
    if (bytes.length !== reference.size || bytes.length > limits[kind] || (reference.sha256 && mediaDigest(bytes) !== reference.sha256)) throw new MediaStorageError();
    return bytes;
};

export const removePrivateMedia = async (kind, reference) => {
    if (!reference?.filename) return;
    const key = mediaKey(kind, reference.filename);
    if (reference.storage !== undefined && reference.storage !== "gridfs") throw new MediaStorageError();
    try {
        if (mongoose.connection.readyState !== 1) throw new MediaStorageError();
        const db = mongoose.connection.db;
        const storageMatch = reference.storage === "gridfs" ? "gridfs" : { $exists: false };
        const inUse = kind === "donations" ? await db.collection("donations").findOne({ images: { $elemMatch: { filename: reference.filename, storage: storageMatch } } }) :
            await db.collection("organizations").findOne({ "verificationDocument.filename": reference.filename, "verificationDocument.storage": storageMatch });
        if (inUse) return;
        if (reference.storage === "gridfs") {
            // Idempotent compensation, including incomplete upload chunks.
            await db.collection(`${MEDIA_BUCKET}.files`).deleteOne({ _id: key }, { writeConcern: { w: "majority" } });
            await db.collection(`${MEDIA_BUCKET}.chunks`).deleteMany({ files_id: key }, { writeConcern: { w: "majority" } });
            await db.collection(`${MEDIA_BUCKET}_uploads`).deleteOne({ _id: key }, { writeConcern: { w: "majority" } });
        } else await unlink(legacyMediaPath(kind, reference.filename));
    } catch (error) { if (error.code !== "ENOENT") throw new MediaStorageError(); }
};

// The caller must resolve ownership/visibility before invoking this method.
export const sendPrivateMedia = async (res, kind, reference) => {
    const bytes = await readPrivateMedia(kind, reference);
    res.set({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Type": reference.mimeType,
        "Content-Disposition": `inline; filename="${reference.filename}"`, ETag: `"${mediaDigest(bytes)}"` });
    res.vary("Cookie");
    res.send(bytes);
};
