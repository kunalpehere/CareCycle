import test from "node:test";
import assert from "node:assert/strict";
import ejs from "ejs";
import path from "node:path";
import { expectedListingVersion, isCurrentRequestIndex, REQUEST_INDEX_NAME, REQUEST_INDEX_FILTER } from "../src/services/requestPolicy.js";

test("listing form versions reject absent and malformed values", () => {
    for (const value of [undefined, null, 0, "", "-1", "1.5", "01", "1e2", "9007199254740992", ["1"]]) assert.equal(expectedListingVersion(value), null);
    assert.equal(expectedListingVersion("0"), 0);
    assert.equal(expectedListingVersion("12"), 12);
});

test("request readiness recognizes only the intended unique partial index", () => {
    const valid = { name: REQUEST_INDEX_NAME, key: { donation: 1, organization: 1 }, unique: true, partialFilterExpression: REQUEST_INDEX_FILTER };
    assert.equal(isCurrentRequestIndex(valid), true);
    assert.equal(isCurrentRequestIndex({ ...valid, partialFilterExpression: undefined }), false);
    assert.equal(isCurrentRequestIndex({ ...valid, unique: false }), false);
});

test("rejected and cancelled attempts expose a new form while current attempts block it", async () => {
    const donation = { _id: "507f1f77bcf86cd799439012", equipment: "walker", condition: "good", quantity: 5, availableQuantity: 3,
        location: { city: "Pune", state: "Maharashtra" }, images: [], description: "Synthetic fixture", createdAt: new Date() };
    for (const status of ["rejected", "cancelled", "pending", "accepted", "completed"]) {
        const html = await ejs.renderFile(path.resolve("views/equipment-detail.ejs"), { donation, organization: { name: "Synthetic NGO" },
            csrfToken: "synthetic", currentUser: { role: "ngo" }, message: "", existingRequest: { status, quantity: 2 } });
        assert.equal(html.includes('class="request-form"'), ["rejected", "cancelled"].includes(status));
        if (["rejected", "cancelled"].includes(status)) assert.match(html, /preserves its history/);
    }
});

test("historical snapshots retain original equipment after listing edits", async () => {
    const html = await ejs.renderFile(path.resolve("views/ngo-requests.ejs"), { csrfToken: "synthetic", currentUser: { role: "ngo" },
        organization: { name: "Synthetic NGO" }, message: "", requests: [{ _id: "fixture", status: "rejected", quantity: 1, beneficiary: "Synthetic beneficiary",
            createdAt: new Date(), donation: { _id: "listing", status: "available", equipment: "wheelchair", condition: "old", quantity: 3, location: { city: "New City", state: "New State" } },
            listingSnapshot: { equipment: "walker", condition: "good", location: { city: "Original City", state: "Original State" } } }] });
    assert.match(html, /walker/);
    assert.match(html, /Original City/);
    assert.doesNotMatch(html, /wheelchair|New City/);
});
