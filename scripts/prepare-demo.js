import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { verifyReplicaSet } from "../src/config/topology.js";
import { prepareDemo } from "../src/services/demoService.js";

try {
    const [action, confirmation, ...extra] = process.argv.slice(2);
    mongoose.set("strictQuery", true);
    if (!["init", "reset"].includes(action) || !confirmation || extra.length || !env.demoMode) throw new Error("Use demo:prepare -- init|reset <exact-database-name> with DEMO_MODE=true.");
    await mongoose.connect(env.mongoUri, { dbName: env.mongoDbName, autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000 });
    await verifyReplicaSet(mongoose.connection, true);
    await prepareDemo(mongoose.connection, { reset: action === "reset", confirmation });
    console.log("Synthetic demo prepared. Start the application and verify /demo and health checks.");
} catch { console.error("Demo preparation failed. Check configuration, fresh database/marker, exact confirmation, stopped writers, and replica-set access. No connection details are printed. See docs/staging-deployment.md."); process.exitCode = 1; }
finally { await mongoose.disconnect(); }
