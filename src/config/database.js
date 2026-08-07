import mongoose from "mongoose";
import { env } from "./env.js";

mongoose.set("strictQuery", true);

export const connectDatabase = () => mongoose.connect(env.mongoUri, {
    dbName: env.mongoDbName,
    autoIndex: !env.isProduction
});

export const disconnectDatabase = () => mongoose.disconnect();
