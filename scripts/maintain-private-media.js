import mongoose from "mongoose";
import { readFile, writeFile } from "node:fs/promises";
import { env } from "../src/config/env.js";
import { verifyReplicaSet } from "../src/config/topology.js";
import { initializePrivateStorage } from "../src/services/privateStorageService.js";
import { createMediaManifest, migratePrivateMedia, cleanupPrivateMedia } from "../src/services/mediaMaintenanceService.js";

try {
    const [mode, ...args] = process.argv.slice(2);
    const allowed = ["--apply", "--maintenance-confirmed", "--manifest"];
    let manifestPath; let apply = false, maintenance = false;
    for (let index = 0; index < args.length; index++) {
        if (!allowed.includes(args[index])) throw new Error("Unknown argument.");
        if (args[index] === "--manifest") { manifestPath = args[++index]; if (!manifestPath || manifestPath.startsWith("--")) throw new Error("A manifest path is required."); }
        else if (args[index] === "--apply") apply = true;
        else maintenance = true;
    }
    if (!["manifest", "migrate", "cleanup"].includes(mode) || (apply && !maintenance) || (mode !== "cleanup" && !manifestPath) || (mode === "manifest" && apply)) throw new Error("Use manifest/migrate --manifest PATH or cleanup; --apply requires --maintenance-confirmed.");
    await mongoose.connect(env.mongoUri, { dbName: env.mongoDbName, autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000 });
    await verifyReplicaSet(mongoose.connection, true);
    let report;
    if (mode === "manifest") {
        const manifest = await createMediaManifest();
        await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx", mode: 0o600 });
        report = { fileCount: manifest.fileCount, referenceCount: manifest.referenceCount, totalBytes: manifest.totalBytes, changedReferences: 0 };
    } else if (mode === "migrate") {
        const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
        if (apply) await initializePrivateStorage(mongoose.connection);
        report = await migratePrivateMedia(manifest, { apply });
    } else report = await cleanupPrivateMedia({ apply });
    console.log(JSON.stringify(report, null, 2));
} catch (error) {
    console.error("Private media maintenance failed. Verify options, the manifest, file integrity and stopped writers. Originals are retained. See docs/private-uploads.md.");
    process.exitCode = 1;
} finally { await mongoose.disconnect(); }
