import mongoose from "mongoose";

export const EQUIPMENT_TYPES = ["wheelchair", "walker", "cane", "stethoscope"];
export const EQUIPMENT_CONDITIONS = ["brand-new", "good", "used", "old"];
export const DONATION_STATUSES = ["available", "requested", "matched", "pickup_scheduled", "completed", "withdrawn"];

const donationSchema = new mongoose.Schema({
    donor: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true, index: true },
    equipment: { type: String, enum: EQUIPMENT_TYPES, required: true, index: true },
    condition: { type: String, enum: EQUIPMENT_CONDITIONS, required: true },
    quantity: { type: Number, required: true, min: 1, max: 100, default: 1 },
    allocatedQuantity: { type: Number, min: 0, max: 100, default: 0 },
    description: { type: String, trim: true, maxlength: 1000, default: "" },
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

export const Donation = mongoose.model("donations", donationSchema);
