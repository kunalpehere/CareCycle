import { quantityAccounting } from "./quantityContract.js";

// Actor means a verified resource owner/participant, not merely a role string.
// These are contracts for later transactional route implementations.
export const TRANSITIONS = {
    listing: { available: { withdrawn: ["donor"], completed: ["system"] }, withdrawn: {}, completed: {} },
    request: { pending: { accepted: ["donor"], rejected: ["donor"], cancelled: ["organization", "system"] },
        accepted: { cancelled: ["donor", "organization"], completed: ["organization"] },
        rejected: {}, cancelled: {}, completed: {} },
    pickup: { unarranged: { proposed: ["donor", "organization"] },
        proposed: { confirmed: ["counterparty"], cancelled: ["donor", "organization"] },
        confirmed: { proposed: ["donor", "organization"], handed_over: ["donor"], missed: ["donor", "organization"], cancelled: ["donor", "organization"] },
        missed: { proposed: ["donor", "organization"], cancelled: ["donor", "organization"] },
        handed_over: { acknowledged: ["organization"], disputed: ["organization"] },
        disputed: { acknowledged: ["organization"] }, acknowledged: {}, cancelled: {} }
};

export const assertTransition = ({ record, from, to, actor, evidence = {} }) => {
    const actors = Object.hasOwn(TRANSITIONS, record) && Object.hasOwn(TRANSITIONS[record], from)
        ? TRANSITIONS[record][from][to] : null;
    if (!Array.isArray(actors) || !actors.includes(actor)) throw new Error("Transition or actor is not permitted.");
    if (record === "request" && from === "accepted" && to === "completed" &&
        (evidence.pickupStatus !== "acknowledged" || !Number.isSafeInteger(evidence.quantity) || evidence.quantity < 1 ||
        evidence.quantity > 100 || evidence.fulfilledQuantity !== evidence.quantity)) {
        throw new Error("Completion requires NGO acknowledgement of handover.");
    }
    if (record === "request" && from === "accepted" && to === "cancelled" && evidence.handedOverQuantity !== 0) {
        throw new Error("Cancellation requires evidence that no units have been handed over.");
    }
    if (record === "listing" && to === "completed") {
        const accounting = quantityAccounting(evidence);
        if (accounting.handedOver !== accounting.total || evidence.allRequestsAcknowledged !== true) throw new Error("Listing completion requires all units acknowledged.");
    }
    if (record === "listing" && to === "withdrawn" && quantityAccounting(evidence).reserved !== 0) {
        throw new Error("Resolve outstanding reservations before withdrawal.");
    }
    return true;
};

export const listingPolicy = (listing, { pendingRequests = 0 } = {}) => {
    const accounting = quantityAccounting(listing);
    if (!["available", "requested", "matched", "pickup_scheduled", "withdrawn", "completed"].includes(listing.status)) throw new Error("Unknown listing status.");
    if (!Number.isSafeInteger(pendingRequests) || pendingRequests < 0) throw new RangeError("Invalid pending request count.");
    const open = !["withdrawn", "completed"].includes(listing.status);
    return { requestableQuantity: open ? accounting.available : 0,
        canEditEquipment: open && accounting.allocated === 0 && pendingRequests === 0,
        canEditQuantity: open,
        minimumTotal: Math.max(1, accounting.allocated),
        canWithdraw: open && accounting.reserved === 0,
        pendingRequestsRequireResolution: pendingRequests > 0 };
};
