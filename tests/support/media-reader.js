import mongoose from "mongoose";
import { readPrivateMedia, mediaDigest } from "../../src/services/privateStorageService.js";

try {
    if (process.env.NODE_ENV !== "test" || !/^carecycle_test_[a-f0-9]+$/.test(process.env.MONGO_DB_NAME || "")) throw new Error("Isolated test environment required.");
    await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB_NAME, autoIndex: false });
    const reference = JSON.parse(Buffer.from(process.argv[2], "base64").toString("utf8"));
    console.log(mediaDigest(await readPrivateMedia("donations", reference)));
} finally { await mongoose.disconnect(); }
