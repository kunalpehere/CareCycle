import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { quantityAccounting, changeQuantityCommitment } from "../src/services/quantityContract.js";
import { assertTransition, listingPolicy } from "../src/services/lifecycleContract.js";
import { planQuantityBackfill } from "../src/services/quantityBackfill.js";
import { Donation } from "../src/models/Donation.js";
import { DonationRequest } from "../src/models/DonationRequest.js";

test("partial reservation, handover and release conserve total units", () => {
    const reserved = changeQuantityCommitment({ quantity: 5 }, "reserve", 2);
    assert.deepEqual(quantityAccounting(reserved), { total: 5, allocated: 2, reserved: 2, handedOver: 0, available: 3 });
    const handedOver = changeQuantityCommitment(reserved, "handover", 1);
    assert.equal(quantityAccounting(handedOver).available, 3);
    const released = changeQuantityCommitment(handedOver, "release", 1);
    assert.equal(quantityAccounting(released).available, 4);
    assert.throws(() => changeQuantityCommitment(released, "release", 1));
    assert.throws(() => changeQuantityCommitment(released, "handover", 1));
});

test("invalid, fractional, negative and overcommitted quantities fail", () => {
    for (const quantity of [0, -1, 1.5, NaN, Infinity, "5", 101]) assert.throws(() => quantityAccounting({ quantity }));
    assert.throws(() => quantityAccounting({ quantity: 5, allocatedQuantity: 6 }));
    assert.throws(() => quantityAccounting({ quantity: 5, allocatedQuantity: 1, handedOverQuantity: 2 }));
    assert.throws(() => changeQuantityCommitment({ quantity: 5 }, "reserve", 6));
});

test("partial availability is independent of legacy listing fulfillment labels", () => {
    const listing = { quantity: 5, allocatedQuantity: 2, status: "matched" };
    assert.equal(listingPolicy(listing).requestableQuantity, 3);
    assert.equal(listingPolicy({ ...listing, status: "withdrawn" }).requestableQuantity, 0);
    assert.equal(listingPolicy(listing).canWithdraw, false);
    assert.equal(listingPolicy(listing).minimumTotal, 2);
    assert.equal(listingPolicy({ quantity: 5, status: "available" }, { pendingRequests: 1 }).canEditEquipment, false);
});

test("lifecycle actors, terminal history and completion evidence are enforced by contracts", () => {
    assert.equal(assertTransition({ record: "request", from: "pending", to: "accepted", actor: "donor" }), true);
    for (const actor of ["organization", "admin", "guest"]) assert.throws(() => assertTransition({ record: "request", from: "pending", to: "accepted", actor }));
    assert.throws(() => assertTransition({ record: "request", from: "rejected", to: "pending", actor: "organization" }));
    assert.throws(() => assertTransition({ record: "request", from: "accepted", to: "completed", actor: "organization" }));
    assert.throws(() => assertTransition({ record: "request", from: "accepted", to: "completed", actor: "organization", evidence: { pickupStatus: "acknowledged", quantity: 2, fulfilledQuantity: 1 } }));
    assert.equal(assertTransition({ record: "request", from: "accepted", to: "completed", actor: "organization", evidence: { pickupStatus: "acknowledged", quantity: 2, fulfilledQuantity: 2 } }), true);
    assert.throws(() => assertTransition({ record: "request", from: "accepted", to: "cancelled", actor: "donor", evidence: { handedOverQuantity: 1 } }));
    assert.equal(assertTransition({ record: "listing", from: "available", to: "completed", actor: "system", evidence: { quantity: 2, allocatedQuantity: 2, handedOverQuantity: 2, allRequestsAcknowledged: true } }), true);
    assert.throws(() => assertTransition({ record: "listing", from: "available", to: "withdrawn", actor: "donor", evidence: { quantity: 5, allocatedQuantity: 2 } }));
    assert.throws(() => assertTransition({ record: "pickup", from: "proposed", to: "confirmed", actor: "donor" }));
    assert.equal(assertTransition({ record: "pickup", from: "proposed", to: "confirmed", actor: "counterparty" }), true);
});

test("Mongoose documents reject cross-field and integer violations", async () => {
    const base = { donor: new mongoose.Types.ObjectId(), equipment: "walker", condition: "good", quantity: 5 };
    await new Donation(base).validate();
    for (const values of [{ quantity: 1.5 }, { allocatedQuantity: 6 }, { allocatedQuantity: 1, handedOverQuantity: 2 }]) {
        await assert.rejects(new Donation({ ...base, ...values }).validate());
    }
    const request = new DonationRequest({ donation: base.donor, organization: base.donor, requestedBy: base.donor,
        quantity: 1.5, beneficiary: "Synthetic beneficiary summary", message: "Synthetic equipment need statement" });
    await assert.rejects(request.validate(), /whole number/);
});

test("backfill derives only supported legacy commitments and flags ambiguity", () => {
    const listing = { _id: "fixture", quantity: 5, status: "matched" };
    const requests = [{ status: "accepted", quantity: 2 }];
    assert.deepEqual(planQuantityBackfill(listing, requests).changes, { allocatedQuantity: 2, handedOverQuantity: 0, accountingVersion: 1 });
    assert.ok(planQuantityBackfill({ ...listing, allocatedQuantity: 3 }, requests).issues.includes("allocation_request_mismatch"));
    assert.ok(planQuantityBackfill({ ...listing, status: "completed" }, [{ status: "completed", quantity: 2 }]).issues.includes("handover_evidence_required"));
    assert.ok(planQuantityBackfill({ ...listing, status: "withdrawn" }, requests).issues.includes("withdrawn_with_reservations"));
    const migrated = { ...listing, ...planQuantityBackfill(listing, requests).changes };
    assert.deepEqual(planQuantityBackfill(migrated, requests).changes, {});
});
