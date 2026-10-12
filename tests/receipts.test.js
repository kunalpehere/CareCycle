import test from "node:test";
import assert from "node:assert/strict";
import ejs from "ejs";
import path from "node:path";
import { buildReceiptSnapshot, canIssueReceipt, receiptReference, validateReceiptInput } from "../src/services/receiptService.js";

const request = () => ({ _id: "507f1f77bcf86cd799439015", status: "completed", quantity: 2, handedOverQuantity: 1, acknowledgedQuantity: 1, releasedQuantity: 1, beneficiary: "SECRET_BENEFICIARY", message: "SECRET_NEED", fulfillment: { completedAt: new Date("2030-01-01"), transfers: [{ declaredQuantity: 2, quantity: 1, receivedQuantity: 1, status: "acknowledged", donor: "donor", at: new Date("2030-01-01"), acknowledgedBy: "ngo", acknowledgedAt: new Date("2030-01-01"), notes: "SECRET_HANDOVER_NOTE" }] }, pickup: { proposal: { address: "SECRET_PICKUP" }, history: [{ action: "receipt_resolved", actorRole: "ngo", at: new Date("2030-01-01"), quantity: 1, reason: "SECRET_COORDINATION" }] } });
const snapshot = () => buildReceiptSnapshot({ request: request(), donation: { equipment: "wheelchair", condition: "good" }, donor: { name: "Synthetic Donor", email: "SECRET_EMAIL" }, organization: { name: "Synthetic Organization", phone: "SECRET_PHONE" }, now: new Date("2030-01-02") });
test("receipt eligibility requires settled positive NGO receipt evidence and completion", () => {
    assert.equal(canIssueReceipt(request()), true);
    for (const changes of [{ status: "accepted" }, { acknowledgedQuantity: 0 }, { fulfillment: null }, { releasedQuantity: 0 }]) assert.equal(canIssueReceipt({ ...request(), ...changes }), false);
    const unconfirmed = request(); unconfirmed.fulfillment.transfers[0].acknowledgedBy = null; assert.equal(canIssueReceipt(unconfirmed), false);
});
test("receipt snapshot uses actual acknowledged totals and excludes sensitive coordination", () => {
    const data = snapshot(); assert.equal(data.acknowledgedQuantity, 1); assert.equal(data.originalQuantity, 2); assert.equal(data.releasedQuantity, 1);
    assert.equal(data.reference, receiptReference(request()._id)); assert.doesNotMatch(JSON.stringify(data), /SECRET_/);
});
test("receipt input bounds corrections/outcomes and requires an aggregate-information declaration", () => {
    assert.equal(validateReceiptInput("outcome", { outcomeNote: "General community mobility use", aggregateOnly: "yes" }), true);
    assert.equal(validateReceiptInput("outcome", { outcomeNote: "x".repeat(501), aggregateOnly: "yes" }), false);
    assert.equal(validateReceiptInput("outcome", { outcomeNote: ["wrong type"], aggregateOnly: "yes" }), false);
    assert.equal(validateReceiptInput("amend", { donorName: "Donor", organizationName: "Organization", reason: "Correct a documented spelling error", aggregateOnly: "yes" }), true);
    assert.equal(validateReceiptInput("confirm", { reason: "Agree to the correction" }), false);
});
test("download document escapes user content and includes print rules and honest receipt limits", async () => {
    const data = { ...snapshot(), donorName: "<script>alert(1)</script>", outcomeNote: "<img src=x onerror=alert(1)>" };
    const html = await ejs.renderFile(path.resolve("views/receipt-document.ejs"), { snapshot: data, number: 1, revisedAt: "2030-01-02T00:00:00Z", revisionHistory: [{ number: 1, at: "2030-01-02T00:00:00Z", actorRole: "donor", reason: "Initial receipt" }] });
    assert.doesNotMatch(html, /<script>|<img src=x|SECRET_/); assert.match(html, /&lt;script&gt;/); assert.match(html, /@media print/); assert.match(html, /Actual quantity acknowledged by the NGO: 1/); assert.match(html, /not a tax-deduction certificate/);
});
