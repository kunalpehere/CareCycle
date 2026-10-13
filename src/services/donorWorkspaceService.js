import { quantityAccounting } from "./quantityContract.js";
import { requestAccounting } from "./fulfillmentAccounting.js";
import { OPEN_LISTING_STATUSES } from "./availabilityService.js";

export const workspaceFilters = { all: "All listings", active: "Active listings", decisions: "Requests to decide", pickups: "Pickup commitments", waiting: "Waiting on an NGO", review: "Needs review", history: "Completed or withdrawn listings" };
const eventLabels = { proposed: "Pickup proposed", rescheduled: "Pickup rescheduled", confirmed: "Pickup confirmed", missed: "Missed pickup reported", disputed: "Pickup disagreement recorded", resolved: "Pickup disagreement withdrawn", cancelled: "Collection cancelled", handed_over: "Handover recorded", acknowledged: "NGO receipt acknowledged", receipt_disputed: "Receipt discrepancy reported", resolution_proposed: "Receipt resolution proposed", receipt_resolved: "Receipt resolution confirmed", remainder_proposed: "Remaining-unit release proposed", remainder_released: "Remaining units released", remainder_withdrawn: "Release proposal withdrawn" };
const pageNumber = value => typeof value === "string" && /^[1-9]\d{0,5}$/.test(value) ? Number(value) : 1;
const id = value => String(value?._id || value);

export const donorRequestTask = (request, donorId, now = new Date()) => {
    const base = `/donor/requests/${request._id}`;
    const task = (group, label, detail, action = "Review collection", href = `${base}/pickup`) => ({ group, label, detail, action, href });
    if (request.status === "pending") return task("decisions", "Review request", "Accept or reject this NGO's quantity request.", "Review request", `/donor/requests?request=${request._id}`);
    if (["cancelled", "rejected"].includes(request.status)) return null;
    let amounts;
    try { amounts = requestAccounting(request); } catch { return task("review", "Review older quantities", "Quantity records need review before continuing.", "Contact support", "/contact"); }
    if (!amounts.tracked || (request.status === "completed" && (!amounts.settled || amounts.remaining !== 0))) return task("review", "Review older handover evidence", "Receipt acknowledgement cannot be inferred from older totals.", "Contact support", "/contact");
    if (request.status === "completed") return null;
    if (request.status !== "accepted") return null;
    const disputed = request.fulfillment?.transfers?.find(transfer => transfer.status === "disputed");
    if (disputed) return disputed.resolution
        ? task("waiting", "Waiting for NGO resolution confirmation", "A proposed correction needs the NGO's agreement.")
        : task("review", "Resolve receipt discrepancy", "Review the NGO's report and propose a correction.");
    if (!amounts.settled) return task("waiting", "Waiting for NGO acknowledgement", "The NGO must acknowledge the recorded handover or report a discrepancy.");
    const remainder = request.fulfillment?.remainderProposal;
    if (remainder) return id(remainder.actor) === id(donorId)
        ? task("waiting", "Waiting for NGO release confirmation", "Your remaining-unit release proposal needs the NGO's agreement.")
        : task("review", "Review remaining-unit release", "The NGO proposed releasing the unfulfilled reservation.");
    if (request.pickup?.missedReport?.disputed) return task("review", "Review pickup disagreement", "Collection cannot continue until the disagreement is resolved.");
    if (request.pickup?.status === "missed") return task("review", "Review missed pickup", "Review the report and agree on a new collection or cancellation.");
    if (request.pickup?.status === "proposed") return id(request.pickup.proposal?.proposedBy) === id(donorId)
        ? task("waiting", "Waiting for NGO pickup confirmation", "Your pickup proposal needs the NGO's agreement.")
        : task("pickups", "Confirm pickup proposal", "Review the NGO's collection window and private pickup details.");
    if (request.pickup?.status === "confirmed") return new Date(request.pickup.proposal?.start) > now
        ? task("pickups", "Upcoming confirmed pickup", "Review the agreed collection window. Record handover only after equipment changes hands.")
        : task("pickups", "Record handover or review collection", "The agreed window has started. Record actual equipment transferred, or review a failed collection.");
    if (amounts.remaining > 0) return task("pickups", amounts.handed > 0 ? "Arrange remaining pickup" : "Arrange pickup", "Propose a collection window for the outstanding reservation.");
    return task("review", "Review request completion", "The request is still accepted. Review its recorded handover state.");
};

export const requestTimeline = request => {
    const events = [];
    const add = (label, at) => { if (at && Number.isFinite(new Date(at).getTime())) events.push({ label, at: new Date(at).toISOString() }); };
    add("Request submitted", request.createdAt);
    if (["accepted", "completed"].includes(request.status)) add("Request accepted", request.respondedAt);
    else if (request.status === "rejected") add("Request rejected", request.respondedAt);
    else if (request.status === "cancelled") add(request.cancellation?.at ? "Request cancelled" : "Cancelled record last updated", request.cancellation?.at || request.updatedAt);
    for (const event of request.pickup?.history || []) if (eventLabels[event.action]) add(eventLabels[event.action], event.at);
    for (const transfer of request.fulfillment?.transfers || []) {
        add("Handover recorded", transfer.at);
        add("NGO receipt acknowledged", transfer.acknowledgedAt);
    }
    add("Request completed", request.fulfillment?.completedAt);
    return [...new Map(events.map(event => [`${event.label}:${event.at}`, event])).values()].sort((a, b) => a.at.localeCompare(b.at)).slice(-4);
};

