import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { Donation } from "../../src/models/Donation.js";
import { startIsolatedDatabase } from "../support/database.js";
import { DatabaseTopologyError, verifyReplicaSet } from "../../src/config/topology.js";

test("isolated replica set persists a synthetic listing and supports rollback", { timeout: 180000 }, async () => {
    const database = await startIsolatedDatabase();
    const connection = mongoose.createConnection(database.getUri(), { dbName: process.env.MONGO_DB_NAME, serverSelectionTimeoutMS: 10000 });
    try {
        await connection.asPromise();
        await verifyReplicaSet(connection, true);
        const Listing = connection.model("Day3Donation", Donation.schema);
        await Listing.init();
        const listing = await Listing.create({ donor: new mongoose.Types.ObjectId(), equipment: "wheelchair", condition: "good", quantity: 5, description: "Synthetic database smoke fixture" });
        assert.equal((await Listing.findById(listing.id)).quantity, 5);
        const session = await connection.startSession();
        try {
            await assert.rejects(session.withTransaction(async () => {
                await Listing.updateOne({ _id: listing._id }, { $set: { quantity: 3 } }, { session });
                throw new Error("Day 3 deliberate transaction abort");
            }), /deliberate transaction abort/);
        } finally { await session.endSession(); }
        assert.equal((await Listing.findById(listing.id)).quantity, 5, "Aborted writes must not persist.");
    } finally {
        await connection.close();
        await database.stop();
    }
});

test("live standalone is refused when replica-set validation is enabled", { timeout: 180000 }, async () => {
    const database = await startIsolatedDatabase({ replicaSet: false });
    const connection = mongoose.createConnection(database.getUri(), { dbName: process.env.MONGO_DB_NAME, serverSelectionTimeoutMS: 10000 });
    try {
        await connection.asPromise();
        await assert.rejects(verifyReplicaSet(connection, true), DatabaseTopologyError);
        await verifyReplicaSet(connection, false);
    } finally {
        await connection.close();
        await database.stop();
    }
});
