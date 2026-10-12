import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { verifyReplicaSet } from "../src/config/topology.js";
import { migrateRequestIndex } from "../src/services/requestIndexMigration.js";

try {
    const args = process.argv.slice(2);
    if (args.some(arg => !["--apply", "--maintenance-confirmed"].includes(arg)) ||
        (args.includes("--apply") && !args.includes("--maintenance-confirmed"))) throw new Error("Invalid options or missing maintenance attestation.");
    await mongoose.connect(env.mongoUri, { dbName: env.mongoDbName, autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000 });
    await verifyReplicaSet(mongoose.connection, true);
    const report = await migrateRequestIndex(mongoose.connection, { apply: args.includes("--apply") });
    console.log(JSON.stringify(report, null, 2));
    if (report.invalidRecords.length || report.conflictingRequestIds.length || report.incompatibleIndexes.length) process.exitCode = 1;
} catch {
    console.error("Request index migration failed. Check options, stopped writers, configuration and replica-set readiness. Keep writers stopped and rerun the dry run; details are in docs/day-7-request-policies.md.");
    process.exitCode = 1;
} finally { await mongoose.disconnect(); }
