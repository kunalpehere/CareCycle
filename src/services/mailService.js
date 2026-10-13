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

export const sendDonationMail = async () => {
    const configuration = getConfiguration();
    if (!configuration) return { sent: false, reason: "not-configured" };
    await configuration.transporter.sendMail({
        from: env.mailFrom,
        to: configuration.recipients,
        subject: "Donation of medical equipment",
        html: `<main><h3>New CareCycle donation</h3><p>A new equipment listing was created. Sign in to review it.</p><p><a href="${escapeHtml(env.appUrl)}">Visit CareCycle</a></p></main>`
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

export const sendAccountMail = async ({ to, purpose, url }) => {
    if (!env.mailUser || !env.mailPassword) return { sent: false, reason: "not-configured" };
    const transporter = nodemailer.createTransport({ service: env.mailService,
        auth: { user: env.mailUser, pass: env.mailPassword }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 });
    const title = purpose === "reset" ? "Reset your CareCycle password" : "Verify your CareCycle email";
    const lifetime = purpose === "reset" ? "30 minutes" : "24 hours";
    await transporter.sendMail({ from: env.mailFrom, to, subject: title,
        text: `${title}\n${url}\nThis link expires in ${lifetime} and can be used once. If you did not request this, ignore this message.`,
        html: `<h1>${title}</h1><p><a href="${escapeHtml(url)}">${title}</a></p><p>This link expires in ${lifetime} and can be used once. If you did not request this, ignore this message.</p>` });
    return { sent: true };
};
