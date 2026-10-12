import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { spawnSync } from "node:child_process";
import { startIsolatedDatabase } from "../support/database.js";
import { backfillQuantities } from "../../src/services/quantityBackfill.js";

test("quantity migration dry-run, atomic refusal and repeated apply on isolated legacy records", { timeout: 180000 }, async () => {
    const database = await startIsolatedDatabase();
    const connection = mongoose.createConnection(database.getUri(), { dbName: process.env.MONGO_DB_NAME });
    try {
        await connection.asPromise();
        const listings = connection.collection("donations");
        const requests = connection.collection("donation_requests");
        const id = new mongoose.Types.ObjectId();
        await listings.insertOne({ _id: id, quantity: 5, allocatedQuantity: 2, status: "matched" });
        await requests.insertOne({ donation: id, status: "accepted", quantity: 2 });
        const before = await listings.findOne({ _id: id });
        const dry = await backfillQuantities(connection);
        assert.equal(dry.proposed, 1);
        assert.equal(dry.applied, 0);
        assert.deepEqual(await listings.findOne({ _id: id }), before);
        const command = spawnSync(process.execPath, ["scripts/backfill-quantity-contracts.js"], {
            env: { ...process.env, MONGO_URI: database.getUri() }, encoding: "utf8", timeout: 15000
        });
        assert.equal(command.status, 0, command.stderr);
        const commandReport = JSON.parse(command.stdout.trim());
        assert.equal(commandReport.mode, "dry-run");
        assert.equal(commandReport.proposed, 1);
        assert.deepEqual(await listings.findOne({ _id: id }), before);
        console.log(`Synthetic CLI dry-run report: ${JSON.stringify(commandReport)}`);
        const refused = spawnSync(process.execPath, ["scripts/backfill-quantity-contracts.js", "--apply"], {
            env: { ...process.env, MONGO_URI: database.getUri() }, encoding: "utf8", timeout: 15000
        });
        assert.equal(refused.status, 1);
        assert.deepEqual(await listings.findOne({ _id: id }), before);
        const bad = new mongoose.Types.ObjectId();
        await listings.insertOne({ _id: bad, quantity: 1, allocatedQuantity: 2, status: "matched" });
        const blocked = await backfillQuantities(connection, { apply: true });
        assert.equal(blocked.blocked, 1);
        assert.equal(blocked.applied, 0);
        assert.deepEqual(await listings.findOne({ _id: id }), before);
        await listings.deleteOne({ _id: bad });
        const orphan = await requests.insertOne({ donation: bad, status: "pending", quantity: 1 });
        assert.equal((await backfillQuantities(connection, { apply: true })).applied, 0);
        await requests.deleteOne({ _id: orphan.insertedId });
        const second = new mongoose.Types.ObjectId();
        await listings.insertOne({ _id: second, quantity: 7, allocatedQuantity: 0, status: "available" });
        // Reject the second write after the first succeeds inside the transaction.
        await connection.db.command({ collMod: "donations", validator: { $or: [
            { quantity: { $ne: 7 } }, { accountingVersion: { $exists: false } }
        ] } });
        await assert.rejects(backfillQuantities(connection, { apply: true }));
        assert.deepEqual(await listings.findOne({ _id: id }), before, "Failed apply must roll back earlier writes.");
        await connection.db.command({ collMod: "donations", validator: {} });
        assert.equal((await backfillQuantities(connection, { apply: true })).applied, 2);
        assert.equal((await listings.findOne({ _id: id })).handedOverQuantity, 0);
        assert.equal((await backfillQuantities(connection, { apply: true })).applied, 0);
        assert.equal((await listings.findOne({ _id: id })).status, "matched");
    } finally { await connection.close(); await database.stop(); }
});
