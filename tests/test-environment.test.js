import test from "node:test";
import assert from "node:assert/strict";
import { isolatedTestEnvironment } from "./support/environment.js";

test("test harness does not inherit production database, secrets, mail or Node options", () => {
    const poisoned = {
        NODE_ENV: "production", MONGO_URI: "mongodb://example.invalid:27017/production",
        MONGO_DB_NAME: "production", JWT_SECRET: "synthetic-old-secret", SESSION_SECRET: "synthetic-old-secret",
        MAIL_USER: "synthetic@example.invalid", MAIL_PASSWORD: "synthetic-mail-password", MAIL_RECIPIENTS: "synthetic@example.invalid",
        NODE_OPTIONS: "--inspect=9229", CARECYCLE_BACKUP_KEY: "synthetic-private-backup-key"
    };
    const previous = Object.fromEntries(Object.keys(poisoned).map(key => [key, process.env[key]]));
    try {
        Object.assign(process.env, poisoned);
        const isolated = isolatedTestEnvironment();
        assert.equal(isolated.NODE_ENV, "test");
        assert.equal(isolated.MONGO_URI, "mongodb://127.0.0.1:1");
        assert.match(isolated.MONGO_DB_NAME, /^carecycle_test_[a-f0-9]+$/);
        assert.notEqual(isolated.JWT_SECRET, poisoned.JWT_SECRET);
        assert.notEqual(isolated.SESSION_SECRET, isolated.JWT_SECRET);
        for (const key of ["MAIL_USER", "MAIL_PASSWORD", "MAIL_RECIPIENTS", "NODE_OPTIONS", "CARECYCLE_BACKUP_KEY"]) assert.equal(isolated[key], "");
    } finally {
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
});
