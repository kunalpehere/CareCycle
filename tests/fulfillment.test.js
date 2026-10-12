import test from "node:test";
import assert from "node:assert/strict";
import { requestAccounting, canArrangePickup } from "../src/services/fulfillmentAccounting.js";
import { validateFulfillmentInput, wholeQuantity } from "../src/services/fulfillmentService.js";
import { assertTransition, listingPolicy } from "../src/services/lifecycleContract.js";

test("fulfillment quantities separate physical transfer, acknowledgement and released remainder", () => {
    const request = { status: "accepted", quantity: 5, handedOverQuantity: 2, acknowledgedQuantity: 2, releasedQuantity: 1, fulfillment: { transfers: [{ quantity: 2, status: "acknowledged" }] } };
    assert.deepEqual(requestAccounting(request), { handed: 2, acknowledged: 2, released: 1, remaining: 2, tracked: true, settled: true });
    assert.equal(canArrangePickup(request), true);
    assert.equal(canArrangePickup({ ...request, fulfillment: { ...request.fulfillment, remainderProposal: { quantity: 2 } } }), false);
    assert.equal(canArrangePickup({ ...request, acknowledgedQuantity: 0 }), false);
    for (const changes of [{ handedOverQuantity: 6 }, { acknowledgedQuantity: 3 }, { releasedQuantity: 4 }, { handedOverQuantity: 1.5 }]) assert.throws(() => requestAccounting({ ...request, ...changes }));
});
test("legacy untracked transfers cannot support new collection or fulfillment claims", () => {
    assert.equal(canArrangePickup({ status: "accepted", quantity: 2, handedOverQuantity: 1 }), false);
    assert.equal(requestAccounting({ quantity: 2 }).remaining, 2);
});
test("lifecycle completion and continuation require acknowledged transfers and agreed release evidence", () => {
    const evidence = { pickupStatus: "acknowledged", quantity: 2, fulfilledQuantity: 1, acknowledgedQuantity: 1, releasedQuantity: 1, remainderReleaseConfirmed: true };
    assert.equal(assertTransition({ record: "request", from: "accepted", to: "completed", actor: "donor", evidence }), true);
    assert.throws(() => assertTransition({ record: "request", from: "accepted", to: "completed", actor: "donor", evidence: { ...evidence, remainderReleaseConfirmed: false } }));
    assert.equal(assertTransition({ record: "pickup", from: "acknowledged", to: "proposed", actor: "organization", evidence: { remainingQuantity: 1, allTransfersAcknowledged: true } }), true);
    assert.equal(listingPolicy({ quantity: 2, allocatedQuantity: 2, handedOverQuantity: 2, status: "available" }, { unacknowledgedRequests: 1 }).canWithdraw, false);
});
test("fulfillment input requires whole counts, checklist and explicit receipt/release declarations", () => {
    for (const value of [undefined, "-1", "1.5", "101", "01", ["2"]]) assert.equal(wholeQuantity(value), null);
    const body = { quantity: "2", equipmentMatches: "yes", conditionReviewed: "yes", accessoriesExplained: "yes" };
    assert.equal(validateFulfillmentInput("handover", body), true);
    assert.equal(validateFulfillmentInput("handover", { ...body, conditionReviewed: "no" }), false);
    assert.equal(validateFulfillmentInput("handover", { ...body, quantity: "0" }), false);
    assert.equal(validateFulfillmentInput("acknowledge", { quantity: "2", receiptConfirmed: "yes" }), true);
    assert.equal(validateFulfillmentInput("acknowledge", { quantity: "2" }), false);
    assert.equal(validateFulfillmentInput("receipt-dispute", { quantity: "1", reason: "Condition does not match the donor record" }), true);
    assert.equal(validateFulfillmentInput("remainder-confirm", { reason: "Agree to release remaining units", noFurtherHandover: "yes" }), true);
    assert.equal(validateFulfillmentInput("remainder-confirm", { reason: "Agree to release remaining units" }), false);
});
