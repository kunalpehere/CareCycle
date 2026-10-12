import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { spawnSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import { Donation } from "../../src/models/Donation.js";
import { DonationRequest } from "../../src/models/DonationRequest.js";
import { migrateRequestIndex } from "../../src/services/requestIndexMigration.js";
import { verifyRequestIndexes, REQUEST_INDEX_NAME, REQUEST_INDEX_FILTER } from "../../src/services/requestPolicy.js";
import { createPendingRequest, acceptPendingRequest } from "../../src/services/matchingService.js";
import { changeListing } from "../../src/services/listingPolicyService.js";
import { startIsolatedDatabase } from "../support/database.js";
const execFileAsync = promisify(execFile);

test("request index migration and listing policies preserve history on a real replica set", { timeout: 180000 }, async t => {
    const database = await startIsolatedDatabase();
    try {
        await mongoose.connect(database.getUri(), { dbName: process.env.MONGO_DB_NAME, autoIndex: false, autoCreate: false });
        const donor = new mongoose.Types.ObjectId();
        const org = new mongoose.Types.ObjectId();
        const listing = (values = {}) => Donation.create({ donor, equipment: "walker", condition: "good", quantity: 5, ...values });
        const data = (item, quantity = 2, organization = org) => ({ donation: item._id, organization, requestedBy: donor, quantity,
            beneficiary: "Synthetic beneficiary summary", message: "Synthetic request policy need statement" });
        const collection = mongoose.connection.collection("donation_requests");
        const item = await listing();
        const prior = await collection.insertOne({ ...data(item), status: "rejected", responseNote: "Original donor rejection", createdAt: new Date(), respondedAt: new Date(), respondedBy: donor });
        await collection.createIndex({ donation: 1, organization: 1 }, { unique: true });

        await t.test("dry run and maintenance guard leave legacy data/index unchanged", async () => {
            const before = await collection.findOne({ _id: prior.insertedId });
            const indexes = await collection.indexes();
            const dry = await migrateRequestIndex(mongoose.connection);
            assert.equal(dry.create, true);
            assert.deepEqual(dry.drop, ["donation_1_organization_1"]);
            assert.deepEqual(await collection.indexes(), indexes);
            assert.deepEqual(await collection.findOne({ _id: prior.insertedId }), before);
            await assert.rejects(verifyRequestIndexes(mongoose.connection), /migration is required/);
            const cli = spawnSync(process.execPath, ["scripts/migrate-request-index.js"], { env: { ...process.env, MONGO_URI: database.getUri() }, encoding: "utf8", timeout: 15000 });
            assert.equal(cli.status, 0, cli.stderr);
            assert.equal(JSON.parse(cli.stdout.trim()).mode, "dry-run");
            console.log(`Synthetic request index report: ${cli.stdout.trim()}`);
            const denied = spawnSync(process.execPath, ["scripts/migrate-request-index.js", "--apply"], { env: { ...process.env, MONGO_URI: database.getUri() }, encoding: "utf8", timeout: 15000 });
            assert.equal(denied.status, 1);
            assert.deepEqual(await collection.indexes(), indexes);
        });

        await t.test("resume after replacement index creation safely removes old constraint", async () => {
            const before = await collection.findOne({ _id: prior.insertedId });
            await collection.createIndex({ donation: 1, organization: 1 }, { unique: true, name: REQUEST_INDEX_NAME, partialFilterExpression: REQUEST_INDEX_FILTER });
            await assert.rejects(verifyRequestIndexes(mongoose.connection));
            // Keep the parent's event loop draining the owned mongod log pipes
            // while startup creates ordinary model indexes in the child process.
            const startup = await execFileAsync(process.execPath, ["tests/support/request-index-readiness-check.js"], { env: { ...process.env, MONGO_URI: database.getUri() }, encoding: "utf8", timeout: 15000 });
            assert.match(startup.stdout, /migration is required/);
            const applied = await migrateRequestIndex(mongoose.connection, { apply: true });
            assert.equal(applied.create, false);
            assert.equal(applied.applied, true);
            await verifyRequestIndexes(mongoose.connection);
            const ready = await execFileAsync(process.execPath, ["tests/support/request-index-readiness-check.js", "--ready"], { env: { ...process.env, MONGO_URI: database.getUri() }, encoding: "utf8", timeout: 15000 });
            assert.match(ready.stdout, /passed startup readiness/);
            assert.equal((await migrateRequestIndex(mongoose.connection, { apply: true })).applied, false);
            assert.deepEqual(await collection.findOne({ _id: prior.insertedId }), before);
        });

        await t.test("retry preserves previous attempt while concurrent duplicate is blocked", async () => {
            const attempts = await Promise.allSettled([createPendingRequest(data(item)), createPendingRequest(data(item))]);
            assert.equal(attempts.filter(result => result.status === "fulfilled").length, 1);
            assert.equal(attempts.find(result => result.status === "rejected").reason.code, 11000);
            assert.equal(await DonationRequest.countDocuments({ donation: item._id, organization: org }), 2);
            assert.equal((await collection.findOne({ _id: prior.insertedId })).responseNote, "Original donor rejection");
            const current = await DonationRequest.findOne({ donation: item._id, status: "pending" });
            assert.equal(current.listingSnapshot.equipment, "walker");
            await DonationRequest.updateOne({ _id: current._id }, { $set: { status: "cancelled" } });
            assert.ok(await createPendingRequest(data(item)));
        });

        await t.test("quantity reduction cancels only oversized pending attempts and protects commitments", async () => {
            const item = await listing();
            const large = await createPendingRequest(data(item, 4));
            const small = await createPendingRequest(data(item, 2, new mongoose.Types.ObjectId()));
            assert.equal((await changeListing({ donationId: item._id, donorId: donor, expectedVersion: 2, action: "edit", value: { equipment: "wheelchair" } })).reason, "details_locked");
            const result = await changeListing({ donationId: item._id, donorId: donor, expectedVersion: 2, action: "quantity", value: { quantity: 3 } });
            assert.equal(result.changed, true);
            assert.equal(result.resolved, 1);
            assert.equal((await DonationRequest.findById(large.id)).resolutionReason, "availability_changed");
            assert.equal((await DonationRequest.findById(small.id)).status, "pending");
            assert.equal((await acceptPendingRequest({ request: small, donorId: donor, respondedBy: donor })).accepted, true);
            const committed = await Donation.findById(item.id);
            assert.equal((await changeListing({ donationId: item._id, donorId: donor, expectedVersion: committed.__v, action: "quantity", value: { quantity: 1 } })).changed, false);
            assert.equal((await changeListing({ donationId: item._id, donorId: donor, expectedVersion: committed.__v, action: "withdraw" })).changed, false);
            assert.equal((await DonationRequest.findById(small.id)).status, "accepted");
        });

        await t.test("withdrawal cancels pending requests atomically and repeat/stale actions do nothing", async () => {
            const item = await listing();
            const request = await createPendingRequest(data(item));
            const before = await Donation.findById(item.id);
            const stale = await changeListing({ donationId: item._id, donorId: donor, expectedVersion: 0, action: "withdraw" });
            assert.equal(stale.changed, false);
            const result = await changeListing({ donationId: item._id, donorId: donor, expectedVersion: before.__v, action: "withdraw" });
            assert.equal(result.resolved, 1);
            const cancelled = await DonationRequest.findById(request.id);
            assert.equal(cancelled.resolutionReason, "listing_withdrawn");
            assert.equal(cancelled.respondedBy.toString(), donor.toString());
            const timestamp = cancelled.respondedAt.getTime();
            assert.equal((await changeListing({ donationId: item._id, donorId: donor, expectedVersion: before.__v, action: "withdraw" })).changed, false);
            assert.equal((await DonationRequest.findById(request.id)).respondedAt.getTime(), timestamp);
            assert.equal(await createPendingRequest(data(item)), null);
        });

        await t.test("failed pending resolution rolls back listing quantity", async () => {
            const item = await listing();
            const request = await createPendingRequest(data(item, 4));
            const before = await Donation.findById(item.id);
            await mongoose.connection.db.command({ collMod: "donation_requests", validator: { status: { $ne: "cancelled" } } });
            try { await assert.rejects(changeListing({ donationId: item._id, donorId: donor, expectedVersion: before.__v, action: "quantity", value: { quantity: 1 } })); }
            finally { await mongoose.connection.db.command({ collMod: "donation_requests", validator: {} }); }
            assert.equal((await Donation.findById(item.id)).quantity, 5);
            assert.equal((await DonationRequest.findById(request.id)).status, "pending");
        });

        await t.test("withdrawal racing acceptance cannot invalidate a commitment", async () => {
            const item = await listing();
            const request = await createPendingRequest(data(item));
            const [withdrawn, accepted] = await Promise.all([
                changeListing({ donationId: item._id, donorId: donor, expectedVersion: 1, action: "withdraw" }),
                acceptPendingRequest({ request, donorId: donor, respondedBy: donor })
            ]);
            assert.notEqual(withdrawn.changed, accepted.accepted);
            const final = await Donation.findById(item.id);
            const status = (await DonationRequest.findById(request.id)).status;
            assert.equal(final.allocatedQuantity, accepted.accepted ? 2 : 0);
            assert.equal(final.status, accepted.accepted ? "available" : "withdrawn");
            assert.equal(status, accepted.accepted ? "accepted" : "cancelled");
        });

        await t.test("quantity reduction racing acceptance preserves capacity and history", async () => {
            const item = await listing();
            const request = await createPendingRequest(data(item));
            const [reduced, accepted] = await Promise.all([
                changeListing({ donationId: item._id, donorId: donor, expectedVersion: 1, action: "quantity", value: { quantity: 1 } }),
                acceptPendingRequest({ request, donorId: donor, respondedBy: donor })
            ]);
            assert.notEqual(reduced.changed, accepted.accepted);
            const final = await Donation.findById(item.id);
            assert.equal(final.quantity, accepted.accepted ? 5 : 1);
            assert.equal(final.allocatedQuantity, accepted.accepted ? 2 : 0);
            assert.equal((await DonationRequest.findById(request.id)).status, accepted.accepted ? "accepted" : "cancelled");
        });

        await t.test("duplicate legacy current attempts block migration without discarding records", async () => {
            const connection = mongoose.createConnection(database.getUri(), { dbName: `${process.env.MONGO_DB_NAME}_duplicates` });
            try {
                await connection.asPromise();
                const records = connection.collection("donation_requests");
                await records.insertMany([{ ...data(item), status: "pending" }, { ...data(item), status: "accepted" }]);
                const indexes = await records.indexes();
                const report = await migrateRequestIndex(connection, { apply: true });
                assert.equal(report.conflictingRequestIds.length, 1);
                assert.equal(report.applied, false);
                assert.deepEqual(await records.indexes(), indexes);
                assert.equal(await records.countDocuments(), 2);
            } finally { await connection.close(); }
        });
    } finally { await mongoose.disconnect(); await database.stop(); }
});
