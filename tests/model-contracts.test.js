import test from "node:test";
import assert from "node:assert/strict";
import { Donation, DONATION_STATUSES } from "../src/models/Donation.js";
import { DonationRequest } from "../src/models/DonationRequest.js";
import { Organization } from "../src/models/Organization.js";
import { buildCapacityReservationQuery } from "../src/services/matchingService.js";
import { AuditLog } from "../src/models/AuditLog.js";

test("donations expose the planned lifecycle and donor index", () => {
    assert.deepEqual(DONATION_STATUSES, ["available", "requested", "matched", "pickup_scheduled", "completed", "withdrawn"]);
    assert.ok(Donation.schema.indexes().some(([fields]) => fields.donor === 1 && fields.createdAt === -1));
});

test("matching reserves quantity only when capacity remains", () => {
    const query = buildCapacityReservationQuery({ donation: "donation-id", quantity: 3 }, "donor-id");
    assert.equal(query.donor, "donor-id");
    assert.deepEqual(query.status.$in, ["available", "requested", "matched"]);
    assert.deepEqual(query.$expr.$lte[1], "$quantity");
    assert.equal(Donation.schema.path("allocatedQuantity").options.default, 0);
});

test("organizations support verification evidence and review states", () => {
    assert.deepEqual(Organization.schema.path("verificationStatus").enumValues, ["pending", "verified", "rejected"]);
    assert.equal(Organization.schema.path("owner").options.unique, true);
    assert.ok(Organization.schema.indexes().some(([fields]) => fields.verificationStatus === 1 && fields.submittedAt === 1));
});

test("an organization can request a donation only once", () => {
    assert.ok(DonationRequest.schema.indexes().some(([fields, options]) => fields.donation === 1 && fields.organization === 1 && options.unique));
    assert.deepEqual(DonationRequest.schema.path("status").enumValues, ["pending", "accepted", "rejected", "cancelled", "completed"]);
    assert.equal(DonationRequest.schema.path("beneficiary").options.required, true);
});

test("administrative actions have an indexed audit contract", () => {
    assert.deepEqual(AuditLog.schema.path("targetType").enumValues, ["organization", "user"]);
    assert.ok(AuditLog.schema.indexes().some(([fields]) => fields.targetType === 1 && fields.targetId === 1 && fields.createdAt === -1));
});
