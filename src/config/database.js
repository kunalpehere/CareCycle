import mongoose from "mongoose";
import { env } from "./env.js";
import { DatabaseTopologyError, verifyReplicaSet } from "./topology.js";
import { DonationRequest } from "../models/DonationRequest.js";
import { RequestIndexError, verifyRequestIndexes } from "../services/requestPolicy.js";
import { LifecycleEvent } from "../models/LifecycleEvent.js";
import { Notification } from "../models/Notification.js";
import { initializeSecurityStores } from "../services/securityStoreService.js";
import { initializePrivateStorage } from "../services/privateStorageService.js";
import { initializeDiagnostics } from "../services/diagnosticsService.js";
import { assertRecoveryReleased, RecoveryQuarantineError } from "../services/recoveryGuardService.js";
import { assertDemoDatabase, DemoIsolationError } from "../services/demoGuardService.js";

mongoose.set("strictQuery", true);

export const connectDatabase = async () => {
    let preflight;
    try {
        // Inspect existing indexes before model initialization can attempt DDL.
        preflight = mongoose.createConnection(env.mongoUri, { dbName: env.mongoDbName, autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000 });
        await preflight.asPromise();
        await verifyReplicaSet(preflight, env.mongoRequireReplicaSet);
        await assertRecoveryReleased(preflight);
        if (env.demoMode) await assertDemoDatabase(preflight);
        else if (await preflight.db.collection("demo_control").findOne({ _id: "isolated-demo-v1" }, { maxTimeMS: 1000 })) throw new DemoIsolationError();
        const requestCollectionExists = await preflight.db.listCollections({ name: "donation_requests" }, { nameOnly: true }).hasNext();
        if (requestCollectionExists) await verifyRequestIndexes(preflight);
        else if (env.isProduction) throw new RequestIndexError();
        await preflight.close();
        preflight = null;
        await mongoose.connect(env.mongoUri, {
            dbName: env.mongoDbName,
            autoIndex: !env.isProduction,
            serverSelectionTimeoutMS: 10000
        });
        await verifyReplicaSet(mongoose.connection, env.mongoRequireReplicaSet);
        await DonationRequest.init();
        await LifecycleEvent.init();
        await Notification.init();
        await verifyRequestIndexes(mongoose.connection);
        await initializeSecurityStores(mongoose.connection);
        await initializePrivateStorage(mongoose.connection);
        await initializeDiagnostics(mongoose.connection);
        return mongoose;
    } catch (error) {
        if (preflight) await preflight.close().catch(() => undefined);
        await mongoose.disconnect().catch(() => undefined);
        if (error instanceof DatabaseTopologyError || error instanceof RequestIndexError || error instanceof RecoveryQuarantineError || error instanceof DemoIsolationError) throw error;
        throw new Error("MongoDB connection failed. Check MONGO_URI, credentials, TLS and network access. Connection details are not printed.");
    }
};

export const disconnectDatabase = () => mongoose.disconnect();
