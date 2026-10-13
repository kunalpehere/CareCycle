import mongoose from "mongoose";
import { env } from "../config/env.js";
import { MEDIA_BUCKET } from "./privateStorageService.js";
import { telemetry } from "./observabilityService.js";
import { assertDemoDatabase } from "./demoGuardService.js";

const bound = async callback => {
    let timer;
    try { return await Promise.race([Promise.resolve().then(callback), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Probe timeout")), 2000); timer.unref(); })]); }
    finally { clearTimeout(timer); }
};
export const initializeDiagnostics = async connection => {
    await connection.db.collection("operational_workers").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
};
const unavailable = () => ({ ready: false, database: "unavailable", security: "unavailable", storage: "unavailable" });
let readinessInFlight = null;
const probeDependencies = async () => {
    const db = mongoose.connection.db;
    const probe = async callback => { try { await callback(); return "ready"; } catch { return "unavailable"; } };
    const [database, security, storage] = await Promise.all([
        probe(async () => { const hello = await db.command({ hello: 1 }, { maxTimeMS: 1000 }); if (!hello.isWritablePrimary || (env.mongoRequireReplicaSet && !hello.setName)) throw new Error(); if (env.demoMode) await assertDemoDatabase(mongoose.connection); }),
        probe(async () => { for (const name of ["security_sessions", "security_limits"]) { const indexes = await db.collection(name).listIndexes({ maxTimeMS: 1000 }).toArray(); if (!indexes.some(index => index.key.expiresAt === 1 && index.expireAfterSeconds === 0)) throw new Error(); await db.collection(name).findOne({}, { projection: { _id: 1 }, maxTimeMS: 1000 }); } }),
        probe(async () => { for (const name of [`${MEDIA_BUCKET}.files`, `${MEDIA_BUCKET}.chunks`]) { const indexes = await db.collection(name).listIndexes({ maxTimeMS: 1000 }).toArray(); if (!indexes.some(index => name.endsWith("chunks") ? index.unique && index.key.files_id === 1 && index.key.n === 1 : index.key.filename === 1 && index.key.uploadDate === 1)) throw new Error(); await db.collection(name).findOne({}, { projection: { _id: 1 }, maxTimeMS: 1000 }); } })
    ]);
    return { ready: [database, security, storage].every(status => status === "ready"), database, security, storage };
};
export const dependencyReadiness = async () => {
    if (mongoose.connection.readyState !== 1) return unavailable();
    // Keep one actual probe in flight even if its response deadline expires.
    // Repeated health polls cannot accumulate hung network operations.
    if (!readinessInFlight) readinessInFlight = probeDependencies().finally(() => { readinessInFlight = null; });
    const pending = readinessInFlight;
    try { const result = await bound(() => pending); return mongoose.connection.readyState === 1 ? result : unavailable(); } catch { return unavailable(); }
};

export const loadOperationalDiagnostics = async ({ now = new Date() } = {}) => {
    const dependencies = await dependencyReadiness();
    if (!dependencies.ready) return { dependencies, metrics: telemetry.snapshot(), notifications: { status: "unavailable" } };
    const db = mongoose.connection.db;
    const notifications = await bound(async () => {
        const [workers, mail, pendingEvents] = await Promise.all([
            db.collection("operational_workers").find({ expiresAt: { $gt: now } }, { projection: { _id: 0, status: 1, heartbeatAt: 1, batchStartedAt: 1, lastSuccessAt: 1, lastFailureAt: 1, mailConfigured: 1 }, maxTimeMS: 1000 }).limit(50).toArray(),
            db.collection("notifications").aggregate([{ $group: { _id: "$mailStatus", count: { $sum: 1 }, retries: { $sum: { $cond: [{ $eq: ["$failureCode", "delivery_failed"] }, 1, 0] } }, oldest: { $min: "$createdAt" } } }], { maxTimeMS: 1000 }).toArray(),
            db.collection("lifecycle_events").countDocuments({ processedAt: null }, { maxTimeMS: 1000 })
        ]);
        const workerStates = workers.map(worker => ({ ...worker, health: worker.status === "stopped" ? "stopped" : !worker.heartbeatAt || now - worker.heartbeatAt > 45000 ? "stale" : worker.status === "failed" || worker.status === "running" && now - worker.batchStartedAt > 600000 ? "degraded" : "healthy" }));
        const counts = { pending: 0, sent: 0, failed: 0, disabled: 0, suppressed: 0 }; let retrying = 0, oldestPendingAt = null;
        for (const row of mail) if (Object.hasOwn(counts, row._id)) { counts[row._id] = row.count; if (row._id === "pending") { retrying = row.retries; oldestPendingAt = row.oldest; } }
        return { status: !workerStates.some(worker => worker.health === "healthy") || counts.failed || retrying ? "degraded" : "healthy", emailConfiguration: env.mailUser && env.mailPassword ? "configured" : "disabled", pendingEvents, mail: counts, retrying, oldestPendingAt, workers: workerStates };
    }).catch(() => ({ status: "unavailable" }));
    return { dependencies, metrics: telemetry.snapshot(), notifications };
};
