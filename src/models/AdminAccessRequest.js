import mongoose from "mongoose";

const adminAccessRequestSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    workEmail: { type: String, required: true, trim: true, lowercase: true, maxlength: 254, unique: true },
    department: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    justification: { type: String, required: true, trim: true, minlength: 30, maxlength: 1000 },
    status: { type: String, enum: ["pending", "reviewed", "rejected"], default: "pending", index: true }
}, { timestamps: true });

adminAccessRequestSchema.index({ status: 1, createdAt: 1 });
export const AdminAccessRequest = mongoose.model("admin_access_requests", adminAccessRequestSchema);
