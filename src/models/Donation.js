import mongoose from "mongoose";
import { quantityAccounting } from "../services/quantityContract.js";
import { storedDetailsValid } from "../services/equipmentDetails.js";

export const EQUIPMENT_TYPES = ["wheelchair", "walker", "cane", "stethoscope"];
export const EQUIPMENT_CONDITIONS = ["brand-new", "good", "used", "old"];
export const DONATION_STATUSES = ["available", "requested", "matched", "pickup_scheduled", "completed", "withdrawn"];

const donationSchema = new mongoose.Schema({
    donor: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true, index: true },
    equipment: { type: String, enum: EQUIPMENT_TYPES, required: true, index: true },
    condition: { type: String, enum: EQUIPMENT_CONDITIONS, required: true },
    quantity: { type: Number, required: true, min: 1, max: 100, default: 1 },
    allocatedQuantity: { type: Number, min: 0, max: 100, default: 0 },
    handedOverQuantity: { type: Number, min: 0, max: 100, default: 0 },
    accountingVersion: { type: Number, enum: [1], default: 1 },
    description: { type: String, trim: true, maxlength: 1000, default: "" },
    details: { type: new mongoose.Schema({
        brand: { type: String, maxlength: 80, default: "" }, model: { type: String, maxlength: 80, default: "" },
        functionalStatus: { type: String, enum: ["not_checked", "working", "partly_working", "not_working"], default: "not_checked" },
        defects: { type: String, maxlength: 500, default: "" }, missingAccessories: { type: String, maxlength: 500, default: "" },
        specifications: { type: new mongoose.Schema({ seatWidthCm: { type: Number, min: 1, max: 100 }, folding: { type: String, enum: ["unknown", "yes", "no"] }, heightAdjustable: { type: String, enum: ["unknown", "yes", "no"] }, chestpiece: { type: String, maxlength: 80 }, tubingCondition: { type: String, enum: ["not_checked", "intact", "worn", "damaged"] } }, { _id: false }), default: () => ({}) }
    }, { _id: false }), default: null },
    location: {
        city: { type: String, trim: true, maxlength: 100, default: "" },
        state: { type: String, trim: true, maxlength: 100, default: "" },
        postalCode: { type: String, trim: true, maxlength: 20, default: "" }
    },
    images: [{
        filename: { type: String, required: true },
        originalName: { type: String, required: true, maxlength: 255 },
        mimeType: { type: String, enum: ["image/jpeg", "image/png", "image/webp"], required: true },
        size: { type: Number, required: true, min: 1, max: 5 * 1024 * 1024 }
    }],
    status: { type: String, enum: DONATION_STATUSES, default: "available", index: true },
    legacySourceKey: { type: String, unique: true, sparse: true }
}, { timestamps: true });

donationSchema.index({ donor: 1, createdAt: -1 });
donationSchema.index({ status: 1, equipment: 1, createdAt: -1 });

donationSchema.path("images").validate((images) => images.length <= 3, "A donation can have at most three images.");

// Document validation only. Update operators must use guarded transactional writes
// in Day 6; Mongoose update validators do not enforce cross-field invariants.
donationSchema.pre("validate", function () {
    if (!storedDetailsValid(this.equipment, this.details)) this.invalidate("details", "Equipment details must match the selected category and permitted values.");
    try { quantityAccounting(this); }
    catch (error) { this.invalidate("quantity", error.message); }
});

export const Donation = mongoose.model("donations", donationSchema);
