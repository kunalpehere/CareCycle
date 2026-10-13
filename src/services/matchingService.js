import { Donation } from "../models/Donation.js";
import { DonationRequest } from "../models/DonationRequest.js";
import { availableListingQuery } from "./availabilityService.js";
import { quantityAccounting } from "./quantityContract.js";
import { runTransaction } from "./transactionService.js";
import { resolvePendingRequests } from "./listingPolicyService.js";
import { BLOCKING_REQUEST_STATUSES } from "./requestPolicy.js";
import { recordRequestEvent } from "./notificationService.js";
import { guardActiveActor } from "./workflowActorService.js";

export const buildCapacityReservationQuery = (request, donorId) => ({
    _id: request.donation,
    donor: donorId,
    ...availableListingQuery(request.quantity)
});

class DecisionConflict extends Error {}

export const createMatchingService = ({ DonationModel = Donation, RequestModel = DonationRequest } = {}) => {
    const transact = operation => runTransaction(DonationModel.db, operation);
    const acceptPendingRequest = async ({ request, donorId, responseNote = "", respondedBy }) => {
        try {
            return await transact(async session => {
                // Never trust a caller's stale quantity or donation reference.
                const current = await RequestModel.findById(request._id).session(session).lean();
                if (!current || current.status !== "pending") return { accepted: false, reason: "already_decided" };
                if (!Number.isSafeInteger(current.quantity) || current.quantity < 1 || current.quantity > 100) return { accepted: false, reason: "capacity" };
                const listing = await DonationModel.findOne({ _id: current.donation, donor: donorId }).session(session).lean();
                if (!listing) return { accepted: false, reason: "ownership" };
                if (!await guardActiveActor(donorId, session, "donor") || !await guardActiveActor(current.requestedBy, session, "ngo")) return { accepted: false, reason: "unavailable" };
                quantityAccounting(listing);
                const donation = await DonationModel.findOneAndUpdate(buildCapacityReservationQuery(current, donorId), {
                    $inc: { allocatedQuantity: current.quantity, __v: 1 }, $set: { status: "available" }
                }, { new: true, session });
                if (!donation) return { accepted: false, reason: "capacity" };
                const acceptedRequest = await RequestModel.findOneAndUpdate({ _id: current._id, status: "pending" }, {
                    $set: { status: "accepted", responseNote, respondedAt: new Date(), respondedBy }
                }, { new: true, session, runValidators: true });
                if (!acceptedRequest) throw new DecisionConflict();
                await resolvePendingRequests({ donationId: donation._id, available: quantityAccounting(donation).available,
                    actor: donorId, session, RequestModel });
                await recordRequestEvent({ request: acceptedRequest, kind: "request_accepted", key: "accepted", session });
                return { accepted: true, donation, request: acceptedRequest };
            });
        } catch (error) {
            if (error instanceof DecisionConflict) return { accepted: false, reason: "already_decided" };
            throw error;
        }
    };
    const createPendingRequest = async data => transact(async session => {
        if (!await guardActiveActor(data.requestedBy, session, "ngo")) return null;
        const donor = await DonationModel.findById(data.donation).select("donor").session(session).lean();
        if (!donor || !await guardActiveActor(donor.donor, session, "donor")) return null;
        const blocking = await RequestModel.exists({ donation: data.donation, organization: data.organization, status: { $in: BLOCKING_REQUEST_STATUSES } }).session(session);
        if (blocking) { const error = new Error("Your organization already has a current request for this listing."); error.code = 11000; throw error; }
        // A version touch serializes creation with allocation without reserving stock.
        const listing = await DonationModel.findOneAndUpdate({ _id: data.donation, ...availableListingQuery(data.quantity) },
            { $inc: { __v: 1 } }, { new: true, session });
        if (!listing) return null;
        quantityAccounting(listing);
        const [request] = await RequestModel.create([{ ...data, listingSnapshot: { equipment: listing.equipment, condition: listing.condition,
            totalQuantity: listing.quantity, location: listing.location } }], { session });
        await recordRequestEvent({ request, kind: "request_submitted", key: "submitted", session });
        return request;
    });
    return { acceptPendingRequest, createPendingRequest };
};

export const { acceptPendingRequest, createPendingRequest } = createMatchingService();
