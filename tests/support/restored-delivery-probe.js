import mongoose from "mongoose";
import { processEmailBatch } from "../../src/services/notificationWorker.js";
import { RecoveryQuarantineError } from "../../src/services/recoveryGuardService.js";
if (process.env.NODE_ENV !== "test" || !/^carecycle_test_restore_/.test(process.env.MONGO_DB_NAME || "")) throw new Error("Isolated restore probe required.");
let attempted = false, blocked = false;
try {
    await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB_NAME, autoIndex: false });
    try { await processEmailBatch({ send: async () => { attempted = true; } }); } catch (error) { blocked = error instanceof RecoveryQuarantineError; }
    console.log(JSON.stringify({ blocked, attempted }));
} finally { await mongoose.disconnect(); }
