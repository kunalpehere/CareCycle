import mongoose from "mongoose";
import { env } from "./env.js";
import { DatabaseTopologyError, verifyReplicaSet } from "./topology.js";
import { DonationRequest } from "../models/DonationRequest.js";
import { RequestIndexError, verifyRequestIndexes } from "../services/requestPolicy.js";

mongoose.set("strictQuery", true);

export const connectDatabase = async () => {
    let preflight;
    try {
        // Inspect existing indexes before model initialization can attempt DDL.
        preflight = mongoose.createConnection(env.mongoUri, { dbName: env.mongoDbName, autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000 });
        await preflight.asPromise();
        await verifyReplicaSet(preflight, env.mongoRequireReplicaSet);
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
        await verifyRequestIndexes(mongoose.connection);
        return mongoose;
    } catch (error) {
        if (preflight) await preflight.close().catch(() => undefined);
        await mongoose.disconnect().catch(() => undefined);
        if (error instanceof DatabaseTopologyError || error instanceof RequestIndexError) throw error;
        throw new Error("MongoDB connection failed. Check MONGO_URI, credentials, TLS and network access. Connection details are not printed.");
    }
};

export const disconnectDatabase = () => mongoose.disconnect();
