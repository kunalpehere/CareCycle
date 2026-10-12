import mongoose from "mongoose";

const lifecycleEventSchema = new mongoose.Schema({
    _id: { type: String },
    kind: { type: String, required: true },
    resourceType: { type: String, enum: ["request", "organization"], required: true },
    resourceId: { type: mongoose.Schema.Types.ObjectId, required: true },
    recipients: [{ user: { type: mongoose.Schema.Types.ObjectId, required: true }, role: { type: String, enum: ["donor", "ngo", "admin"], required: true }, href: { type: String, required: true } }],
    createdAt: { type: Date, required: true, default: Date.now },
    processedAt: { type: Date, default: null }
}, { versionKey: false });
lifecycleEventSchema.index({ processedAt: 1, createdAt: 1 });
export const LifecycleEvent = mongoose.model("lifecycle_events", lifecycleEventSchema);
