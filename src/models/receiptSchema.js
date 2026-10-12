import mongoose from "mongoose";

const amendmentSchema = new mongoose.Schema({
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    actorRole: { type: String, enum: ["donor", "ngo"], required: true },
    at: { type: Date, required: true },
    donorName: { type: String, minlength: 2, maxlength: 80, required: true },
    organizationName: { type: String, minlength: 2, maxlength: 150, required: true },
    reason: { type: String, minlength: 10, maxlength: 500, required: true }
}, { _id: false });
const revisionSchema = new mongoose.Schema({
    number: { type: Number, min: 1, required: true },
    at: { type: Date, required: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    actorRole: { type: String, enum: ["donor", "ngo"], required: true },
    reason: { type: String, required: true, maxlength: 500 },
    amendmentEvidence: { type: mongoose.Schema.Types.Mixed, default: null },
    snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    html: { type: String, required: true }
}, { _id: false });
export const receiptSchema = new mongoose.Schema({
    reference: { type: String, required: true },
    donorId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    version: { type: Number, min: 1, required: true },
    revisions: { type: [revisionSchema], default: [] },
    amendment: { type: amendmentSchema, default: null },
    events: { type: [new mongoose.Schema({
        action: { type: String, enum: ["issued", "outcome_updated", "amendment_proposed", "amendment_confirmed", "amendment_withdrawn"], required: true },
        actor: { type: mongoose.Schema.Types.ObjectId, required: true },
        actorRole: { type: String, enum: ["donor", "ngo"], required: true },
        at: { type: Date, required: true },
        reason: { type: String, required: true, maxlength: 500 }
    }, { _id: false })], default: [] }
}, { _id: false });
