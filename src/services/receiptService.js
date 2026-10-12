import ejs from "ejs";
import path from "node:path";
import { Donation } from "../models/Donation.js";
import { DonationRequest } from "../models/DonationRequest.js";
import { User } from "../models/User.js";
import { Organization } from "../models/Organization.js";
import { runTransaction } from "./transactionService.js";
import { requestAccounting } from "./fulfillmentAccounting.js";

const iso = value => new Date(value).toISOString();
export const receiptReference = requestId => `CC-${String(requestId).toUpperCase()}`;
export const canIssueReceipt = request => {
    try {
        const amounts = requestAccounting(request);
        return request.status === "completed" && amounts.settled && amounts.remaining === 0 && amounts.acknowledged > 0 && Boolean(request.fulfillment?.completedAt) && request.fulfillment.transfers.every(transfer => transfer.status === "acknowledged" && transfer.receivedQuantity === transfer.quantity && transfer.acknowledgedBy && transfer.acknowledgedAt && transfer.donor && transfer.at);
    } catch { return false; }
};

// Only explicit receipt fields are copied. Coordination, contacts, beneficiary
// summaries and raw handover/discrepancy notes never enter the receipt document.
export const buildReceiptSnapshot = ({ request, donation, donor, organization, now }) => {
    if (!canIssueReceipt(request)) throw new Error("A receipt requires a completed, reconciled NGO-acknowledged handover.");
    return { reference: receiptReference(request._id), issuedAt: iso(now), completedAt: iso(request.fulfillment.completedAt),
        equipment: request.listingSnapshot?.equipment || donation.equipment, listingCondition: request.listingSnapshot?.condition || donation.condition,
        donorName: donor.name, organizationName: organization.name, originalQuantity: request.quantity,
        acknowledgedQuantity: request.acknowledgedQuantity, releasedQuantity: request.releasedQuantity || 0, outcomeNote: "",
        transfers: request.fulfillment.transfers.map((transfer, index) => ({ sequence: index + 1, declaredQuantity: transfer.declaredQuantity, acknowledgedQuantity: transfer.quantity, handedOverAt: iso(transfer.at), acknowledgedAt: iso(transfer.acknowledgedAt) })),
        fulfillmentHistory: (request.pickup?.history || []).filter(event => ["handed_over", "acknowledged", "receipt_disputed", "resolution_proposed", "receipt_resolved", "remainder_proposed", "remainder_released", "remainder_withdrawn"].includes(event.action))
            .map(event => ({ action: event.action.replaceAll("_", " "), actorRole: event.actorRole, at: iso(event.at), quantity: event.quantity ?? null, receivedQuantity: event.receivedQuantity ?? null, releasedQuantity: event.releasedQuantity || 0 })) };
};

const bounded = (value, min, max) => typeof value === "string" && value.trim().length >= min && value.trim().length <= max;
export const receiptActions = ["issue", "outcome", "amend", "confirm", "withdraw"];
export const validateReceiptInput = (action, body) => {
    if (!receiptActions.includes(action)) return false;
    if (action === "issue") return true;
    if (action === "outcome") return bounded(body.outcomeNote, 0, 500) && body.aggregateOnly === "yes";
    if (!bounded(body.reason, 10, 500) || body.aggregateOnly !== "yes") return false;
    return action !== "amend" || (bounded(body.donorName, 2, 80) && bounded(body.organizationName, 2, 150));
};

export const changeReceipt = async ({ requestId, version, actorId, actorRole, organizationId, action, body, now = new Date() }) => {
    if (!receiptActions.includes(action) || version === null || !validateReceiptInput(action, body) || !["donor", "ngo"].includes(actorRole)) return false;
    return runTransaction(Donation.db, async session => {
        const request = await DonationRequest.findById(requestId).session(session);
        if (!request || !canIssueReceipt(request) || (request.receipt?.version || 0) !== version) return false;
        if (actorRole === "ngo" && String(request.organization) !== String(organizationId)) return false;
        const donation = await Donation.findById(request.donation).session(session).lean();
        const donorId = request.receipt?.donorId || donation?.donor;
        if (actorRole === "donor" && String(donorId) !== String(actorId)) return false;
        let snapshot, reason, eventAction, amendmentEvidence = null;
        if (action === "issue") {
            if (request.receipt || !donation) return false;
            const donor = await User.findById(donation.donor).select("name").session(session).lean();
            const organization = await Organization.findById(request.organization).select("name").session(session).lean();
            if (!donor || !organization) return false;
            snapshot = buildReceiptSnapshot({ request: request.toObject(), donation, donor, organization, now });
            request.receipt = { reference: snapshot.reference, donorId, version: 0, revisions: [], events: [] };
            reason = "Initial receipt issued from acknowledged handover records."; eventAction = "issued";
        } else {
            if (!request.receipt?.revisions.length) return false;
            const latest = request.receipt.revisions.at(-1);
            snapshot = structuredClone(latest.snapshot);
            reason = typeof body.reason === "string" ? body.reason.trim() : "NGO aggregate outcome note updated.";
            if (action === "outcome") {
                if (actorRole !== "ngo" || request.receipt.amendment || snapshot.outcomeNote === body.outcomeNote.trim()) return false;
                snapshot.outcomeNote = body.outcomeNote.trim(); eventAction = "outcome_updated";
                reason = "NGO aggregate outcome note updated.";
            } else if (action === "amend") {
                if (request.receipt.amendment || (snapshot.donorName === body.donorName.trim() && snapshot.organizationName === body.organizationName.trim())) return false;
                request.receipt.amendment = { actor: actorId, actorRole, at: now, donorName: body.donorName.trim(), organizationName: body.organizationName.trim(), reason };
                snapshot = null; eventAction = "amendment_proposed";
            } else {
                const amendment = request.receipt.amendment;
                if (!amendment) return false;
                if (action === "confirm") {
                    if (amendment.actorRole === actorRole || String(amendment.actor) === String(actorId)) return false;
                    snapshot.donorName = amendment.donorName; snapshot.organizationName = amendment.organizationName;
                    amendmentEvidence = { donorName: amendment.donorName, organizationName: amendment.organizationName, proposalActorRole: amendment.actorRole, proposalAt: iso(amendment.at), proposalReason: amendment.reason, confirmationActorRole: actorRole, confirmationAt: iso(now), confirmationReason: reason };
                    eventAction = "amendment_confirmed";
                } else {
                    if (String(amendment.actor) !== String(actorId)) return false;
                    snapshot = null; eventAction = "amendment_withdrawn";
                }
                request.receipt.amendment = null;
            }
        }
        request.receipt.version += 1;
        request.receipt.events.push({ action: eventAction, actor: actorId, actorRole, at: now, reason });
        if (snapshot) {
            const number = request.receipt.revisions.length + 1;
            const revisionHistory = [...request.receipt.revisions.map(revision => ({ number: revision.number, at: iso(revision.at), actorRole: revision.actorRole, reason: revision.reason, amendmentEvidence: revision.amendmentEvidence })), { number, at: iso(now), actorRole, reason, amendmentEvidence }];
            const html = await ejs.renderFile(path.resolve("views/receipt-document.ejs"), { snapshot, number, revisedAt: iso(now), revisionHistory });
            request.receipt.revisions.push({ number, at: now, actor: actorId, actorRole, reason, amendmentEvidence, snapshot, html });
        }
        await request.save({ session });
        return true;
    });
};
