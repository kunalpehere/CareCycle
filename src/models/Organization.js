import mongoose from "mongoose";

const organizationSchema = new mongoose.Schema({
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 150 },
    registrationNumber: { type: String, trim: true, maxlength: 100, unique: true, sparse: true },
    contactEmail: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    contactPerson: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    phone: { type: String, trim: true, maxlength: 30, default: "" },
    website: { type: String, trim: true, maxlength: 300, default: "" },
    description: { type: String, required: true, trim: true, minlength: 20, maxlength: 1500 },
    address: {
        line1: { type: String, trim: true, maxlength: 200, default: "" },
        city: { type: String, trim: true, maxlength: 100, default: "" },
        state: { type: String, trim: true, maxlength: 100, default: "" },
        postalCode: { type: String, trim: true, maxlength: 20, default: "" }
    },
    verificationStatus: { type: String, enum: ["pending", "verified", "rejected"], default: "pending", index: true },
    verificationDocument: {
        storage: { type: String, enum: ["gridfs"] },
        sha256: { type: String, match: /^[a-f0-9]{64}$/ },
        filename: { type: String, required: true },
        originalName: { type: String, required: true, maxlength: 255 },
        mimeType: { type: String, enum: ["application/pdf", "image/jpeg", "image/png"], required: true },
        size: { type: Number, required: true, min: 1, max: 8 * 1024 * 1024 }
    },
    submittedAt: { type: Date, default: Date.now },
    rejectionReason: { type: String, trim: true, maxlength: 1000, default: "" },
    verifiedAt: { type: Date, default: null },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null }
}, { timestamps: true });

organizationSchema.index({ verificationStatus: 1, submittedAt: 1 });

export const Organization = mongoose.model("organizations", organizationSchema);
