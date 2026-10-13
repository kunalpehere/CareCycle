import { guardActiveActor } from "./workflowActorService.js";
import mongoose from "mongoose";
import { Donation } from "../models/Donation.js";
import { DonationRequest } from "../models/DonationRequest.js";
import { runTransaction } from "./transactionService.js";
import { requestAccounting, reconciledListing } from "./fulfillmentAccounting.js";
import { validatePickupReason } from "./pickupService.js";
import { recordRequestEvent } from "./notificationService.js";

export const fulfillmentActions = ["handover", "acknowledge", "receipt-dispute", "resolution-propose", "resolution-confirm", "remainder-propose", "remainder-confirm", "remainder-withdraw"];
export const wholeQuantity = value => typeof value === "string" && /^(0|[1-9]\d*)$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) <= 100 ? Number(value) : null;
export const validateFulfillmentInput = (action, body) => {
    if (!fulfillmentActions.includes(action)) return false;
    if (!["handover", "acknowledge", "receipt-dispute", "resolution-propose", "resolution-confirm"].includes(action) && !validatePickupReason(body)) return false;
    if (["handover", "acknowledge", "receipt-dispute", "resolution-propose", "resolution-confirm"].includes(action) && wholeQuantity(body.quantity) === null) return false;
    if (["receipt-dispute", "resolution-propose", "resolution-confirm"].includes(action) && !validatePickupReason(body)) return false;
    if (body.notes !== undefined && (typeof body.notes !== "string" || body.notes.trim().length > 500)) return false;
    if (action === "handover" && (wholeQuantity(body.quantity) < 1 || !["equipmentMatches", "conditionReviewed", "accessoriesExplained"].every(field => body[field] === "yes"))) return false;
    if (["acknowledge", "resolution-confirm"].includes(action) && body.receiptConfirmed !== "yes") return false;
    if (["remainder-propose", "remainder-confirm"].includes(action) && body.noFurtherHandover !== "yes") return false;
    return true;
};

