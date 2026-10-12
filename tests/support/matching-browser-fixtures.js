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
        const pickupDonor = await User.create({ name: "Synthetic Pickup Donor", email: `donor-day9-${project}@example.invalid`, password, role: "donor" });
        const pickupNgo = await User.create({ name: "Synthetic Pickup NGO", email: `ngo-day9-${project}@example.invalid`, password, role: "ngo" });
        const pickupOrg = new mongoose.Types.ObjectId();
        await Organization.collection.insertOne({ _id: pickupOrg, owner: pickupNgo._id, name: "Synthetic Pickup Organization", verificationStatus: "verified", contactEmail: pickupNgo.email, address: { city: "Pune" } });
        const pickupListing = await Donation.create({ donor: pickupDonor._id, equipment: "wheelchair", condition: "good", quantity: 5, allocatedQuantity: 2, description: "Synthetic Day 9 pickup fixture", location: { city: `Day9 ${project}`, state: "Maharashtra" } });
        await DonationRequest.create({ donation: pickupListing._id, organization: pickupOrg, requestedBy: pickupNgo._id, quantity: 2, status: "accepted", beneficiary: "Synthetic pickup beneficiaries", message: "Synthetic equipment pickup for browser verification" });
        const changeDonor = await User.create({ name: "Synthetic Collection Donor", email: `donor-day10-${project}@example.invalid`, password, role: "donor" });
        const changeNgo = await User.create({ name: "Synthetic Collection NGO", email: `ngo-day10-${project}@example.invalid`, password, role: "ngo" });
        const changeOrg = new mongoose.Types.ObjectId();
        await Organization.collection.insertOne({ _id: changeOrg, owner: changeNgo._id, name: "Synthetic Collection Organization", verificationStatus: "verified", contactEmail: changeNgo.email, address: { city: "Pune" } });
        const changeListing = await Donation.create({ donor: changeDonor._id, equipment: "walker", condition: "good", quantity: 5, allocatedQuantity: 2, description: "Synthetic Day 10 collection fixture", location: { city: `Day10 ${project}`, state: "Maharashtra" } });
        const pastProposal = { start: new Date("2000-01-01T10:00Z"), end: new Date("2000-01-01T12:00Z"), timeZone: "UTC", localStart: "2000-01-01T10:00", localEnd: "2000-01-01T12:00", address: "12 Synthetic Collection Road", instructions: "Synthetic collection instructions", proposedBy: changeDonor._id, proposerRole: "donor" };
        await DonationRequest.create({ donation: changeListing._id, organization: changeOrg, requestedBy: changeNgo._id, quantity: 2, status: "accepted", beneficiary: "Synthetic Day 10 beneficiaries", message: "Synthetic collection changes verification", pickup: { status: "confirmed", version: 2, proposal: pastProposal, confirmedBy: changeNgo._id, confirmedAt: new Date("1999-12-31"), history: [{ action: "proposed", actor: changeDonor._id, actorRole: "donor", at: new Date("1999-12-30"), version: 1, proposal: pastProposal }, { action: "confirmed", actor: changeNgo._id, actorRole: "ngo", at: new Date("1999-12-31"), version: 2, proposal: pastProposal }] } });
    }
};
