import mongoose from "mongoose";
import { env } from "./env.js";
import { DatabaseTopologyError, verifyReplicaSet } from "./topology.js";

mongoose.set("strictQuery", true);

export const connectDatabase = async () => {
    try {
        await mongoose.connect(env.mongoUri, {
            dbName: env.mongoDbName,
            autoIndex: !env.isProduction,
            serverSelectionTimeoutMS: 10000
        });
        await verifyReplicaSet(mongoose.connection, env.mongoRequireReplicaSet);
        return mongoose;
    } catch (error) {
        await mongoose.disconnect().catch(() => undefined);
        if (error instanceof DatabaseTopologyError) throw error;
        throw new Error("MongoDB connection failed. Check MONGO_URI, credentials, TLS and network access. Connection details are not printed.");
    }
};

export const disconnectDatabase = () => mongoose.disconnect();
