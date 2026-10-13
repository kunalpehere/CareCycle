import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema({
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true, index: true },
    action: { type: String, required: true, trim: true, maxlength: 100, index: true },
    targetType: { type: String, enum: ["organization", "user", "donation", "request"], required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    details: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true, versionKey: false });

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

export const AuditLog = mongoose.model("audit_logs", auditLogSchema);
