import mongoose from "mongoose";
import { verifyReplicaSet } from "../src/config/topology.js";
import { backupDatabase, verifyBackupPackage, restoreDatabase, verifyRestoredDatabase, releaseRecovery, verifyCurrentDatabase } from "../src/services/backupRecoveryService.js";

try {
    const [mode, ...args] = process.argv.slice(2); const options = {};
    for (let index = 0; index < args.length; index++) {
        const flag = args[index];
        if (["--directory", "--target", "--legacy-dir"].includes(flag)) { if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error(); options[flag] = args[++index]; }
        else if (["--apply", "--maintenance-confirmed", "--review-confirmed"].includes(flag)) options[flag] = true;
        else throw new Error();
    }
    if (!["backup", "verify-package", "restore", "verify-restore", "release", "verify-current"].includes(mode) || (mode !== "verify-current" && !options["--directory"]) || (["restore", "verify-restore", "release"].includes(mode) && !options["--target"])) throw new Error();
    const allowed = { backup: ["--directory", "--maintenance-confirmed"], "verify-package": ["--directory"], restore: ["--directory", "--target", "--legacy-dir", "--apply", "--maintenance-confirmed"], "verify-restore": ["--directory", "--target", "--legacy-dir"], release: ["--directory", "--target", "--legacy-dir", "--apply", "--maintenance-confirmed", "--review-confirmed"], "verify-current": ["--target", "--legacy-dir"] };
    if (Object.keys(options).some(flag => !allowed[mode].includes(flag))) throw new Error();
    const key = process.env.CARECYCLE_BACKUP_KEY;
    let report;
    if (mode === "verify-package") { const { manifest } = await verifyBackupPackage(options["--directory"], key); report = { verified: true, backupId: manifest.id, collections: manifest.collections.length, files: manifest.media.length }; }
    else {
        const { env } = await import("../src/config/env.js");
        const target = ["restore", "verify-restore", "release", "verify-current"].includes(mode) ? options["--target"] || env.mongoDbName : env.mongoDbName;
        await mongoose.connect(env.mongoUri, { dbName: target, autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000 });
        await verifyReplicaSet(mongoose.connection, true);
        const common = { directory: options["--directory"], key, legacyDirectory: options["--legacy-dir"], maintenanceConfirmed: Boolean(options["--maintenance-confirmed"]) };
        if (mode === "backup") report = await backupDatabase(mongoose.connection, common);
        else if (mode === "restore") report = await restoreDatabase(mongoose.connection, { ...common, apply: Boolean(options["--apply"]) });
        else if (mode === "release") report = await releaseRecovery(mongoose.connection, { ...common, apply: Boolean(options["--apply"]), reviewConfirmed: Boolean(options["--review-confirmed"]) });
        else if (mode === "verify-current") report = await verifyCurrentDatabase(mongoose.connection, common);
        else report = await verifyRestoredDatabase(mongoose.connection, common);
    }
    console.log(JSON.stringify(report, null, 2));
} catch {
    console.error("Recovery operation failed. Check the private package/key, a fresh target and stopped writers. Partial restores remain quarantined; existing data is never overwritten. See docs/backup-recovery.md.");
    process.exitCode = 1;
} finally { await mongoose.disconnect(); }
