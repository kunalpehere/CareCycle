import { Donation } from "../models/Donation.js";
import { DonationRequest } from "../models/DonationRequest.js";
import { availableListingQuery } from "./availabilityService.js";
import { quantityAccounting } from "./quantityContract.js";

export const buildCapacityReservationQuery = (request, donorId) => ({
    _id: request.donation,
    donor: donorId,
    ...availableListingQuery(request.quantity)
});

class DecisionConflict extends Error {}

export const createMatchingService = ({ DonationModel = Donation, RequestModel = DonationRequest } = {}) => {
    const transact = async operation => {
        const session = await DonationModel.db.startSession();
        let result;
        try {
            await session.withTransaction(async () => {
                // Driver retries rerun reads and recompute the decision.
                result = await operation(session);
            }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
            return result;
        } finally { await session.endSession(); }
    };
    const acceptPendingRequest = async ({ request, donorId, responseNote = "", respondedBy }) => {
        try {
            return await transact(async session => {
                // Never trust a caller's stale quantity or donation reference.
                const current = await RequestModel.findById(request._id).session(session).lean();
                if (!current || current.status !== "pending") return { accepted: false, reason: "already_decided" };
                if (!Number.isSafeInteger(current.quantity) || current.quantity < 1 || current.quantity > 100) return { accepted: false, reason: "capacity" };
                const listing = await DonationModel.findOne({ _id: current.donation, donor: donorId }).session(session).lean();
                if (!listing) return { accepted: false, reason: "ownership" };
                quantityAccounting(listing);
                const donation = await DonationModel.findOneAndUpdate(buildCapacityReservationQuery(current, donorId), {
                    $inc: { allocatedQuantity: current.quantity, __v: 1 }, $set: { status: "available" }
                }, { new: true, session });
                if (!donation) return { accepted: false, reason: "capacity" };
                const acceptedRequest = await RequestModel.findOneAndUpdate({ _id: current._id, status: "pending" }, {
                    $set: { status: "accepted", responseNote, respondedAt: new Date(), respondedBy }
                }, { new: true, session, runValidators: true });
                if (!acceptedRequest) throw new DecisionConflict();
                return { accepted: true, donation, request: acceptedRequest };
            });
        } catch (error) {
            if (error instanceof DecisionConflict) return { accepted: false, reason: "already_decided" };
            throw error;
        }
    };
    const createPendingRequest = async data => transact(async session => {
        // A version touch serializes creation with allocation without reserving stock.
        const listing = await DonationModel.findOneAndUpdate({ _id: data.donation, ...availableListingQuery(data.quantity) },
            { $inc: { __v: 1 } }, { new: true, session });
        if (!listing) return null;
        quantityAccounting(listing);
        const [request] = await RequestModel.create([data], { session });
        return request;
    });
    return { acceptPendingRequest, createPendingRequest };
};

export const { acceptPendingRequest, createPendingRequest } = createMatchingService();
