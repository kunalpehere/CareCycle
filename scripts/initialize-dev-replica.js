import mongoose from "mongoose";
import { readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Fixed localhost target, no application .env or externally supplied URI.
const client = new mongoose.mongo.MongoClient("mongodb://127.0.0.1:27018/?directConnection=true", { serverSelectionTimeoutMS: 5000 });
try {
    await client.connect();
    const admin = client.db("admin");
    let hello = await admin.command({ hello: 1 });
    if (hello.setName && hello.setName !== "carecycle-dev") throw new Error("The local target belongs to another replica set. No changes were made.");
    const options = await admin.command({ getCmdLineOpts: 1 });
    const configuredName = options.parsed?.replication?.replSetName || options.parsed?.replication?.replSet;
    const root = await realpath(fileURLToPath(new URL("..", import.meta.url)));
    const expectedDirectory = await realpath(path.join(root, ".local-data", "carecycle-dev-replica"));
    const actualDirectory = await realpath(options.parsed?.storage?.dbPath || ".");
    if (!expectedDirectory.startsWith(`${root}${path.sep}`) || configuredName !== "carecycle-dev" || actualDirectory !== expectedDirectory) throw new Error("Start the documented localhost carecycle-dev instance with this project's prepared development directory before initializing it.");
    if (!hello.setName) {
        const markerPath = path.join(expectedDirectory, "carecycle-development-only.json");
        const marker = JSON.parse(await readFile(markerPath, "utf8"));
        if (marker.preparedEmpty !== true || marker.initialized !== false) throw new Error("The local target has no fresh preparation record. Refusing to initialize it; follow the fresh-directory instructions.");
        await admin.command({ replSetInitiate: { _id: "carecycle-dev", members: [{ _id: 0, host: "localhost:27018" }] } });
        await writeFile(markerPath, JSON.stringify({ preparedEmpty: true, initialized: true }));
    }
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        hello = await admin.command({ hello: 1 });
        if (hello.setName === "carecycle-dev" && hello.isWritablePrimary && typeof hello.logicalSessionTimeoutMinutes === "number") break;
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!hello.isWritablePrimary || hello.setName !== "carecycle-dev") throw new Error("The development replica set has not elected a primary yet. Check its local logs and rerun this command.");
    console.log("carecycle-dev is ready on localhost:27018. This single-member development set is not a production topology.");
} catch (error) {
    const safeMessages = ["The local target", "Start the documented", "The development replica set"];
    console.error(safeMessages.some(prefix => error.message.startsWith(prefix)) ? error.message : "Unable to initialize the localhost development replica set. Check the documented mongod command and free port 27018. Connection details are not printed.");
    process.exitCode = 1;
} finally { await client.close(); }
