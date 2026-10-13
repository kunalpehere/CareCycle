import { env } from "../config/env.js";
import { assertRecoveryReleased } from "./recoveryGuardService.js";

export class DemoIsolationError extends Error {
    constructor() { super("A marked synthetic demo database must run with DEMO_MODE enabled."); this.name = "DemoIsolationError"; }
}

export const assertDemoDatabase = async (connection, { ready = true } = {}) => {
    if (!env.demoMode || connection.name !== env.mongoDbName) throw new Error("Demo operations require the explicitly configured isolated demo database.");
    await assertRecoveryReleased(connection);
    const marker = await connection.db.collection("demo_control").findOne({ _id: "isolated-demo-v1", database: connection.name }, { maxTimeMS: 1000 });
    if (!marker || !Number.isSafeInteger(marker.generation) || marker.generation < 0 || (ready && marker.state !== "ready")) throw new Error("Initialize the isolated demo before startup, or finish its maintenance operation.");
    return marker;
};
