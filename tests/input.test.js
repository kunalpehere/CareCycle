import test from "node:test";
import assert from "node:assert/strict";
import { validateAdminAccessRequest, validateDonation, validateDonationRequest, validateLogin, validateOrganization, validateRegistration, validateRequestDecision } from "../src/validators/input.js";

test("registration normalizes email and enforces password length", () => {
    const result = validateRegistration({ name: "Donor Name", email: " DONOR@Example.com ", password: "long-passphrase", role: "donor" });
    assert.equal(result.valid, true);
    assert.equal(result.value.email, "donor@example.com");
    assert.equal(validateRegistration({ name: "D", email: "bad", password: "short", role: "donor" }).valid, false);
    assert.equal(validateRegistration({ name: "Admin", email: "admin@example.com", password: "long-passphrase", role: "admin" }).valid, false);
    assert.equal(validateRegistration({ name: "NGO Member", email: "ngo@example.com", password: "long-passphrase", role: "ngo" }).valid, true);
});

test("administration access requests require work identity and justification", () => {
    const valid = validateAdminAccessRequest({ name: "Operations Lead", workEmail: " OPS@CARECYCLE.ORG ", department: "Trust and Safety", justification: "I manage NGO verification and participant moderation for CareCycle." });
    assert.equal(valid.valid, true);
    assert.equal(valid.value.workEmail, "ops@carecycle.org");
    assert.equal(validateAdminAccessRequest({ name: "X", workEmail: "bad", department: "", justification: "short" }).valid, false);
});

test("request decisions require a rejection reason and bound response notes", () => {
    assert.equal(validateRequestDecision({ responseNote: "" }, "accept").valid, true);
    assert.equal(validateRequestDecision({ responseNote: "Not enough collection capacity" }, "reject").valid, true);
    assert.equal(validateRequestDecision({ responseNote: "Too short" }, "reject").valid, false);
    assert.equal(validateRequestDecision({}, "unknown").valid, false);
});

test("equipment request validation respects listing quantity and requires context", () => {
    const valid = validateDonationRequest({ quantity: "2", beneficiary: "Two patients at our rural clinic", message: "Our clinic needs mobility support for post-operative care." }, 3);
    assert.equal(valid.valid, true);
    assert.equal(valid.value.quantity, 2);
    assert.equal(validateDonationRequest({ quantity: "4", beneficiary: "Two patients", message: "This statement is long enough to pass validation." }, 3).valid, false);
});

test("organization validation normalizes a complete NGO profile", () => {
    const result = validateOrganization({
        name: "Mobility Trust", registrationNumber: " ngo-102 ", contactPerson: "Asha Rao",
        contactEmail: " ASHA@EXAMPLE.ORG ", phone: "+91 98765 43210", website: "https://example.org",
        description: "We provide mobility support to underserved communities.", line1: "12 Community Road",
        city: "Pune", state: "Maharashtra", postalCode: "411001"
    });
    assert.equal(result.valid, true);
    assert.equal(result.value.registrationNumber, "NGO-102");
    assert.equal(result.value.contactEmail, "asha@example.org");
    assert.equal(validateOrganization({ name: "X", website: "javascript:alert(1)" }).valid, false);
});

test("login rejects malformed input", () => {
    assert.equal(validateLogin({ email: "not-an-email", password: "password" }).valid, false);
});

test("donation validation requires a complete bounded listing", () => {
    const valid = validateDonation({
        equipment: "wheelchair", quality: "good", quantity: "2", description: "A maintained folding wheelchair.",
        city: "Pune", state: "Maharashtra", postalCode: "411001"
    });
    assert.equal(valid.valid, true);
    assert.equal(valid.value.quantity, 2);
    assert.equal(validateDonation({ equipment: "wheelchair", quality: "good", quantity: "0" }).valid, false);
});
