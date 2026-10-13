import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import mongoose from "mongoose";
import { assertRecoveryReleased } from "./recoveryGuardService.js";
import { logEvent, recordMailOutcome, telemetry, withOperationReference } from "./observabilityService.js";
import { env } from "../config/env.js";
import { Notification } from "../models/Notification.js";
import { eligibleRecipient, processOutboxBatch } from "./notificationService.js";

export const MAX_EMAIL_ATTEMPTS = 5;
export const emailRetryDelay = attempts => Math.min(3600000, 30000 * 2 ** Math.max(0, attempts - 1));
export const genericNotificationMail = ({ to, id, appUrl = env.appUrl, from = env.mailFrom }) => ({
    from, to, messageId: `<${id}@${new URL(appUrl).hostname}>`, subject: "CareCycle account update",
    text: `There is an update in your CareCycle account. Sign in to review it.\n\n${appUrl}/notifications\n\nYou can turn off notification email in your notification preferences.`
});
export const createNotificationSender = () => {
    if (!env.mailUser || !env.mailPassword) return null;
    const transport = nodemailer.createTransport({ service: env.mailService, auth: { user: env.mailUser, pass: env.mailPassword }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 });
    return message => transport.sendMail(message);
};
export const processEmailBatch = async ({ send = null, now = new Date(), limit = 25, leaseMs = 120000 } = {}) => {
    if (send) await assertRecoveryReleased(mongoose.connection);
    await Notification.updateMany({ mailStatus: "pending", attempts: { $gte: MAX_EMAIL_ATTEMPTS }, lockedUntil: { $lte: now } }, { $set: { mailStatus: "failed", lockedUntil: null, leaseToken: null, failureCode: "attempt_limit" } });
    if (!send) return 0; // Disabled configuration does not consume an attempt.
    let attempted = 0;
    for (let index = 0; index < limit; index++) {
        const token = randomUUID();
        const notification = await Notification.findOneAndUpdate({ mailStatus: "pending", attempts: { $lt: MAX_EMAIL_ATTEMPTS }, nextAttemptAt: { $lte: now }, $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }] },
            { $set: { leaseToken: token, lockedUntil: new Date(now.getTime() + leaseMs) }, $inc: { attempts: 1 } }, { sort: { nextAttemptAt: 1, _id: 1 }, new: true }).lean();
        if (!notification) break;
        const filter = { _id: notification._id, leaseToken: token, mailStatus: "pending" };
        const user = await eligibleRecipient(notification);
        if (!user || user.notificationEmailEnabled !== true) {
            await Notification.updateOne(filter, { $set: { mailStatus: "suppressed", leaseToken: null, lockedUntil: null } }); continue;
        }
        attempted += 1;
        try {
            await send(genericNotificationMail({ to: user.email, id: notification._id }));
        } catch {
            recordMailOutcome("notification", { sent: false, reason: "delivery-failed" });
            await Notification.updateOne(filter, { $set: { mailStatus: notification.attempts >= MAX_EMAIL_ATTEMPTS ? "failed" : "pending",
                nextAttemptAt: new Date(now.getTime() + emailRetryDelay(notification.attempts)), leaseToken: null, lockedUntil: null, failureCode: "delivery_failed" } });
            continue;
        }
        recordMailOutcome("notification", { sent: true });
        // A persistence failure after provider acceptance is an infrastructure
        // failure, not a failed email delivery. The lease remains recoverable.
        await Notification.updateOne(filter, { $set: { mailStatus: "sent", sentAt: now, leaseToken: null, lockedUntil: null, failureCode: "" } });
    }
    return attempted;
};

export const startNotificationWorker = ({ intervalMs = 2000, send = createNotificationSender() } = {}) => {
    let running = null, stopped = false;
    const id = randomUUID();
    const state = { status: "idle", mailConfigured: Boolean(send), lastSuccessAt: null, lastFailureAt: null, batchStartedAt: null };
    let publishing = null;
    const publish = () => {
        if (publishing) return publishing;
        const snapshot = { ...state, heartbeatAt: new Date(), expiresAt: new Date(Date.now() + 86400000) };
        publishing = (async () => {
            if (mongoose.connection.readyState !== 1) return;
            await mongoose.connection.db.collection("operational_workers").updateOne({ _id: id }, { $set: snapshot }, { upsert: true, maxTimeMS: 1000, writeConcern: { w: "majority", wtimeout: 1000 } });
        })().catch(() => logEvent("worker.failed", { reference: id, code: "worker_batch_failed" })).finally(() => { publishing = null; });
        return publishing;
    };
    logEvent("worker.started", { reference: id }); if (!send) logEvent("mail.disabled", { reference: id, channel: "notification", code: "mail_disabled" });
    const tick = () => {
        if (stopped || running) return;
        running = withOperationReference(async () => {
            state.status = "running"; state.batchStartedAt = new Date(); await publish();
            try {
                await processOutboxBatch(); await processEmailBatch({ send });
                state.status = "idle"; state.lastSuccessAt = new Date();
            } catch {
                state.status = "failed"; state.lastFailureAt = new Date(); telemetry.increment("workerFailures");
                logEvent("worker.failed", { code: "worker_batch_failed" });
            } finally { state.batchStartedAt = null; await publish(); }
        }).finally(() => { running = null; });
    };
    const timer = setInterval(tick, intervalMs); timer.unref(); tick();
    const heartbeat = setInterval(() => { void publish(); }, 10000); heartbeat.unref();
    return { stop: async () => { stopped = true; clearInterval(timer); clearInterval(heartbeat); if (running) await running; if (publishing) await publishing; state.status = "stopped"; await publish(); logEvent("worker.stopped", { reference: id }); } };
};
