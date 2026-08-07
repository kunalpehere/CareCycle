import mongoose from "mongoose";

const donationRequestSchema = new mongoose.Schema({
    donation: { type: mongoose.Schema.Types.ObjectId, ref: "donations", required: true, index: true },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "organizations", required: true, index: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    quantity: { type: Number, required: true, min: 1, max: 100, default: 1 },
    beneficiary: { type: String, required: true, trim: true, minlength: 10, maxlength: 500 },
    message: { type: String, required: true, trim: true, minlength: 20, maxlength: 1000 },
    status: { type: String, enum: ["pending", "accepted", "rejected", "cancelled", "completed"], default: "pending", index: true },
    responseNote: { type: String, trim: true, maxlength: 500, default: "" },
    respondedAt: { type: Date, default: null },
    respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null }
}, { timestamps: true });

donationRequestSchema.index({ donation: 1, organization: 1 }, { unique: true });
donationRequestSchema.index({ organization: 1, status: 1, createdAt: -1 });
donationRequestSchema.index({ donation: 1, status: 1, createdAt: 1 });

export const DonationRequest = mongoose.model("donation_requests", donationRequestSchema);
