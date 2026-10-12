import mongoose from "mongoose";
import { REQUEST_INDEX_NAME, REQUEST_INDEX_FILTER } from "../services/requestPolicy.js";
import { EQUIPMENT_TYPES, EQUIPMENT_CONDITIONS } from "./Donation.js";

const listingSnapshotSchema = new mongoose.Schema({
    equipment: { type: String, enum: EQUIPMENT_TYPES, required: true },
    condition: { type: String, enum: EQUIPMENT_CONDITIONS, required: true },
    totalQuantity: { type: Number, min: 1, max: 100, required: true },
    location: { city: String, state: String, postalCode: String }
}, { _id: false });

const donationRequestSchema = new mongoose.Schema({
    donation: { type: mongoose.Schema.Types.ObjectId, ref: "donations", required: true, index: true },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "organizations", required: true, index: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    quantity: { type: Number, required: true, min: 1, max: 100, default: 1 },
    beneficiary: { type: String, required: true, trim: true, minlength: 10, maxlength: 500 },
    message: { type: String, required: true, trim: true, minlength: 20, maxlength: 1000 },
    listingSnapshot: { type: listingSnapshotSchema, default: null },
    status: { type: String, enum: ["pending", "accepted", "rejected", "cancelled", "completed"], default: "pending", index: true },
    responseNote: { type: String, trim: true, maxlength: 500, default: "" },
    respondedAt: { type: Date, default: null },
    respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    resolutionReason: { type: String, enum: ["", "organization_cancelled", "listing_withdrawn", "availability_changed"], default: "" }
}, { timestamps: true });

donationRequestSchema.index({ donation: 1, organization: 1 }, { unique: true, name: REQUEST_INDEX_NAME, partialFilterExpression: REQUEST_INDEX_FILTER });
donationRequestSchema.path("quantity").validate(Number.isSafeInteger, "Request quantity must be a whole number.");
donationRequestSchema.index({ organization: 1, status: 1, createdAt: -1 });
donationRequestSchema.index({ donation: 1, status: 1, createdAt: 1 });

export const DonationRequest = mongoose.model("donation_requests", donationRequestSchema);
