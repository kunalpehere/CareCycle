import { Donation } from "../models/Donation.js";
import { DonationRequest } from "../models/DonationRequest.js";
import { OPEN_LISTING_STATUSES } from "./availabilityService.js";
import { quantityAccounting } from "./quantityContract.js";
import { runTransaction } from "./transactionService.js";
import { recordRequestEvent } from "./notificationService.js";

export const resolvePendingRequests = async ({ donationId, available, withdrawn = false, actor, session, RequestModel = DonationRequest }) => {
    const filter = { donation: donationId, status: "pending" };
    if (!withdrawn) filter.quantity = { $gt: available };
    const affected = await RequestModel.find(filter).session(session).lean();
    const result = await RequestModel.updateMany(filter, { $set: { status: "cancelled", respondedAt: new Date(), respondedBy: actor,
        resolutionReason: withdrawn ? "listing_withdrawn" : "availability_changed",
        responseNote: withdrawn ? "The donor withdrew this listing." : "The remaining quantity is lower than this request. You may submit a smaller new request if stock remains." } }, { session });
    for (const request of affected) await recordRequestEvent({ request, kind: "request_cancelled", key: "cancelled", session });
    return result;
};

export const changeListing = async ({ donationId, donorId, expectedVersion, action, value = {}, images }) => runTransaction(Donation.db, async session => {
    const listing = await Donation.findOne({ _id: donationId, donor: donorId }).session(session).lean();
    if (!listing) return { changed: false, reason: "ownership" };
    if (!OPEN_LISTING_STATUSES.includes(listing.status) || expectedVersion === null || expectedVersion !== (listing.__v ?? 0)) return { changed: false, reason: "stale" };
    const accounting = quantityAccounting(listing);
    let update;
    if (action === "withdraw") {
        if (accounting.reserved > 0 || await DonationRequest.exists({ donation: donationId, status: "accepted" }).session(session)) return { changed: false, reason: "commitment" };
        update = { status: "withdrawn" };
    } else if (action === "quantity") {
        if (!Number.isSafeInteger(value.quantity) || value.quantity < Math.max(1, accounting.allocated) || value.quantity > 100) return { changed: false, reason: "quantity" };
        update = { quantity: value.quantity };
    } else if (action === "edit") {
        const pending = await DonationRequest.exists({ donation: donationId, status: "pending" }).session(session);
        if (pending || accounting.allocated > 0) return { changed: false, reason: "details_locked" };
        quantityAccounting({ ...listing, ...value });
        update = { ...value, images };
    } else throw new Error("Unknown listing action.");
    // All creation/acceptance/listing changes touch this document, serializing
    // pending request reconciliation and preventing phantom concurrent requests.
    const updated = await Donation.findOneAndUpdate({ _id: donationId, donor: donorId, __v: listing.__v },
        { $set: update, $inc: { __v: 1 } }, { new: true, session, runValidators: true });
    if (!updated) throw new Error("Listing version changed during transaction.");
    const resolved = await resolvePendingRequests({ donationId, available: quantityAccounting(updated).available,
        withdrawn: action === "withdraw", actor: donorId, session });
    return { changed: true, donation: updated, resolved: resolved.modifiedCount };
});
