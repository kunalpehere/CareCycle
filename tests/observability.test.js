import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createTelemetry, observeRequest } from "../src/services/observabilityService.js";
import { errorHandler } from "../src/middleware/errors.js";

test("structured logging excludes private inputs and resists injected fields", () => {
    const lines = [], telemetry = createTelemetry({ write: line => lines.push(line) });
    telemetry.log("request.failed", { reference: "injected\nsecret", route: "/reset-password?token=PRIVATE", method: "PRIVATE_METHOD", status: 500, code: "internal_failure", email: "private@example.invalid", beneficiary: "PRIVATE", error: new Error("PRIVATE"), headers: { cookie: "PRIVATE" } });
    const record = JSON.parse(lines[0]);
    assert.equal(record.route, "unmatched"); assert.equal(record.method, "OTHER"); assert.equal(record.code, "internal_failure");
    assert.doesNotMatch(lines[0], /PRIVATE|example.invalid|secret|cookie/); assert.equal(record.reference, undefined);
    telemetry.log("private@example.invalid", { status: 500 }); assert.equal(lines.length, 1);
});
test("server-generated references reject client IDs and record a response only once", () => {
    const res = new EventEmitter(); res.locals = {}; res.statusCode = 200; res.writableFinished = true; const headers = {};
    res.setHeader = (key, value) => { headers[key] = value; };
    const req = { method: "GET", headers: { "x-request-id": "UNTRUSTED" } };
    observeRequest(req, res, () => {});
    assert.match(headers["X-Request-ID"], /^[a-f0-9-]{36}$/); assert.equal(res.locals.supportReference, req.requestId);
    res.emit("finish"); res.emit("close");
});
test("metrics stay bounded and reset per process instance; broken log sinks cannot stop work", () => {
    const telemetry = createTelemetry({ write: () => { throw new Error("Broken sink"); } });
    assert.doesNotThrow(() => telemetry.log("request.failed", { status: 500 }));
    telemetry.request(409, 20, false); telemetry.request(503, 30, true); telemetry.increment("emailFailed"); telemetry.increment("PRIVATE");
    const metrics = telemetry.snapshot(); assert.equal(metrics.requests, 2); assert.equal(metrics.clientErrors, 1); assert.equal(metrics.serverErrors, 1); assert.equal(metrics.durationMsMean, 25); assert.equal(metrics.emailFailed, 1); assert.equal(metrics.PRIVATE, undefined);
    assert.equal(createTelemetry().snapshot().requests, 0);
});
test("unexpected errors and malformed input never expose raw error text", () => {
    for (const error of [new Error("PRIVATE mongodb://user:password@host/ beneficiary text"), Object.assign(new Error("PRIVATE invalid body"), { status: 400 })]) {
        const headers = {}; let body, status;
        const res = { setHeader: (key, value) => { headers[key] = value; }, status: value => { status = value; return res; }, send: value => { body = value; } };
        errorHandler(error, { method: "POST", accepts: () => "json" }, res, () => {});
        assert.doesNotMatch(body, /PRIVATE|password|mongodb/); assert.equal(status, error.status || 500);
    }
    let destroyed = false;
    errorHandler(new Error("PRIVATE_AFTER_HEADERS"), { method: "GET" }, { headersSent: true, destroy: () => { destroyed = true; } }, () => { throw new Error("Raw errors must not reach Express's default logger"); });
    assert.equal(destroyed, true);
});
