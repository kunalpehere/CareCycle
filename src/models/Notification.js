import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
    _id: { type: String },
    event: { type: String, required: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    role: { type: String, enum: ["donor", "ngo", "admin"], required: true },
    kind: { type: String, required: true },
    resourceType: { type: String, enum: ["request", "organization"], required: true },
    resourceId: { type: mongoose.Schema.Types.ObjectId, required: true },
    href: { type: String, required: true },
    createdAt: { type: Date, required: true },
    readAt: { type: Date, default: null },
    mailStatus: { type: String, enum: ["disabled", "pending", "sent", "failed", "suppressed"], default: "disabled" },
    attempts: { type: Number, min: 0, max: 5, default: 0 },
    nextAttemptAt: { type: Date, default: null },
    lockedUntil: { type: Date, default: null },
    leaseToken: { type: String, default: null },
    sentAt: { type: Date, default: null },
    failureCode: { type: String, default: "" }
}, { versionKey: false });
notificationSchema.index({ recipient: 1, createdAt: -1, _id: -1 });
notificationSchema.index({ mailStatus: 1, nextAttemptAt: 1, lockedUntil: 1 });
export const Notification = mongoose.model("notifications", notificationSchema);
