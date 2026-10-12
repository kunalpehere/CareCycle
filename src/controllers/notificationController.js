import { Notification } from "../models/Notification.js";
import { User } from "../models/User.js";
import { notificationTitles, eligibleRecipient } from "../services/notificationService.js";
import { env } from "../config/env.js";

export const showNotifications = async (req, res, next) => {
    try {
        const page = typeof req.query.page === "string" && /^[1-9]\d{0,4}$/.test(req.query.page) ? Number(req.query.page) : 1;
        const filter = { recipient: req.auth.userId, role: req.auth.user.role };
        const results = await Promise.all([Notification.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 20).limit(20).lean(),
            Notification.countDocuments(filter), Notification.countDocuments({ ...filter, readAt: null }), User.findById(req.auth.userId).select("notificationEmailEnabled").lean()]);
        res.render("notifications.ejs", { notifications: results[0], count: results[1], unread: results[2], preferences: results[3], page,
            notificationTitles, emailConfigured: Boolean(env.mailUser && env.mailPassword), message: String(req.query.message || "") });
    } catch (error) { next(error); }
};
const ownedNotification = req => /^[a-f0-9]{64}$/.test(req.params.id || "") ? Notification.findOne({ _id: req.params.id, recipient: req.auth.userId, role: req.auth.user.role }) : null;
export const markNotificationRead = async (req, res, next) => {
    try {
        const notification = await ownedNotification(req);
        if (!notification) return res.status(404).send("Notification not found");
        await Notification.updateOne({ _id: notification._id, recipient: req.auth.userId, readAt: null }, { $set: { readAt: new Date() } });
        res.redirect("/notifications?message=Notification%20marked%20read.");
    } catch (error) { next(error); }
};
export const openNotification = async (req, res, next) => {
    try {
        const notification = await ownedNotification(req);
        if (!notification) return res.status(404).send("Notification not found");
        if (!await eligibleRecipient(notification)) return res.status(403).send("This update is no longer accessible. Review your account or organization verification status.");
        res.redirect(notification.href);
    } catch (error) { next(error); }
};
export const updateNotificationPreferences = async (req, res, next) => {
    try {
        if (!["enabled", "disabled"].includes(req.body.email)) return res.status(422).send("Choose enabled or disabled for notification email.");
        await User.updateOne({ _id: req.auth.userId }, { $set: { notificationEmailEnabled: req.body.email === "enabled" } });
        if (req.body.email === "disabled") await Notification.updateMany({ recipient: req.auth.userId, mailStatus: "pending", lockedUntil: null }, { $set: { mailStatus: "suppressed" } });
        res.redirect("/notifications?message=Notification%20preferences%20saved.");
    } catch (error) { next(error); }
};
