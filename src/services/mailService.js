import nodemailer from "nodemailer";
import { env } from "../config/env.js";

const escapeHtml = (value) => String(value)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

const getConfiguration = () => {
    if (!env.mailUser || !env.mailPassword || env.mailRecipients.length === 0) return null;
    return {
        recipients: env.mailRecipients,
        transporter: nodemailer.createTransport({
            service: env.mailService,
            auth: { user: env.mailUser, pass: env.mailPassword }
        })
    };
};

export const sendDonationMail = async ({ email, equipment, condition }) => {
    const configuration = getConfiguration();
    if (!configuration) return { sent: false, reason: "not-configured" };
    await configuration.transporter.sendMail({
        from: env.mailFrom,
        to: configuration.recipients,
        subject: "Donation of medical equipment",
        html: `<main><h3>New CareCycle donation</h3><p>A donor is offering <strong>${escapeHtml(condition)}</strong> <strong>${escapeHtml(equipment)}</strong>.</p><p>Donor contact: ${escapeHtml(email)}</p><p><a href="${escapeHtml(env.appUrl)}">Visit CareCycle</a></p></main>`
    });
    return { sent: true };
};

export const sendContactMail = async ({ name, email, message }) => {
    const configuration = getConfiguration();
    if (!configuration) return { sent: false, reason: "not-configured" };
    await configuration.transporter.sendMail({
        from: env.mailFrom,
        to: configuration.recipients,
        replyTo: email,
        subject: "CareCycle contact message",
        html: `<h3>Contact message from ${escapeHtml(name)}</h3><p>${escapeHtml(message)}</p><p>Reply to: ${escapeHtml(email)}</p>`
    });
    return { sent: true };
};
