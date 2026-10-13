import { randomBytes, createHash } from "node:crypto";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import { User } from "../models/User.js";
import { env } from "../config/env.js";
import { sendAccountMail } from "./mailService.js";

const fields = { reset: "resetCredential", verification: "verificationCredential" };
export const credentialHash = token => createHash("sha256").update(token).digest("hex");
export const validRecoveryPassword = password => typeof password === "string" && password.length >= 8 && Buffer.byteLength(password, "utf8") <= 72;
const credentialFilter = (id, purpose, token) => {
    if (typeof id !== "string" || !mongoose.isValidObjectId(id) || !fields[purpose] || typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return null;
    const field = fields[purpose];
    return { _id: id, status: "active", [`${field}.hash`]: credentialHash(token), [`${field}.expiresAt`]: { $gt: new Date() }, $expr: { $eq: ["$email", `$${field}.email`] } };
};

// Persist only a digest. A resend replaces the previous credential atomically.
// The cooldown survives restarts and applies across clients and app instances.
export const issueAccountCredential = async (user, purpose, { send = sendAccountMail } = {}) => {
    const field = fields[purpose];
    if (!field) throw new Error("Unsupported account credential purpose.");
    const now = new Date();
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(now.getTime() + (purpose === "reset" ? 30 * 60 : 24 * 60 * 60) * 1000);
    const filter = { _id: user._id, email: user.email, status: "active", $or: [
        { [`${field}.issuedAt`]: { $lte: new Date(now.getTime() - 60000) } }, { [`${field}.issuedAt`]: { $exists: false } }
    ] };
    if (purpose === "verification") filter.emailVerifiedAt = null;
    const issued = await User.findOneAndUpdate(filter, { $set: { [field]: { hash: credentialHash(token), email: user.email, expiresAt, issuedAt: now } } }, { new: true });
    if (!issued) return { sent: false, reason: "cooldown-or-ineligible" };
    const url = new URL(purpose === "reset" ? "/reset-password" : "/verify-email", env.appUrl);
    url.searchParams.set("id", user.id);
    url.searchParams.set("token", token);
    try { return await send({ to: issued.email, purpose, url: url.href }); }
    catch { return { sent: false, reason: "delivery-failed" }; }
};

export const hasAccountCredential = async (id, purpose, token) => {
    const filter = credentialFilter(id, purpose, token);
    return Boolean(filter && await User.exists(filter));
};

export const consumeAccountCredential = async ({ id, purpose, token, password }) => {
    const filter = credentialFilter(id, purpose, token);
    if (!filter || (purpose === "reset" && !validRecoveryPassword(password))) return false;
    const field = fields[purpose];
    const update = purpose === "reset" ? {
        $set: { password: await bcrypt.hash(password, 12) }, $inc: { authVersion: 1 }, $unset: { resetCredential: 1 }
    } : { $set: { emailVerifiedAt: new Date() }, $unset: { verificationCredential: 1 } };
    filter[`${field}.expiresAt`] = { $gt: new Date() };
    const result = await User.updateOne(filter, update);
    return result.modifiedCount === 1;
};
