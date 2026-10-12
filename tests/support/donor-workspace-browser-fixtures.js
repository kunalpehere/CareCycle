import bcrypt from "bcrypt";
import { User } from "../../src/models/User.js";
import { Organization } from "../../src/models/Organization.js";
import { Donation } from "../../src/models/Donation.js";
import { DonationRequest } from "../../src/models/DonationRequest.js";

export const seedDonorWorkspaceBrowserFixtures = async () => {
    const password = await bcrypt.hash("Workspace-fixture-42!", 10);
    for (const project of ["desktop", "mobile"]) {
        await User.create({ name: "Synthetic Equipment Detail Donor", email: `donor-day17-${project}@example.invalid`, password, role: "donor" });
        const donor = await User.create({ name: "Synthetic Workspace Donor", email: `donor-day15-${project}@example.invalid`, password, role: "donor" });
        await User.create({ name: "Synthetic Empty Donor", email: `empty-day15-${project}@example.invalid`, password, role: "donor" });
        const member = await User.create({ name: "Synthetic Workspace NGO", email: `ngo-day15-${project}@example.invalid`, password, role: "ngo" });
        const org = { _id: new User.base.Types.ObjectId() };
        await Organization.collection.insertOne({ _id: org._id, owner: member._id, name: "Synthetic Workspace Organization", verificationStatus: "verified", contactEmail: member.email, address: { city: "Pune", state: "Maharashtra" } });
        const at = new Date("2026-01-01T10:00Z"), acknowledgedAt = new Date("2026-01-01T11:00Z");
        for (let i = 0; i < 14; i++) {
            const waiting = i === 9, missed = i === 10, completed = i === 11, withdrawn = i === 12;
            const donation = await Donation.create({ donor: donor._id, equipment: i % 2 ? "wheelchair" : "walker", condition: "good", quantity: completed ? 1 : 5,
                allocatedQuantity: completed ? 1 : waiting || missed ? 2 : 0, handedOverQuantity: waiting || completed ? 1 : 0,
                status: completed ? "completed" : withdrawn ? "withdrawn" : "available", description: `Synthetic workspace listing ${i + 1}`, location: { city: "Pune", state: "Maharashtra" }, createdAt: new Date(at.getTime() - 86400000 + i * 1000) });
            if (i === 13) continue;
            const transfer = { declaredQuantity: 1, quantity: 1, donor: donor._id, at, status: completed ? "acknowledged" : "awaiting_acknowledgement", checklist: { equipmentMatches: true, conditionReviewed: true, accessoriesExplained: true }, ...(completed ? { receivedQuantity: 1, acknowledgedBy: member._id, acknowledgedAt } : {}) };
            const proposal = { start: at, end: acknowledgedAt, timeZone: "UTC", localStart: "2026-01-01T10:00", localEnd: "2026-01-01T11:00", address: "PRIVATE_WORKSPACE_BROWSER_ADDRESS", proposedBy: donor._id, proposerRole: "donor" };
            await DonationRequest.create({ donation: donation._id, organization: org._id, requestedBy: member._id, quantity: completed ? 1 : 2,
                status: completed ? "completed" : waiting || missed ? "accepted" : withdrawn ? "cancelled" : "pending",
                handedOverQuantity: waiting || completed ? 1 : 0, acknowledgedQuantity: completed ? 1 : 0,
                fulfillment: waiting || completed ? { transfers: [transfer], ...(completed ? { completedAt: acknowledgedAt } : {}) } : null,
                pickup: missed ? { status: "missed", version: 3, proposal, missedReport: { actor: donor._id, actorRole: "donor", at: acknowledgedAt, reason: "Synthetic missed collection", disputed: false }, history: [{ action: "missed", actor: donor._id, actorRole: "donor", at: acknowledgedAt, version: 3, proposal }] } : null,
                createdAt: new Date(at.getTime() - 86400000 + i * 1000), respondedAt: waiting || missed || completed ? at : null,
                beneficiary: "PRIVATE_WORKSPACE_BROWSER_BENEFICIARY", message: "PRIVATE_WORKSPACE_BROWSER_NEED" });
        }
    }
};
