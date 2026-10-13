import mongoose from "mongoose";
import { User } from "../models/User.js";
import { Donation } from "../models/Donation.js";
import { DonationRequest } from "../models/DonationRequest.js";
import { AuditLog } from "../models/AuditLog.js";
import { runTransaction } from "./transactionService.js";
import { guardActiveActor } from "./workflowActorService.js";
import { positivePage } from "./ngoWorkspaceService.js";

export const reviewVersion = value => typeof value === "string" && /^(0|[1-9]\d{0,8})$/.test(value) ? Number(value) : null;
export const reviewReason = value => typeof value === "string" && value.trim().length >= 10 && value.trim().length <= 500 ? value.trim() : null;
export const versionFilter = (field, version) => version === 0 ? { $or: [{ [field]: 0 }, { [field]: { $exists: false } }] } : { [field]: version };
export const paginate = async (Model, query, page, select, sort = { createdAt: -1, _id: -1 }) => {
    const total = await Model.countDocuments(query), totalPages = Math.max(1, Math.ceil(total / 20));
    page = Math.min(positivePage(page), totalPages);
    const records = await Model.find(query).select(select).sort(sort).skip((page - 1) * 20).limit(20).lean();
    return { records, total, totalPages, page };
};

export const moderateUser = async ({ userId, actorId, status, version, reason }) => {
    if (!mongoose.isValidObjectId(userId) || !["active", "suspended"].includes(status) || !Number.isSafeInteger(version) || version < 0 || !reviewReason(reason)) return false;
    return runTransaction(User.db, async session => {
        if (!await guardActiveActor(actorId, session, "admin")) return false;
        const user = await User.findOneAndUpdate({ _id: userId, role: { $in: ["donor", "ngo"] }, status: status === "active" ? "suspended" : "active", ...versionFilter("moderationVersion", version) },
            { $set: { status, moderationReason: reason, moderatedBy: actorId, moderatedAt: new Date() }, $inc: { moderationVersion: 1, authVersion: 1 } }, { new: true, session });
        if (!user) return false;
        if (user.role === "donor") await Donation.updateMany({ donor: user._id }, { $set: { donorSuspended: status === "suspended" }, $inc: { __v: 1 } }, { session });
        await AuditLog.create([{ actor: actorId, action: `user.${status === "active" ? "reactivated" : "suspended"}`, targetType: "user", targetId: user._id,
            details: { reason, previousStatus: status === "active" ? "suspended" : "active", status, version: user.moderationVersion } }], { session });
        return true;
    });
};

export const moderateListing = async ({ donationId, actorId, status, version, reason }) => {
    if (!mongoose.isValidObjectId(donationId) || !["visible", "hidden"].includes(status) || !Number.isSafeInteger(version) || version < 0 || !reviewReason(reason)) return false;
    return runTransaction(Donation.db, async session => {
        if (!await guardActiveActor(actorId, session, "admin")) return false;
        const donation = await Donation.findOneAndUpdate({ _id: donationId, ...versionFilter("__v", version), moderationStatus: status === "visible" ? "hidden" : { $ne: "hidden" } },
            { $set: { moderationStatus: status, moderationReason: reason, moderatedBy: actorId, moderatedAt: new Date() }, $inc: { __v: 1 } }, { new: true, session });
        if (!donation) return false;
        await AuditLog.create([{ actor: actorId, action: `donation.${status === "hidden" ? "hidden" : "restored"}`, targetType: "donation", targetId: donation._id,
            details: { reason, status, version: donation.__v } }], { session });
        return true;
    });
};

export const exceptionPipeline = (filter = "all", participantId = null) => {
    const suspended = { $or: [{ "donor.status": "suspended" }, { "member.status": "suspended" }] };
    const discrepancy = { "fulfillment.transfers.status": "disputed" };
    const missed = { "pickup.status": "missed" };
    const condition = participantId ? { $or: [{ "donor._id": participantId }, { "member._id": participantId }] } : ({ suspended, discrepancy, missed })[filter] || { $or: [suspended, discrepancy, missed] };
    return [
        { $match: { status: "accepted" } },
        { $lookup: { from: Donation.collection.name, localField: "donation", foreignField: "_id", as: "listing" } }, { $unwind: "$listing" },
        { $lookup: { from: User.collection.name, localField: "listing.donor", foreignField: "_id", as: "donor" } }, { $unwind: "$donor" },
        { $lookup: { from: User.collection.name, localField: "requestedBy", foreignField: "_id", as: "member" } }, { $unwind: "$member" },
        { $match: condition },
        { $project: { _id: 1, quantity: 1, handedOverQuantity: 1, acknowledgedQuantity: 1, releasedQuantity: 1, updatedAt: 1, "pickup.status": 1,
            "donor._id": 1, "donor.name": 1, "donor.status": 1, "member._id": 1, "member.name": 1, "member.status": 1, "listing.equipment": 1,
            disputed: { $in: ["disputed", { $ifNull: ["$fulfillment.transfers.status", []] }] } } }
    ];
};
