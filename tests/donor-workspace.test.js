import test from "node:test";
import assert from "node:assert/strict";
import { buildDonorWorkspace, donorRequestTask, requestTimeline } from "../src/services/donorWorkspaceService.js";

const donorId = "donor", now = new Date("2026-10-12T10:00Z");
const request = (values = {}) => ({ _id: "r1", donation: "d1", quantity: 2, status: "accepted", createdAt: now, ...values });
const listing = (values = {}) => ({ _id: "d1", equipment: "walker", quantity: 5, allocatedQuantity: 2, handedOverQuantity: 0, status: "available", createdAt: now, ...values });

test("workspace distinguishes donor decisions, proposal confirmation, future commitments and NGO waits", () => {
    const task = values => donorRequestTask(request(values), donorId, now);
    assert.equal(task({ status: "pending" }).group, "decisions");
    assert.equal(task({}).label, "Arrange pickup");
    const proposal = { proposedBy: "ngo", start: new Date("2026-10-13T10:00Z") };
    assert.equal(task({ pickup: { status: "proposed", proposal } }).label, "Confirm pickup proposal");
    assert.equal(task({ pickup: { status: "proposed", proposal: { ...proposal, proposedBy: donorId } } }).group, "waiting");
    assert.equal(task({ pickup: { status: "confirmed", proposal } }).label, "Upcoming confirmed pickup");
    assert.match(task({ pickup: { status: "confirmed", proposal: { ...proposal, start: now } } }).label, /Record handover/);
});

test("handover and discrepancy tasks cannot claim donor completion or repeat pickup before NGO acknowledgement", () => {
    const transfer = { quantity: 1, status: "awaiting_acknowledgement" };
    const base = { handedOverQuantity: 1, fulfillment: { transfers: [transfer] } };
    assert.equal(donorRequestTask(request(base), donorId, now).label, "Waiting for NGO acknowledgement");
    assert.equal(donorRequestTask(request({ ...base, fulfillment: { transfers: [{ ...transfer, status: "disputed" }] } }), donorId, now).group, "review");
    assert.equal(donorRequestTask(request({ ...base, fulfillment: { transfers: [{ ...transfer, status: "disputed", resolution: { quantity: 1 } }] } }), donorId, now).group, "waiting");
    assert.equal(donorRequestTask(request({ handedOverQuantity: 1 }), donorId, now).label, "Review older handover evidence");
    const acknowledged = { handedOverQuantity: 1, acknowledgedQuantity: 1, fulfillment: { transfers: [{ quantity: 1, status: "acknowledged" }] } };
    assert.equal(donorRequestTask(request(acknowledged), donorId, now).label, "Arrange remaining pickup");
    for (const actor of [donorId, "ngo"]) assert.equal(donorRequestTask(request({ ...acknowledged, fulfillment: { ...acknowledged.fulfillment, remainderProposal: { actor } } }), donorId, now).group, actor === donorId ? "waiting" : "review");
});

test("workspace quantity breakdown keeps reserved, handed and acknowledged quantities distinct", () => {
    const records = [request({ handedOverQuantity: 1, acknowledgedQuantity: 1, fulfillment: { transfers: [{ quantity: 1, status: "acknowledged" }] } })];
    const view = buildDonorWorkspace({ donorId, donations: [listing({ handedOverQuantity: 1 })], requests: records });
    assert.deepEqual(view.donations[0].accounting, { total: 5, allocated: 2, reserved: 1, handedOver: 1, available: 3 });
    assert.equal(view.donations[0].acknowledged, 1);
    assert.equal(view.donations[0].canEdit, false);
    const cancelled = buildDonorWorkspace({ donorId, donations: [listing({ allocatedQuantity: 0, status: "withdrawn" })], requests: [request({ status: "cancelled" })] });
    assert.equal(cancelled.tasks.length, 0);
    assert.equal(cancelled.donations[0].requestable, 0);
    assert.equal(cancelled.donations[0].acknowledged, 0);
    const unknown = buildDonorWorkspace({ donorId, donations: [listing({ handedOverQuantity: 1 })], requests: [] });
    assert.equal(unknown.donations[0].acknowledged, null);
    const zero = buildDonorWorkspace({ donorId, donations: [listing({ allocatedQuantity: 0 })], requests: [request({ status: "completed", releasedQuantity: 2, fulfillment: { transfers: [], completedAt: now } })] });
    assert.equal(zero.donations[0].progress[0].receipt, false);
});

test("filters, counts and separate pages retain their meaning without accepting query objects", () => {
    const donations = Array.from({ length: 25 }, (_, i) => listing({ _id: `d${i}`, allocatedQuantity: 0 }));
    const requests = Array.from({ length: 17 }, (_, i) => request({ _id: `r${i}`, donation: `d${i}`, status: "pending" }));
    const view = buildDonorWorkspace({ donations, requests, donorId, query: { filter: "decisions", equipment: "walker", page: "2", taskPage: "2" } });
    assert.equal(view.matchingListings, 17); assert.equal(view.counts.decisions, 17);
    assert.equal(view.donations.length, 5); assert.equal(view.tasks.length, 8);
    assert.match(view.url({ page: "1" }), /filter=decisions&equipment=walker&page=1&taskPage=2/);
    const bad = buildDonorWorkspace({ donations, requests, donorId, query: { filter: { $ne: "" }, equipment: "not-a-category", page: "999999" } });
    assert.equal(bad.filter, "all"); assert.equal(bad.page, 3);
    assert.equal(buildDonorWorkspace({ donations, requests, donorId, query: { equipment: "cane" } }).matchingListings, 0);
    const closedReview = buildDonorWorkspace({ donations: [listing({ status: "completed", handedOverQuantity: 2 })], requests: [request({ status: "completed", handedOverQuantity: 2 })], donorId, query: { filter: "active" } });
    assert.equal(closedReview.matchingListings, 0); assert.equal(closedReview.matchingTasks, 0);
});

test("timelines use recorded timestamps, keep cancellation and cap recent events", () => {
    const history = Array.from({ length: 8 }, (_, i) => ({ action: "confirmed", at: new Date(`2026-10-${String(i + 1).padStart(2, '0')}T10:00Z`) }));
    const events = requestTimeline(request({ createdAt: new Date("2026-01-01"), pickup: { history } }));
    assert.equal(events.length, 4); assert.ok(!events.some(event => event.label === "Request accepted"));
    const cancelled = requestTimeline(request({ status: "cancelled", cancellation: { at: now } }));
    assert.ok(cancelled.some(event => event.label === "Request cancelled"));
});