class FulfillmentConflict extends Error {}
export const changeFulfillment = async ({ requestId, version, actorId, actorRole, organizationId, action, body, now = new Date() }) => {
    if (!fulfillmentActions.includes(action) || version === null || !validateFulfillmentInput(action, body)) return false;
    try {
        return await runTransaction(Donation.db, async session => {
            if (!await guardActiveActor(actorId, session, actorRole)) return false;
            const request = await DonationRequest.findById(requestId).session(session);
            if (!request || request.status !== "accepted" || !request.pickup || request.pickup.version !== version || request.pickup.missedReport?.disputed) return false;
            if (!["donor", "ngo"].includes(actorRole) || (actorRole === "ngo" && String(request.organization) !== String(organizationId))) return false;
            const listing = await Donation.findOne({ _id: request.donation, ...(actorRole === "donor" ? { donor: actorId } : {}) }).session(session).lean();
            if (!listing || !["available", "requested", "matched", "pickup_scheduled"].includes(listing.status) || !await reconciledListing(listing, session, DonationRequest)) return false;
            const amounts = requestAccounting(request);
            if (!request.fulfillment) request.fulfillment = { transfers: [] };
            let transfer, handedDelta = 0, allocatedDelta = 0, eventAction, eventQuantity = null;
            const quantity = wholeQuantity(body.quantity), reason = typeof body.reason === "string" ? body.reason.trim() : "";
            if (["acknowledge", "receipt-dispute", "resolution-propose", "resolution-confirm"].includes(action)) {
                if (!mongoose.Types.ObjectId.isValid(body.transferId)) return false;
                transfer = request.fulfillment.transfers.id(body.transferId);
                if (!transfer) return false;
            }
            if (action === "handover") {
                if (actorRole !== "donor" || request.pickup.status !== "confirmed" || request.pickup.proposal.start > now || !amounts.settled || request.fulfillment.remainderProposal || quantity > amounts.remaining) return false;
                transfer = { _id: new mongoose.Types.ObjectId(), declaredQuantity: quantity, quantity, donor: actorId, at: now, checklist: { equipmentMatches: true, conditionReviewed: true, accessoriesExplained: true }, notes: (body.notes || "").trim(), status: "awaiting_acknowledgement" };
                request.fulfillment.transfers.push(transfer); request.handedOverQuantity = amounts.handed + quantity;
                handedDelta = quantity; request.pickup.status = "handed_over"; eventAction = "handed_over"; eventQuantity = quantity;
            } else if (action === "acknowledge") {
                if (actorRole !== "ngo" || transfer.status !== "awaiting_acknowledgement" || quantity !== transfer.quantity) return false;
                transfer.status = "acknowledged"; transfer.receivedQuantity = quantity; transfer.receiptNotes = (body.notes || "").trim(); transfer.acknowledgedBy = actorId; transfer.acknowledgedAt = now;
                request.acknowledgedQuantity = amounts.acknowledged + quantity; request.pickup.status = "acknowledged"; eventAction = "acknowledged"; eventQuantity = quantity;
            } else if (action === "receipt-dispute") {
                if (actorRole !== "ngo" || transfer.status !== "awaiting_acknowledgement" || quantity > request.quantity - amounts.released) return false;
                transfer.status = "disputed"; transfer.receivedQuantity = quantity; transfer.receiptNotes = reason;
                request.pickup.status = "disputed"; eventAction = "receipt_disputed"; eventQuantity = transfer.quantity;
            } else if (action === "resolution-propose") {
                if (actorRole !== "donor" || transfer.status !== "disputed" || quantity > transfer.quantity + amounts.remaining) return false;
                transfer.resolution = { quantity, reason, actor: actorId, at: now }; eventAction = "resolution_proposed"; eventQuantity = quantity;
            } else if (action === "resolution-confirm") {
                if (actorRole !== "ngo" || transfer.status !== "disputed" || !transfer.resolution || quantity !== transfer.resolution.quantity) return false;
                handedDelta = quantity - transfer.quantity; request.handedOverQuantity = amounts.handed + handedDelta;
                transfer.quantity = quantity; transfer.receivedQuantity = quantity; transfer.status = "acknowledged"; transfer.acknowledgedBy = actorId; transfer.acknowledgedAt = now;
                request.acknowledgedQuantity = amounts.acknowledged + quantity; request.pickup.status = "acknowledged"; eventAction = "receipt_resolved"; eventQuantity = quantity;
            } else {
                if (!amounts.settled || amounts.handed < 1 || amounts.remaining < 1) return false;
                if (action === "remainder-propose") {
                    if (request.fulfillment.remainderProposal) return false;
                    request.fulfillment.remainderProposal = { actor: actorId, actorRole, at: now, reason, quantity: amounts.remaining }; eventAction = "remainder_proposed"; eventQuantity = amounts.remaining;
                } else if (action === "remainder-withdraw") {
                    if (!request.fulfillment.remainderProposal || String(request.fulfillment.remainderProposal.actor) !== String(actorId)) return false;
                    request.fulfillment.remainderProposal = null; eventAction = "remainder_withdrawn"; eventQuantity = amounts.remaining;
                } else {
                    const proposed = request.fulfillment.remainderProposal;
                    if (!proposed || proposed.actorRole === actorRole || String(proposed.actor) === String(actorId) || proposed.quantity !== amounts.remaining) return false;
                    allocatedDelta = -amounts.remaining; request.releasedQuantity = amounts.released + amounts.remaining;
                    request.fulfillment.remainderProposal = null; eventAction = "remainder_released"; eventQuantity = amounts.remaining;
                }
            }
            const nextAmounts = requestAccounting(request);
            if (!nextAmounts.tracked) throw new FulfillmentConflict();
            if (nextAmounts.remaining === 0 && nextAmounts.settled) { request.status = "completed"; request.fulfillment.completedAt = now; }
            request.pickup.version += 1;
            request.pickup.history.push({ action: eventAction, actor: actorId, actorRole, at: now, version: request.pickup.version, proposal: request.pickup.proposal,
                reason: reason || (body.notes || "").trim(), quantity: eventQuantity, receivedQuantity: action === "receipt-dispute" ? quantity : null, transferId: transfer?._id || null,
                checklist: action === "handover" ? transfer.checklist : null, releasedQuantity: action === "remainder-confirm" ? -allocatedDelta : 0 });
            await request.save({ session });
            const commitments = await DonationRequest.find({ donation: listing._id, status: { $in: ["accepted", "completed"] } }).session(session).lean();
            const completed = (listing.handedOverQuantity ?? 0) + handedDelta === listing.quantity && commitments.every(record => {
                const accounting = requestAccounting(record); return record.status === "completed" && accounting.settled && accounting.remaining === 0;
            });
            const changedListing = await Donation.findOneAndUpdate({ _id: listing._id, __v: listing.__v }, {
                $inc: { handedOverQuantity: handedDelta, allocatedQuantity: allocatedDelta, __v: 1 }, $set: { status: completed ? "completed" : "available" }
            }, { new: true, session });
            if (!changedListing || !await reconciledListing(changedListing, session, DonationRequest)) throw new FulfillmentConflict();
            await recordRequestEvent({ request, kind: eventAction, key: `fulfillment:${request.pickup.version}`, session });
            return true;
        });
    } catch (error) { if (error instanceof FulfillmentConflict) return false; throw error; }
};
