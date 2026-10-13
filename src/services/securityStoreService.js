import session from "express-session";
import mongoose from "mongoose";
import { createHash, createHmac } from "node:crypto";
import { env } from "../config/env.js";

export const SESSION_LIFETIME_MS = 30 * 60 * 1000;
export const sessionKey = sid => createHash("sha256").update(sid).digest("hex");
export class SecurityStoreError extends Error {
    constructor() { super("Security storage is temporarily unavailable. Try again later."); this.status = 503; }
}
const collection = (connection, name) => {
    if (connection.readyState !== 1 || !connection.db) throw new SecurityStoreError();
    return connection.db.collection(name);
};
const options = { maxTimeMS: 5000, writeConcern: { w: "majority", wtimeout: 5000 } };
export const initializeSecurityStores = async (connection = mongoose.connection) => {
    await collection(connection, "security_sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "session_expiry" });
    await collection(connection, "security_limits").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "limit_expiry" });
};

export class MongoSessionStore extends session.Store {
    constructor(connection = mongoose.connection) { super(); this.connection = connection; }
    perform(operation, callback) {
        Promise.resolve().then(operation).then(value => callback(null, value), () => callback(new SecurityStoreError()));
    }
    get(sid, callback) {
        this.perform(async () => {
            const record = await collection(this.connection, "security_sessions").findOne({ _id: sessionKey(sid), revoked: { $ne: true }, expiresAt: { $gt: new Date() } }, { maxTimeMS: 5000 });
            return record ? JSON.parse(record.data) : null;
        }, callback);
    }
    set(sid, value, callback) {
        this.perform(async () => {
            const expiresAt = value.cookie?.expires ? new Date(value.cookie.expires) : new Date(Date.now() + SESSION_LIFETIME_MS);
            await collection(this.connection, "security_sessions").updateOne({ _id: sessionKey(sid), revoked: { $ne: true } },
                { $set: { data: JSON.stringify(value), expiresAt } }, { ...options, upsert: true });
        }, callback);
    }
    touch(sid, value, callback) {
        this.perform(() => collection(this.connection, "security_sessions").updateOne({ _id: sessionKey(sid), revoked: { $ne: true } },
            { $set: { expiresAt: new Date(value.cookie.expires || Date.now() + SESSION_LIFETIME_MS) } }, options), callback);
    }
    destroy(sid, callback) {
        // A stale concurrent save cannot upsert a logged-out session again.
        this.perform(() => collection(this.connection, "security_sessions").updateOne({ _id: sessionKey(sid) },
            { $set: { revoked: true, expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS) }, $unset: { data: "" } }, { ...options, upsert: true }), callback);
    }
}

export const consumeRateLimit = async ({ namespace, address, windowMs, max, connection = mongoose.connection }) => {
    const id = createHmac("sha256", env.sessionSecret).update(`${namespace}:${windowMs}:${max}:${address}`).digest("hex");
    const expired = { $lte: [{ $ifNull: ["$resetAt", new Date(0)] }, "$$NOW"] };
    const pipeline = [{ $set: {
        count: { $cond: [expired, 1, { $min: [max + 1, { $add: [{ $ifNull: ["$count", 0] }, 1] }] }] },
        resetAt: { $cond: [expired, { $add: ["$$NOW", windowMs] }, "$resetAt"] },
        expiresAt: { $cond: [expired, { $add: ["$$NOW", windowMs + 60000] }, "$expiresAt"] }
    } }];
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const result = await collection(connection, "security_limits").findOneAndUpdate({ _id: id }, pipeline, { ...options, upsert: true, returnDocument: "after" });
            return { allowed: result.value.count <= max, resetAt: result.value.resetAt };
        } catch (error) { if (error.code === 11000 && attempt < 2) continue; throw new SecurityStoreError(); }
    }
};
