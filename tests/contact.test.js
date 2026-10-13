import test from "node:test";
import assert from "node:assert/strict";
import nodemailer from "nodemailer";
import mongoose from "mongoose";

// Synthetic configuration in this test-file process only. No network mail sends.
Object.assign(process.env, { MAIL_SERVICE: "gmail", MAIL_USER: "synthetic@example.invalid", MAIL_PASSWORD: "synthetic-test-password", MAIL_FROM: "synthetic@example.invalid", MAIL_RECIPIENTS: "support@example.invalid" });
const { submitContact } = await import("../src/controllers/contactController.js");

test("contact reports provider success and failure honestly without losing failed entries", async t => {
    // This unit test mocks both provider and recovery-marker reads. Runtime
    // senders retain the real database guard; the restore drill tests it end to end.
    const previousDb = mongoose.connection.db; let quarantined = false;
    mongoose.connection.db = { collection: name => { assert.equal(name, "operational_recovery"); return { findOne: async () => quarantined ? { state: "quarantined" } : null }; } };
    t.after(() => { mongoose.connection.db = previousDb; });
    const body = { name: "Synthetic Guest", email: "guest@example.invalid", message: "Synthetic support question" };
    let status, locals, sent;
    const res = { status(value) { status = value; return this; }, render(view, data) { assert.equal(view, "contact.ejs"); locals = data; } };
    const next = error => { throw error; };
    const mock = t.mock.method(nodemailer, "createTransport", () => ({ sendMail: async data => { sent = data; } }));
    await submitContact({ body }, res, next);
    assert.equal(status, 200);
    assert.match(locals.message, /message was sent/);
    assert.deepEqual(locals.values, {});
    assert.equal(sent.replyTo, body.email);
    mock.mock.mockImplementation(() => ({ sendMail: async () => { throw new Error("Synthetic provider failure with private details"); } }));
    await submitContact({ body }, res, next);
    assert.equal(status, 503);
    assert.match(locals.message, /could not be sent/);
    assert.deepEqual(locals.values, body);
    assert.ok(!locals.message.includes("private details"));
    quarantined = true; sent = null;
    mock.mock.mockImplementation(() => ({ sendMail: async data => { sent = data; } }));
    await submitContact({ body }, res, next);
    assert.equal(status, 503); assert.equal(sent, null); assert.deepEqual(locals.values, body);
});
