import { Donation } from "../models/Donation.js";
import { DonationRequest } from "../models/DonationRequest.js";

export const buildCapacityReservationQuery = (request, donorId) => ({
    _id: request.donation,
    donor: donorId,
    status: { $in: ["available", "requested", "matched"] },
    $expr: { $lte: [{ $add: [{ $ifNull: ["$allocatedQuantity", 0] }, request.quantity] }, "$quantity"] }
});

export const reserveRequestCapacity = async ({ request, donorId }) => Donation.findOneAndUpdate(buildCapacityReservationQuery(request, donorId), {
    $inc: { allocatedQuantity: request.quantity },
    $set: { status: "matched" }
}, { new: true });

export const releaseRequestCapacity = async ({ donationId, quantity }) => Donation.updateOne(
    { _id: donationId, allocatedQuantity: { $gte: quantity } },
    { $inc: { allocatedQuantity: -quantity } }
);

export const acceptPendingRequest = async ({ request, donorId, responseNote = "", respondedBy }) => {
    const donation = await reserveRequestCapacity({ request, donorId });
    if (!donation) return { accepted: false, reason: "capacity" };
    try {
        const acceptedRequest = await DonationRequest.findOneAndUpdate(
            { _id: request._id, status: "pending" },
            { $set: { status: "accepted", responseNote, respondedAt: new Date(), respondedBy } },
            { new: true }
        );
        if (!acceptedRequest) {
            await releaseRequestCapacity({ donationId: request.donation, quantity: request.quantity });
            return { accepted: false, reason: "already_decided" };
        }
        return { accepted: true, donation, request: acceptedRequest };
    } catch (error) {
        await releaseRequestCapacity({ donationId: request.donation, quantity: request.quantity });
        throw error;
    }
};
