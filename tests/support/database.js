import { MongoMemoryReplSet, MongoMemoryServer } from "mongodb-memory-server-core";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

// No external URI or database name is accepted. Only this owned instance stops.
export const startIsolatedDatabase = async ({ replicaSet = true } = {}) => {
    const binaryCache = path.resolve("artifacts/mongodb-binaries");
    await mkdir(binaryCache, { recursive: true });
    let binary = { version: "8.0.16", downloadDir: binaryCache, checkMD5: true };
    const systemBinary = process.env.CARECYCLE_TEST_MONGOD;
    if (systemBinary) {
        if (!path.isAbsolute(systemBinary)) throw new Error("CARECYCLE_TEST_MONGOD must be an absolute path to mongod.");
        const result = spawnSync(systemBinary, ["--version"], { encoding: "utf8", windowsHide: true });
        const version = result.stdout?.match(/db version v(8\.\d+\.\d+)/)?.[1];
        if (result.status !== 0 || !version) throw new Error("CARECYCLE_TEST_MONGOD must identify itself as MongoDB 8.x.");
        binary = { ...binary, systemBinary, version };
        console.log(`Disposable test replica set: MongoDB ${version} from explicitly selected executable.`);
    }
    if (!replicaSet) return MongoMemoryServer.create({ binary, instance: { ip: "127.0.0.1", storageEngine: "wiredTiger" } });
    return MongoMemoryReplSet.create({
        binary,
        instanceOpts: [{ ip: "127.0.0.1" }],
        replSet: { count: 1, storageEngine: "wiredTiger", ip: "127.0.0.1" }
    });
};
