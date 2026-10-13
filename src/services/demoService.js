import mongoose from "mongoose";
import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { Organization } from "../models/Organization.js";
import { Donation } from "../models/Donation.js";
import { DonationRequest } from "../models/DonationRequest.js";
import { LifecycleEvent } from "../models/LifecycleEvent.js";
import { Notification } from "../models/Notification.js";
import { AuditLog } from "../models/AuditLog.js";
import { AdminAccessRequest } from "../models/AdminAccessRequest.js";
import { initializePrivateStorage, writePrivateMedia } from "./privateStorageService.js";
import { initializeSecurityStores } from "./securityStoreService.js";
import { initializeDiagnostics } from "./diagnosticsService.js";
import { assertRecoveryReleased } from "./recoveryGuardService.js";
import { assertDemoDatabase } from "./demoGuardService.js";

export const DEMO_IDS = Object.freeze({ donor: "250000000000000000000001", ngo: "250000000000000000000002", organization: "250000000000000000000003", donation: "250000000000000000000004" });
export const DEMO_WRITE_LIMIT = 200;
const models = [User, Organization, Donation, DonationRequest, LifecycleEvent, Notification, AuditLog, AdminAccessRequest];
const records = models.map(model => model.collection.name);
const referenceName = "synthetic-demo-evidence.pdf";

// Small authored PDF: synthetic evidence, never a real organization document.
const evidencePdf = () => {
    const content = "BT /F1 16 Tf 40 100 Td (SYNTHETIC DEMO ONLY. No organization verification.) Tj ET";
    const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 640 160] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
    let pdf = "%PDF-1.4\n"; const offsets = [0];
    objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
    const xref = Buffer.byteLength(pdf);
    pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(pdf);
};

export const prepareDemo = async (connection, { reset = false, confirmation } = {}) => {
    if (!env.demoMode || connection.name !== env.mongoDbName || confirmation !== connection.name) throw new Error("Demo preparation requires DEMO_MODE and exact database-name confirmation.");
    await assertRecoveryReleased(connection);
    let marker;
    if (!reset) {
        // Refuse even an empty pre-existing collection: never adopt an existing database.
        if (await connection.db.listCollections({}, { nameOnly: true }).hasNext()) throw new Error("Demo initialization requires a fresh database with no collections.");
        await connection.db.collection("demo_control").insertOne({ _id: "isolated-demo-v1", database: connection.name, state: "maintenance", generation: 0 });
        marker = await assertDemoDatabase(connection, { ready: false });
    } else {
        marker = await assertDemoDatabase(connection, { ready: false });
        if (await connection.db.collection("operational_workers").findOne({ status: { $ne: "stopped" }, heartbeatAt: { $gte: new Date(Date.now() - 45000) } })) throw new Error("Stop all application workers before resetting demo activity.");
        if (await User.exists({ _id: { $nin: [DEMO_IDS.donor, DEMO_IDS.ngo] } })) throw new Error("Reset refused: unexpected accounts exist.");
        if (await Donation.exists({ donor: { $ne: DEMO_IDS.donor } }) || await Organization.exists({ owner: { $ne: DEMO_IDS.ngo } })) throw new Error("Reset refused: unexpected record ownership.");
        if (await DonationRequest.exists({ $or: [{ requestedBy: { $ne: DEMO_IDS.ngo } }, { organization: { $ne: DEMO_IDS.organization } }] })) throw new Error("Reset refused: unexpected request ownership.");
        const allowed = new Set([...records, "demo_control", "demo_budgets", "security_sessions", "security_limits", "operational_workers", "private_media.files", "private_media.chunks", "private_media_uploads"]);
        const collections = await connection.db.listCollections({}, { nameOnly: true }).toArray();
        if (collections.some(collection => !allowed.has(collection.name))) throw new Error("Reset refused: unexpected collections exist.");
        if (await connection.db.collection("private_media.files").findOne({ _id: { $ne: `verification-documents/${referenceName}` } })) throw new Error("Reset refused: unexpected private media exists.");
        await connection.db.collection("demo_control").updateOne({ _id: marker._id }, { $set: { state: "maintenance" } });
    }
    // Creating only declared indexes avoids syncIndexes/dropIndex behavior.
    for (const model of models) await model.createIndexes();
    await initializePrivateStorage(connection); await initializeSecurityStores(connection); await initializeDiagnostics(connection);
    const bytes = evidencePdf();
    const document = await writePrivateMedia("verification-documents", { filename: referenceName, originalName: "Synthetic demo evidence.pdf", mimeType: "application/pdf", size: bytes.length }, bytes);
    const generation = marker.generation + 1;
    const passwords = await Promise.all([0, 1].map(() => bcrypt.hash(randomBytes(48).toString("hex"), 12)));
    const session = await connection.startSession();
    try {
        await session.withTransaction(async () => {
            // Operator must stop all writers first. Retain indexes and abuse buckets.
            for (const name of [...records, "demo_budgets", "security_sessions", "operational_workers"]) await connection.db.collection(name).deleteMany({}, { session });
            const users = await User.create([
                { _id: DEMO_IDS.donor, name: "Synthetic Demo Donor", email: "donor@demo.example.invalid", role: "donor", password: passwords[0], emailVerifiedAt: new Date(), authVersion: generation },
                { _id: DEMO_IDS.ngo, name: "Synthetic Demo NGO Member", email: "ngo@demo.example.invalid", role: "ngo", password: passwords[1], emailVerifiedAt: new Date(), authVersion: generation }
            ], { session });
            await Organization.create([{ _id: DEMO_IDS.organization, owner: users[1]._id, name: "Synthetic Demo NGO", contactEmail: users[1].email, contactPerson: users[1].name, description: "Synthetic organization for the portfolio demonstration. No real organization has been verified.", verificationStatus: "verified", verifiedAt: new Date(), verificationDocument: document, address: { city: "Demo City", state: "Demo State", postalCode: "000000" } }], { session });
            await Donation.create([{ _id: DEMO_IDS.donation, donor: users[0]._id, equipment: "wheelchair", condition: "good", quantity: 3, description: "Synthetic demo listing. These three wheelchairs are fictional and unavailable for real donation.", location: { city: "Demo City", state: "Demo State", postalCode: "000000" } }], { session });
            await connection.db.collection("demo_budgets").insertMany(users.map(user => ({ _id: user.id, used: 0 })), { session });
            const released = await connection.db.collection("demo_control").updateOne({ _id: marker._id, generation: marker.generation, state: "maintenance" }, { $set: { state: "ready", generation, resetAt: new Date() } }, { session });
            if (released.modifiedCount !== 1) throw new Error("Another demo maintenance operation changed the generation.");
        }, { writeConcern: { w: "majority" }, readConcern: { level: "snapshot" } });
    } finally { await session.endSession(); }
    return { generation };
};

export const consumeDemoBudget = async userId => {
    const result = await mongoose.connection.db.collection("demo_budgets").updateOne({ _id: userId, used: { $lt: DEMO_WRITE_LIMIT } }, { $inc: { used: 1 } }, { writeConcern: { w: "majority", wtimeout: 5000 } });
    return result.modifiedCount === 1;
};
