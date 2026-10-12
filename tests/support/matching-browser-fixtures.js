import bcrypt from "bcrypt";
import mongoose from "mongoose";
import { User } from "../../src/models/User.js";
import { Organization } from "../../src/models/Organization.js";
import { Donation } from "../../src/models/Donation.js";
import { DonationRequest } from "../../src/models/DonationRequest.js";

// Called only by the owned, isolated browser server. No production route seeds data.
export const seedMatchingBrowserFixtures = async () => {
    await Promise.all([User.init(), Organization.init(), Donation.init(), DonationRequest.init()]);
    const password = await bcrypt.hash("Matching-fixture-42!", 10);
    for (const project of ["desktop", "mobile"]) {
        const donor = await User.create({ name: "Synthetic Matching Donor", email: `donor-day6-${project}@example.invalid`, password, role: "donor" });
        const ngo = await User.create({ name: "Synthetic Matching NGO", email: `ngo-day6-${project}@example.invalid`, password, role: "ngo" });
        const firstOwner = await User.create({ name: "Synthetic First NGO", email: `first-day6-${project}@example.invalid`, password, role: "ngo" });
        const first = new mongoose.Types.ObjectId();
        await Organization.collection.insertMany([
            { owner: ngo._id, name: "Synthetic Viewing Organization", verificationStatus: "verified", contactEmail: `ngo-day6-${project}@example.invalid`, address: { city: "Pune" } },
            { _id: first, owner: firstOwner._id, name: "Synthetic First Organization", verificationStatus: "verified", contactEmail: `first-day6-${project}@example.invalid`, address: { city: "Pune" } }
        ]);
        const donation = await Donation.create({ donor: donor._id, equipment: "wheelchair", condition: "good", quantity: 5,
            description: "Synthetic Day 6 browser fixture", location: { city: `Day6 ${project}`, state: "Maharashtra" } });
        await DonationRequest.create({ donation: donation._id, organization: first, requestedBy: firstOwner._id, quantity: 2,
            beneficiary: "Synthetic community beneficiary summary", message: "Synthetic equipment need for browser verification" });
        await Donation.create({ donor: donor._id, equipment: "walker", condition: "good", quantity: 5,
            description: "Synthetic Day 7 retry and withdrawal fixture", location: { city: `Day7 ${project}`, state: "Maharashtra" } });
    }
};
