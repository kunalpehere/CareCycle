import test from "node:test";
import assert from "node:assert/strict";
import { isolatedTestEnvironment } from "./support/environment.js";
import { parseRuntimeEnvironment } from "../src/config/runtime.js";

test("demo config requires explicit isolated naming, replica set and disabled outbound email", () => {
    const source = { ...isolatedTestEnvironment(), DEMO_MODE: "true" };
    assert.equal(parseRuntimeEnvironment(source).demoMode, true);
    for (const change of [{ DEMO_MODE: "yes" }, { MONGO_REQUIRE_REPLICA_SET: "false" }, { MONGO_DB_NAME: "CareCycle" }, { MAIL_USER: "synthetic@example.invalid", MAIL_PASSWORD: "synthetic-password", MAIL_RECIPIENTS: "synthetic@example.invalid" }]) assert.throws(() => parseRuntimeEnvironment({ ...source, ...change }));
    assert.equal(parseRuntimeEnvironment(isolatedTestEnvironment()).demoMode, false);
    const production = { ...source, NODE_ENV: "production", APP_URL: "https://demo.example.invalid", TRUST_PROXY: "127.0.0.1", MONGO_URI: "mongodb://synthetic:synthetic-password@db.example.invalid/?tls=true&replicaSet=rs", MONGO_DB_NAME: "carecycle_demo_staging" };
    assert.equal(parseRuntimeEnvironment(production).demoMode, true);
    assert.throws(() => parseRuntimeEnvironment({ ...production, MONGO_DB_NAME: "carecycle_test_staging" }));
});
