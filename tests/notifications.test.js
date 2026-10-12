import test from "node:test";
import assert from "node:assert/strict";
import ejs from "ejs";
import path from "node:path";
import { genericNotificationMail, emailRetryDelay, MAX_EMAIL_ATTEMPTS, createNotificationSender } from "../src/services/notificationWorker.js";
import { notificationKey, notificationTitles } from "../src/services/notificationService.js";
import { User } from "../src/models/User.js";

test("notification emails contain only a generic account link and stable message identifier", () => {
    const mail = genericNotificationMail({ to: "synthetic@example.invalid", id: notificationKey("event:owner"), appUrl: "https://example.invalid", from: "synthetic-sender@example.invalid", beneficiary: "PRIVATE_BENEFICIARY", address: "PRIVATE_ADDRESS" });
    assert.match(mail.text, /https:\/\/example.invalid\/notifications/);
    assert.doesNotMatch(JSON.stringify(mail), /PRIVATE_BENEFICIARY|PRIVATE_ADDRESS/);
    assert.equal(mail.messageId, genericNotificationMail({ id: notificationKey("event:owner"), appUrl: "https://example.invalid" }).messageId);
    assert.equal(createNotificationSender(), null);
});
test("notification email defaults off and retry schedule is bounded", () => {
    assert.equal(new User().notificationEmailEnabled, false);
    assert.equal(MAX_EMAIL_ATTEMPTS, 5);
    assert.deepEqual([1, 2, 3, 4, 5].map(emailRetryDelay), [30000, 60000, 120000, 240000, 480000]);
    assert.equal(emailRetryDelay(100), 3600000);
    assert.notEqual(notificationKey("event:a"), notificationKey("event:b"));
});
test("inbox template escapes messages and presents read state without private event payloads", async () => {
    const html = await ejs.renderFile(path.resolve("views/notifications.ejs"), {
        currentUser: { role: "ngo", name: "Synthetic Member" }, csrfToken: "synthetic-token", unread: 1, count: 1, page: 1,
        message: "<script>private()</script>", preferences: { notificationEmailEnabled: false }, emailConfigured: false, notificationTitles,
        notifications: [{ _id: notificationKey("synthetic"), kind: "request_accepted", createdAt: new Date("2026-01-01"), readAt: null, mailStatus: "disabled", beneficiary: "PRIVATE_BENEFICIARY" }]
    });
    assert.match(html, /Equipment request accepted/); assert.match(html, /Mark read/); assert.match(html, /name="_csrf"/);
    assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>private|PRIVATE_BENEFICIARY/);
});
