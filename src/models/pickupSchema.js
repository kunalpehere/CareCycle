import mongoose from "mongoose";

const proposalSchema = new mongoose.Schema({
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    timeZone: { type: String, required: true, maxlength: 100 },
    localStart: { type: String, required: true },
    localEnd: { type: String, required: true },
    address: { type: String, required: true, trim: true, maxlength: 500 },
    instructions: { type: String, trim: true, maxlength: 1000, default: "" },
    proposedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    proposerRole: { type: String, enum: ["donor", "ngo"], required: true }
}, { _id: false });

const eventSchema = new mongoose.Schema({
    action: { type: String, enum: ["proposed", "rescheduled", "confirmed", "missed", "disputed", "resolved", "cancelled", "handed_over", "acknowledged", "receipt_disputed", "resolution_proposed", "receipt_resolved", "remainder_proposed", "remainder_released", "remainder_withdrawn"], required: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    actorRole: { type: String, enum: ["donor", "ngo"], required: true },
    at: { type: Date, required: true },
    version: { type: Number, required: true, min: 1 },
    proposal: { type: proposalSchema, default: null, required: function () { return this.action !== "cancelled"; } },
    reason: { type: String, trim: true, maxlength: 500, default: "" },
    releasedQuantity: { type: Number, min: 0, max: 100, default: 0 },
    transferId: { type: mongoose.Schema.Types.ObjectId, default: null },
    quantity: { type: Number, min: 0, max: 100, default: null },
    receivedQuantity: { type: Number, min: 0, max: 100, default: null },
    checklist: { type: Object, default: null }
}, { _id: false });

// Embedded in the accepted request: plan, version and history change atomically.
export const pickupSchema = new mongoose.Schema({
    status: { type: String, enum: ["proposed", "confirmed", "missed", "cancelled", "handed_over", "acknowledged", "disputed"], required: true },
    version: { type: Number, min: 1, required: true },
    proposal: { type: proposalSchema, default: null, required: function () {
        const status = this.status ?? this.get?.("pickup.status") ?? this.get?.("pickup")?.status;
        return status !== "cancelled";
    } },
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    confirmedAt: { type: Date, default: null },
    missedReport: { type: new mongoose.Schema({
        actor: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
        actorRole: { type: String, enum: ["donor", "ngo"], required: true },
        at: { type: Date, required: true },
        reason: { type: String, required: true, maxlength: 500 },
        disputed: { type: Boolean, default: false },
        disputedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null }
    }, { _id: false }), default: null },
    history: { type: [eventSchema], default: [] }
}, { _id: false });
