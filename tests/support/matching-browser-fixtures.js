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
        const transferDonor = await User.create({ name: "Synthetic Transfer Donor", email: `donor-day11-${project}@example.invalid`, password, role: "donor" });
        const transferNgo = await User.create({ name: "Synthetic Transfer NGO", email: `ngo-day11-${project}@example.invalid`, password, role: "ngo" });
        const transferOrg = new mongoose.Types.ObjectId();
        await Organization.collection.insertOne({ _id: transferOrg, owner: transferNgo._id, name: "Synthetic Transfer Organization", verificationStatus: "verified", contactEmail: transferNgo.email, address: { city: "Pune" } });
        for (const [equipment, quantity] of [["wheelchair", 5], ["stethoscope", 2]]) {
            const transferListing = await Donation.create({ donor: transferDonor._id, equipment, condition: "good", quantity, allocatedQuantity: 2, description: "Synthetic Day 11 transfer fixture", location: { city: `Day11 ${project}`, state: "Maharashtra" } });
            const transferProposal = { ...pastProposal, proposedBy: transferDonor._id };
            await DonationRequest.create({ donation: transferListing._id, organization: transferOrg, requestedBy: transferNgo._id, quantity: 2, status: "accepted", beneficiary: `Synthetic ${equipment} transfer beneficiaries`, message: "Synthetic physical transfer verification", pickup: { status: "confirmed", version: 2, proposal: transferProposal, confirmedBy: transferNgo._id, confirmedAt: new Date("1999-12-31"), history: [{ action: "confirmed", actor: transferNgo._id, actorRole: "ngo", at: new Date("1999-12-31"), version: 2, proposal: transferProposal }] } });
        }
        const receiptDonor = await User.create({ name: "Synthetic Receipt Donor", email: `donor-day12-${project}@example.invalid`, password, role: "donor" });
        const receiptNgo = await User.create({ name: "Synthetic Receipt NGO", email: `ngo-day12-${project}@example.invalid`, password, role: "ngo" });
        const receiptOrg = new mongoose.Types.ObjectId();
        await Organization.collection.insertOne({ _id: receiptOrg, owner: receiptNgo._id, name: "Synthetic Receipt Organization", verificationStatus: "verified", contactEmail: receiptNgo.email, address: { city: "Pune" } });
        const receiptListing = await Donation.create({ donor: receiptDonor._id, equipment: "walker", condition: "good", quantity: 5, allocatedQuantity: 1, handedOverQuantity: 1, description: "Synthetic Day 12 receipt fixture", location: { city: `Day12 ${project}`, state: "Maharashtra" } });
        const receiptAt = new Date("2026-01-01T10:00Z"), receiptAck = new Date("2026-01-01T11:00Z");
        const receiptProposal = { ...pastProposal, proposedBy: receiptDonor._id };
        await DonationRequest.create({ donation: receiptListing._id, organization: receiptOrg, requestedBy: receiptNgo._id, quantity: 2, status: "completed", handedOverQuantity: 1, acknowledgedQuantity: 1, releasedQuantity: 1, beneficiary: "PRIVATE_SYNTHETIC_BENEFICIARY", message: "PRIVATE_SYNTHETIC_REQUEST_NEED", fulfillment: { completedAt: receiptAck, transfers: [{ declaredQuantity: 2, quantity: 1, donor: receiptDonor._id, at: receiptAt, checklist: { equipmentMatches: true, conditionReviewed: true, accessoriesExplained: true }, notes: "PRIVATE_SYNTHETIC_COORDINATION", status: "acknowledged", receivedQuantity: 1, acknowledgedBy: receiptNgo._id, acknowledgedAt: receiptAck }] }, pickup: { status: "acknowledged", version: 6, proposal: receiptProposal, history: [{ action: "receipt_resolved", actor: receiptNgo._id, actorRole: "ngo", at: receiptAck, version: 5, proposal: receiptProposal, quantity: 1 }, { action: "remainder_released", actor: receiptNgo._id, actorRole: "ngo", at: receiptAck, version: 6, proposal: receiptProposal, releasedQuantity: 1 }] } });
    }
};
