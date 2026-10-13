import { writeFile } from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcrypt";
import { User } from "../../src/models/User.js";
import { Organization } from "../../src/models/Organization.js";
import { Donation } from "../../src/models/Donation.js";
import { DonationRequest } from "../../src/models/DonationRequest.js";
import { saveVerificationDocument } from "../../src/services/verificationDocumentService.js";
export const seedAdminReviewFixtures = async root => {
    const manifest = {}, password = await bcrypt.hash("Review-fixture-20!", 10);
    const bytes = Buffer.from("%PDF-1.4\nSYNTHETIC_REVIEW20_BROWSER\n%%EOF");
    const document = await saveVerificationDocument({ buffer: bytes, size: bytes.length, mimetype: "application/pdf", originalname: "synthetic20.pdf" });
    for (const project of ["desktop", "mobile"]) {
        const users = {};
        for (const role of ["donor", "ngo", "admin"]) users[role] = await User.create({ name: `Synthetic Review20 ${role} ${project}`, email: `${role}-day20-${project}@example.invalid`, password, role, emailVerifiedAt: new Date() });
        const org = await Organization.create({ owner: users.ngo._id, name: `Synthetic Review20 NGO ${project}`, contactEmail: users.ngo.email, contactPerson: "Synthetic Coordinator", description: "Synthetic organization for administrative review only", verificationDocument: document });
        const listing = await Donation.create({ donor: users.donor._id, equipment: "walker", condition: "good", quantity: 5, allocatedQuantity: 2, description: "Synthetic moderation browser listing", location: { city: "Review20" } });
        const request = await DonationRequest.create({ donation: listing._id, organization: org._id, requestedBy: users.ngo._id, quantity: 2, status: "accepted", beneficiary: "PRIVATE_REVIEW20_BROWSER_BENEFICIARY", message: "PRIVATE_REVIEW20_BROWSER_NEED_STATEMENT" });
        manifest[project] = { adminEmail: users.admin.email, donor: users.donor.id, listing: listing.id, request: request.id, organization: org.id };
    }
    await writeFile(path.join(root, "artifacts/day-20-fixtures.json"), JSON.stringify(manifest));
};
