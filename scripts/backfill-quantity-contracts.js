import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { verifyReplicaSet } from "../src/config/topology.js";
import { backfillQuantities } from "../src/services/quantityBackfill.js";

// Deliberately do not import models or connectDatabase: dry-run must not create indexes.
try {
    const args = process.argv.slice(2);
    if (args.some(arg => !["--apply", "--maintenance-confirmed"].includes(arg))) throw new Error("Unknown option.");
    const apply = args.includes("--apply");
    if (apply && !args.includes("--maintenance-confirmed")) throw new Error("Stop application writers and pass --maintenance-confirmed for apply.");
    await mongoose.connect(env.mongoUri, { dbName: env.mongoDbName, autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000 });
    await verifyReplicaSet(mongoose.connection, true);
    const report = await backfillQuantities(mongoose.connection, { apply });
    console.log(JSON.stringify(report, null, 2));
    if (report.blocked || report.orphanRequests.length) process.exitCode = 1;
} catch {
    console.error("Quantity backfill failed. Check options, maintenance mode, configuration and replica-set readiness. Connection details are not printed.");
    process.exitCode = 1;
} finally { await mongoose.disconnect(); }
