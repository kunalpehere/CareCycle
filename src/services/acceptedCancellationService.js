import { Donation } from "../models/Donation.js";
import { DonationRequest } from "../models/DonationRequest.js";
import { runTransaction } from "./transactionService.js";
import { quantityAccounting } from "./quantityContract.js";
import { noRecordedHandover, pickupVersionFilter, validatePickupReason } from "./pickupService.js";
import { reconciledListing } from "./fulfillmentAccounting.js";

class CancellationConflict extends Error {}

export const cancelAcceptedRequest = async ({ requestId, version, actorId, actorRole, organizationId, reason, noHandover, now = new Date() }) => {
    if (version === null || !["donor", "ngo"].includes(actorRole) || !noHandover || !validatePickupReason({ reason })) return false;
    try {
        return await runTransaction(Donation.db, async session => {
            const request = await DonationRequest.findById(requestId).session(session).lean();
            if (!request || request.status !== "accepted" || (request.handedOverQuantity || 0) !== 0 || (request.pickup?.version || 0) !== version || request.pickup?.missedReport?.disputed || (request.pickup && !["proposed", "confirmed", "missed", "acknowledged"].includes(request.pickup.status))) return false;
            if (actorRole === "ngo" && String(request.organization) !== String(organizationId)) return false;
            const listing = await Donation.findOne({ _id: request.donation, ...(actorRole === "donor" ? { donor: actorId } : {}) }).session(session).lean();
            if (!listing || !["available", "requested", "matched", "pickup_scheduled"].includes(listing.status)) return false;
            const accounting = quantityAccounting(listing);
            if ((accounting.handedOver !== 0 && !await reconciledListing(listing, session, DonationRequest)) || !Number.isSafeInteger(request.quantity) || request.quantity < 1 || accounting.reserved < request.quantity) return false;
            const event = { action: "cancelled", actor: actorId, actorRole, at: now, version: version + 1, proposal: request.pickup?.proposal || null, reason: reason.trim(), releasedQuantity: request.quantity };
            const pickupUpdate = request.pickup ? { $set: { "pickup.status": "cancelled", "pickup.version": version + 1 }, $push: { "pickup.history": event } } : { $set: { pickup: { status: "cancelled", version: 1, proposal: null, history: [event] } } };
            const cancelled = await DonationRequest.findOneAndUpdate({ _id: request._id, status: "accepted", ...pickupVersionFilter(version), ...noRecordedHandover() }, {
                ...pickupUpdate, $set: { ...pickupUpdate.$set, status: "cancelled", resolutionReason: actorRole === "donor" ? "donor_cancelled_after_acceptance" : "organization_cancelled_after_acceptance",
                releasedQuantity: request.quantity, cancellation: { actor: actorId, actorRole, at: now, reason: reason.trim(), releasedQuantity: request.quantity } }
            }, { new: true, runValidators: true, session });
            if (!cancelled) throw new CancellationConflict();
            const released = await Donation.findOneAndUpdate({ _id: listing._id, allocatedQuantity: accounting.allocated, ...(accounting.handedOver === 0 ? noRecordedHandover() : { handedOverQuantity: listing.handedOverQuantity }), status: listing.status }, {
                $inc: { allocatedQuantity: -request.quantity, __v: 1 }, $set: { status: "available" }
            }, { new: true, session });
            if (!released) throw new CancellationConflict();
            quantityAccounting(released);
            return true;
        });
    } catch (error) { if (error instanceof CancellationConflict) return false; throw error; }
};
