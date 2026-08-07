import test from "node:test";
import assert from "node:assert/strict";
import { authorizeRoles } from "../src/middleware/authorize.js";
import { requireOwnedResource } from "../src/middleware/ownership.js";
import { ROLE_PERMISSIONS, roleHasPermission, sameOwner } from "../src/services/authorizationService.js";
import { createVerifiedOrganizationMiddleware } from "../src/middleware/verifiedOrganization.js";

const responseDouble = () => ({
    statusCode: 200,
    rendered: null,
    status(code) { this.statusCode = code; return this; },
    render(view, data) { this.rendered = { view, data }; return this; },
    send(body) { this.body = body; return this; },
    json(body) { this.jsonBody = body; return this; },
    redirect(location) { this.redirected = location; return this; }
});

test("equipment discovery requires a verified organization", async () => {
    const verifiedRequest = requestDouble("ngo");
    const verified = { owner: verifiedRequest.auth.userId, verificationStatus: "verified" };
    let proceeded = false;
    await createVerifiedOrganizationMiddleware({ findOne: async () => verified })(verifiedRequest, responseDouble(), () => { proceeded = true; });
    assert.equal(proceeded, true);
    assert.equal(verifiedRequest.verifiedOrganization, verified);

    const pendingResponse = responseDouble();
    await createVerifiedOrganizationMiddleware({ findOne: async () => ({ verificationStatus: "pending" }) })(requestDouble("ngo"), pendingResponse, () => {});
    assert.equal(pendingResponse.statusCode, 403);
    assert.match(pendingResponse.rendered.data.message, /after your organization is verified/);
});

const requestDouble = (role = "donor") => ({
    auth: { userId: "507f1f77bcf86cd799439011", user: { role } },
    path: "/protected",
    originalUrl: "/protected",
    params: { resourceId: "507f191e810c19729de860ea" },
    get() { return "text/html"; }
});

test("role permission matrix separates donor, NGO, and admin capabilities", () => {
    assert.equal(roleHasPermission("donor", "donation:manage-own"), true);
    assert.equal(roleHasPermission("ngo", "donation:manage-own"), false);
    assert.equal(roleHasPermission("ngo", "organization:manage-own"), true);
    assert.equal(roleHasPermission("admin", "organization:review"), true);
    assert.equal(Object.isFrozen(ROLE_PERMISSIONS), true);
});

test("role middleware permits only configured roles", () => {
    let allowed = false;
    authorizeRoles("donor")(requestDouble("donor"), responseDouble(), () => { allowed = true; });
    assert.equal(allowed, true);

    const forbiddenResponse = responseDouble();
    authorizeRoles("donor")(requestDouble("ngo"), forbiddenResponse, () => {});
    assert.equal(forbiddenResponse.statusCode, 403);
    assert.equal(forbiddenResponse.rendered.view, "access-denied.ejs");
});

test("ownership helper compares normalized identifiers", () => {
    assert.equal(sameOwner("507f1f77bcf86cd799439011", { toString: () => "507f1f77bcf86cd799439011" }), true);
    assert.equal(sameOwner("507f1f77bcf86cd799439011", "507f191e810c19729de860ea"), false);
});

test("resource middleware attaches owned resources and rejects foreign ownership", async () => {
    const ownedModel = { findById: async () => ({ owner: "507f1f77bcf86cd799439011" }) };
    const ownedRequest = requestDouble("ngo");
    let proceeded = false;
    await requireOwnedResource({ model: ownedModel, paramName: "resourceId", ownerField: "owner", attachAs: "resource" })(ownedRequest, responseDouble(), () => { proceeded = true; });
    assert.equal(proceeded, true);
    assert.ok(ownedRequest.resource);

    const foreignModel = { findById: async () => ({ owner: "507f191e810c19729de860eb" }) };
    const forbiddenResponse = responseDouble();
    await requireOwnedResource({ model: foreignModel, paramName: "resourceId", ownerField: "owner", attachAs: "resource" })(requestDouble("ngo"), forbiddenResponse, () => {});
    assert.equal(forbiddenResponse.statusCode, 403);
    assert.match(forbiddenResponse.rendered.data.message, /another account/);
});
