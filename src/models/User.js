import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254, unique: true, index: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ["donor", "ngo", "admin"], default: "donor", index: true },
    status: { type: String, enum: ["active", "suspended", "deleted"], default: "active", index: true },
    emailVerifiedAt: { type: Date, default: null },
    authVersion: { type: Number, default: 0, min: 0 },
    resetCredential: { type: mongoose.Schema.Types.Mixed, select: false },
    verificationCredential: { type: mongoose.Schema.Types.Mixed, select: false },
    notificationEmailEnabled: { type: Boolean, default: false },
    lastLoginAt: { type: Date, default: null }
}, { timestamps: true });

userSchema.set("toJSON", {
    transform(document, result) {
        delete result.password;
        delete result.resetCredential;
        delete result.verificationCredential;
        delete result.__v;
        return result;
    }
});

export const User = mongoose.model("users", userSchema);
