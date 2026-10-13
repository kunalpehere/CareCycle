import mongoose from "mongoose";
import { env } from "../config/env.js";
import { prepareDemo } from "./demoService.js";
import { assertDemoDatabase } from "./demoGuardService.js";
import { verifyReplicaSet } from "../config/topology.js";

// First boot may prepare a fresh dedicated database. Existing data is never reset.
export const initializeConnectedDemo = async (connection, confirmation) => {
    if (!env.demoMode || confirmation !== env.mongoDbName || connection.name !== confirmation) throw new Error("Exact isolated demo confirmation is required.");
    const marker = await connection.db.collection("demo_control").findOne({ _id: "isolated-demo-v1" });
    if (marker) { await assertDemoDatabase(connection); return "existing"; }
    await prepareDemo(connection, { confirmation });
    return "initialized";
};

export const initializeRenderDemo = async confirmation => {
    mongoose.set("strictQuery", true);
    try {
        await mongoose.connect(env.mongoUri, { dbName: env.mongoDbName, autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000 });
        await verifyReplicaSet(mongoose.connection, true);
        const result = await initializeConnectedDemo(mongoose.connection, confirmation);
        console.log(JSON.stringify({ event: "render.demo.prepared", result }));
    } finally { await mongoose.disconnect(); }
};
