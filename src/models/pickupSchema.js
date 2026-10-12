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
    action: { type: String, enum: ["proposed", "rescheduled", "confirmed"], required: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    actorRole: { type: String, enum: ["donor", "ngo"], required: true },
    at: { type: Date, required: true },
    version: { type: Number, required: true, min: 1 },
    proposal: { type: proposalSchema, required: true }
}, { _id: false });

// Embedded in the accepted request: plan, version and history change atomically.
export const pickupSchema = new mongoose.Schema({
    status: { type: String, enum: ["proposed", "confirmed"], required: true },
    version: { type: Number, min: 1, required: true },
    proposal: { type: proposalSchema, required: true },
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    confirmedAt: { type: Date, default: null },
    history: { type: [eventSchema], default: [] }
}, { _id: false });