export const buildDonorWorkspace = ({ donations, requests, donorId, query = {}, now = new Date() }) => {
    const filter = typeof query.filter === "string" && Object.hasOwn(workspaceFilters, query.filter) ? query.filter : "all";
    const equipment = ["wheelchair", "walker", "cane", "stethoscope"].includes(query.equipment) ? query.equipment : "";
    const grouped = new Map(donations.map(item => [id(item._id), []]));
    for (const request of requests) grouped.get(id(request.donation))?.push(request);
    const tasks = [], counts = { decisions: 0, pickups: 0, waiting: 0, review: 0 };
    const listings = donations.map(donation => {
        const records = grouped.get(id(donation._id));
        const progress = records.map(request => {
            const next = donorRequestTask(request, donorId, now);
            if (next) {
                let window = "";
                try {
                    if (["proposed", "confirmed"].includes(request.pickup?.status)) {
                        const proposal = request.pickup.proposal;
                        const format = new Intl.DateTimeFormat("en-GB", { timeZone: proposal.timeZone, dateStyle: "medium", timeStyle: "short" });
                        window = `${format.format(new Date(proposal.start))} to ${format.format(new Date(proposal.end))} (${proposal.timeZone})`;
                    }
                } catch { /* Omit invalid older window data rather than inventing a time zone. */ }
                counts[next.group]++; tasks.push({ ...next, window, organizationName: request.organization?.name || "Organization name not recorded", requestId: id(request._id), listingId: id(donation._id), equipment: donation.equipment, quantity: request.quantity, createdAt: request.createdAt });
            }
            const collectionHistory = request.cancellation || (request.status === "completed" && request.fulfillment);
            let receipt = false;
            try {
                const amounts = requestAccounting(request);
                receipt = request.status === "completed" && Boolean(request.fulfillment?.completedAt) && amounts.settled && amounts.remaining === 0 && amounts.acknowledged > 0
                    && request.fulfillment.transfers.every(transfer => transfer.receivedQuantity === transfer.quantity && transfer.acknowledgedBy && transfer.acknowledgedAt && transfer.donor && transfer.at);
            } catch { /* Older records need explicit review. */ }
            return { id: id(request._id), status: request.status, quantity: request.quantity, next, timeline: requestTimeline(request), href: request.status === "accepted" || collectionHistory ? `/donor/requests/${request._id}/pickup` : `/donor/requests?request=${request._id}`, receipt };
        });
        let accounting = null;
        try { accounting = quantityAccounting(donation); } catch { /* Do not invent availability for inconsistent old records. */ }
        const commitments = records.filter(request => ["accepted", "completed"].includes(request.status));
        let acknowledged = 0, reliable = true, allocated = 0, handed = 0;
        for (const request of commitments) {
            try {
                const amounts = requestAccounting(request);
                reliable &&= amounts.tracked;
                acknowledged += amounts.acknowledged; allocated += request.quantity - amounts.released; handed += amounts.handed;
            } catch { reliable = false; }
        }
        reliable &&= Boolean(accounting && accounting.allocated === allocated && accounting.handedOver === handed);
        return { ...donation, accounting, acknowledged: reliable ? acknowledged : null, progress,
            canEdit: donation.status === "available" && !donation.allocatedQuantity && !records.some(request => request.status === "pending"),
            canWithdraw: donation.status === "available" && !donation.allocatedQuantity,
            canChangeQuantity: OPEN_LISTING_STATUSES.includes(donation.status),
            requestable: accounting && OPEN_LISTING_STATUSES.includes(donation.status) && donation.moderationStatus !== "hidden" && !donation.donorSuspended ? accounting.available : 0 };
    });
    const selected = listings.filter(item => (!equipment || item.equipment === equipment) && (filter === "all" || filter === "active" && OPEN_LISTING_STATUSES.includes(item.status) || filter === "history" && ["completed", "withdrawn"].includes(item.status) || item.progress.some(request => request.next?.group === filter)));
    const selectedIds = new Set(selected.map(item => id(item._id)));
    const matchingTasks = tasks.filter(task => selectedIds.has(task.listingId) && (["all", "active"].includes(filter) || task.group === filter));
    // Oldest requests first, then deterministic identifiers. Both lists are bounded in the response.
    matchingTasks.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt) || a.requestId.localeCompare(b.requestId));
    const pages = Math.max(1, Math.ceil(selected.length / 12)), page = Math.min(pageNumber(query.page), pages);
    const taskPages = Math.max(1, Math.ceil(matchingTasks.length / 8)), taskPage = Math.min(pageNumber(query.taskPage), taskPages);
    const url = changes => `/donor/dashboard?${new URLSearchParams({ filter, equipment, page: String(page), taskPage: String(taskPage), ...changes })}`;
    return { donations: selected.slice((page - 1) * 12, page * 12), tasks: matchingTasks.slice((taskPage - 1) * 8, taskPage * 8), counts,
        totalListings: donations.length, matchingListings: selected.length, matchingTasks: matchingTasks.length, filter, equipment, pages, page, taskPages, taskPage, url, workspaceFilters };
};
