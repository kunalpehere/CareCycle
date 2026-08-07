import test from "node:test";
import assert from "node:assert/strict";
import { getDashboardPath, SELF_REGISTERABLE_ROLES } from "../src/services/roleService.js";
import { roleCanUseRealm } from "../src/services/loginRealmService.js";

test("only donor and NGO roles can self-register", () => {
    assert.deepEqual(SELF_REGISTERABLE_ROLES, ["donor", "ngo"]);
    assert.equal(SELF_REGISTERABLE_ROLES.includes("admin"), false);
});

test("participant and CareCycle Administration login realms do not overlap", () => {
    assert.equal(roleCanUseRealm("donor", "participant"), true);
    assert.equal(roleCanUseRealm("ngo", "participant"), true);
    assert.equal(roleCanUseRealm("admin", "participant"), false);
    assert.equal(roleCanUseRealm("admin", "administration"), true);
    assert.equal(roleCanUseRealm("donor", "administration"), false);
});

test("each trusted role receives its own dashboard", () => {
    assert.equal(getDashboardPath("donor"), "/donor/dashboard");
    assert.equal(getDashboardPath("ngo"), "/ngo/dashboard");
    assert.equal(getDashboardPath("admin"), "/admin/dashboard");
    assert.equal(getDashboardPath("unexpected"), "/home");
});
