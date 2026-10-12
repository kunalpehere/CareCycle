import mongoose from "mongoose";

const actor = { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true };
export const checklistSchema = new mongoose.Schema({
    equipmentMatches: { type: Boolean, required: true },
    conditionReviewed: { type: Boolean, required: true },
    accessoriesExplained: { type: Boolean, required: true }
}, { _id: false });

const transferSchema = new mongoose.Schema({
    declaredQuantity: { type: Number, required: true, min: 1, max: 100 },
    quantity: { type: Number, required: true, min: 0, max: 100 },
    donor: actor, at: { type: Date, required: true },
    checklist: { type: checklistSchema, required: true },
    notes: { type: String, maxlength: 500, default: "" },
    status: { type: String, enum: ["awaiting_acknowledgement", "disputed", "acknowledged"], required: true },
    receivedQuantity: { type: Number, min: 0, max: 100, default: null },
    receiptNotes: { type: String, maxlength: 500, default: "" },
    acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    acknowledgedAt: { type: Date, default: null },
    resolution: { type: new mongoose.Schema({
        quantity: { type: Number, min: 0, max: 100, required: true },
        reason: { type: String, minlength: 10, maxlength: 500, required: true },
        actor, at: { type: Date, required: true }
    }, { _id: false }), default: null }
});

export const fulfillmentSchema = new mongoose.Schema({
    transfers: { type: [transferSchema], default: [] },
    remainderProposal: { type: new mongoose.Schema({
        actor, actorRole: { type: String, enum: ["donor", "ngo"], required: true },
        at: { type: Date, required: true },
        quantity: { type: Number, min: 1, max: 100, required: true },
        reason: { type: String, minlength: 10, maxlength: 500, required: true }
    }, { _id: false }), default: null },
    completedAt: { type: Date, default: null }
}, { _id: false });
