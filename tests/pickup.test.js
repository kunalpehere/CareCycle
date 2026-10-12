import test from "node:test";
import assert from "node:assert/strict";
import { pickupVersion, zonedPickupTime, validatePickupProposal } from "../src/services/pickupService.js";
import ejs from "ejs";
import path from "node:path";

test("pickup times resolve in named zones independently of server time", () => {
    assert.equal(zonedPickupTime("2030-01-10T10:00", "Asia/Kolkata").toISOString(), "2030-01-10T04:30:00.000Z");
    assert.equal(zonedPickupTime("2030-01-10T10:00", "America/New_York").toISOString(), "2030-01-10T15:00:00.000Z");
    assert.equal(zonedPickupTime("2030-07-10T10:00", "America/New_York").toISOString(), "2030-07-10T14:00:00.000Z");
    assert.equal(zonedPickupTime("2030-01-10T10:00", "Asia/Kathmandu").toISOString(), "2030-01-10T04:15:00.000Z");
    assert.equal(zonedPickupTime("2030-01-10T10:00", "Etc/GMT+5").toISOString(), "2030-01-10T15:00:00.000Z");
});

test("pickup times reject invalid calendar values, zones and DST gaps/overlaps", () => {
    for (const [local, zone] of [["2030-02-30T10:00", "UTC"], ["2030-01-10T24:00", "UTC"], ["2030-01-10T10:00", "Fake/Zone"], ["2030-03-10T02:30", "America/New_York"], ["2030-11-03T01:30", "America/New_York"], ["2030-01-10", "UTC"]]) assert.throws(() => zonedPickupTime(local, zone));
});

test("pickup proposal validation bounds text and rejects past/reversed windows", () => {
    const body = { localStart: "2030-01-10T10:00", localEnd: "2030-01-10T12:00", timeZone: "Asia/Kolkata", address: "  12 Synthetic Road  ", instructions: "  Call on arrival  " };
    const now = new Date("2030-01-01");
    const result = validatePickupProposal(body, now);
    assert.equal(result.valid, true); assert.equal(result.value.address, "12 Synthetic Road");
    assert.equal(result.value.instructions, "Call on arrival");
    for (const changes of [{ localEnd: body.localStart }, { localEnd: "2030-01-10T09:00" }, { address: "tiny" }, { address: "x".repeat(501) }, { instructions: "x".repeat(1001) }, { timeZone: ["UTC"] }]) assert.equal(validatePickupProposal({ ...body, ...changes }, now).valid, false);
    assert.equal(validatePickupProposal(body, new Date("2030-01-11")).valid, false);
});

test("pickup versions reject missing, fractional, negative and unsafe input", () => {
    assert.equal(pickupVersion("0"), 0); assert.equal(pickupVersion("3"), 3);
    for (const value of [undefined, -1, "-1", "1.5", "01", "9007199254740992", ["1"]]) assert.equal(pickupVersion(value), null);
});

test("pickup page escapes private content and only offers counterparty confirmation", async () => {
    const { formatPickupTime } = await import("../src/services/pickupService.js");
    const proposal = { start: new Date("2090-01-10T10:00Z"), end: new Date("2090-01-10T12:00Z"), timeZone: "UTC", localStart: "2090-01-10T10:00", localEnd: "2090-01-10T12:00", address: "<script>private</script>", instructions: "<img src=x onerror=alert(1)>", proposerRole: "donor" };
    const render = role => ejs.renderFile(path.resolve("views/pickup.ejs"), { request: { _id: "test", quantity: 2, pickup: { status: "proposed", version: 1, proposal, history: [{ action: "proposed", actorRole: "donor", at: new Date(), proposal }] } }, role, base: "/pickup", message: "", values: null, formatPickupTime, csrfToken: "test", currentUser: { role, name: "Synthetic" } });
    const donor = await render("donor"), ngo = await render("ngo");
    assert.doesNotMatch(donor, /Confirm pickup/); assert.match(ngo, /Confirm pickup/);
    assert.doesNotMatch(ngo, /<script>private|<img src=x/); assert.match(ngo, /&lt;script&gt;private/);
});
