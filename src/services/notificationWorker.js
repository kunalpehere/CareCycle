import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
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
            await Notification.updateOne(filter, { $set: { mailStatus: "sent", sentAt: now, leaseToken: null, lockedUntil: null, failureCode: "" } });
        } catch {
            await Notification.updateOne(filter, { $set: { mailStatus: notification.attempts >= MAX_EMAIL_ATTEMPTS ? "failed" : "pending",
                nextAttemptAt: new Date(now.getTime() + emailRetryDelay(notification.attempts)), leaseToken: null, lockedUntil: null, failureCode: "delivery_failed" } });
        }
    }
    return attempted;
};

export const startNotificationWorker = ({ intervalMs = 2000, send = createNotificationSender() } = {}) => {
    let running = null, stopped = false;
    const tick = () => {
        if (stopped || running) return;
        running = (async () => { await processOutboxBatch(); await processEmailBatch({ send }); })()
            .catch(() => console.error("Notification processing failed. Queued updates remain available for retry."))
            .finally(() => { running = null; });
    };
    const timer = setInterval(tick, intervalMs); timer.unref(); tick();
    return { stop: async () => { stopped = true; clearInterval(timer); if (running) await running; } };
};
