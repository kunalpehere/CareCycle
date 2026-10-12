import { quantityAccounting } from "./quantityContract.js";

export const planQuantityBackfill = (listing, requests) => {
    const issues = [];
    const known = ["pending", "accepted", "rejected", "cancelled", "completed"];
    if (requests.some(item => !known.includes(item.status) || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 100)) {
        issues.push("invalid_request_contract");
    }
    if (!["available", "requested", "matched", "pickup_scheduled", "completed", "withdrawn"].includes(listing.status)) issues.push("unknown_listing_status");
    if (listing.accountingVersion !== undefined && listing.accountingVersion !== 1) issues.push("unsupported_accounting_version");
    const committed = requests.filter(item => ["accepted", "completed"].includes(item.status)).reduce((sum, item) => sum + item.quantity, 0);
    const allocated = listing.allocatedQuantity === undefined ? committed : listing.allocatedQuantity;
    const handedOver = listing.handedOverQuantity === undefined ? 0 : listing.handedOverQuantity;
    if (allocated !== committed) issues.push("allocation_request_mismatch");
    if (listing.accountingVersion !== 1 && (listing.status === "completed" || requests.some(item => item.status === "completed") || handedOver > 0)) issues.push("handover_evidence_required");
    try { quantityAccounting({ quantity: listing.quantity, allocatedQuantity: allocated, handedOverQuantity: handedOver }); }
    catch { issues.push("invalid_quantity_accounting"); }
    if (listing.status === "withdrawn" && allocated > handedOver) issues.push("withdrawn_with_reservations");
    if (listing.status === "completed" && (handedOver !== listing.quantity || allocated !== handedOver)) issues.push("incomplete_listing_marked_completed");
    const changes = {};
    if (!issues.length) {
        if (listing.allocatedQuantity === undefined) changes.allocatedQuantity = allocated;
        if (listing.handedOverQuantity === undefined) changes.handedOverQuantity = 0;
        if (listing.accountingVersion === undefined) changes.accountingVersion = 1;
    }
    return { id: String(listing._id), issues, changes };
};

// Raw collections avoid Mongoose defaults hiding missing historical fields.
// A single transaction gives the apply run an all-or-nothing result.
export const backfillQuantities = async (connection, { apply = false } = {}) => {
    const session = await connection.startSession();
    let report;
    try {
        await session.withTransaction(async () => {
            const listings = await connection.collection("donations").find({}, { session }).toArray();
            const requests = await connection.collection("donation_requests").find({}, { session,
                projection: { donation: 1, status: 1, quantity: 1 } }).toArray();
            const byListing = new Map();
            for (const request of requests) {
                const key = String(request.donation);
                if (!byListing.has(key)) byListing.set(key, []);
                byListing.get(key).push(request);
            }
            const ids = new Set(listings.map(item => String(item._id)));
            const orphanRequests = requests.filter(item => !ids.has(String(item.donation))).map(item => String(item._id));
            const records = listings.map(item => planQuantityBackfill(item, byListing.get(String(item._id)) || []));
            report = { mode: apply ? "apply" : "dry-run", scanned: listings.length,
                proposed: records.filter(item => Object.keys(item.changes).length).length,
                blocked: records.filter(item => item.issues.length).length, orphanRequests, records, applied: 0 };
            if (!apply || report.blocked || orphanRequests.length) return;
            for (let index = 0; index < records.length; index += 1) {
                if (!Object.keys(records[index].changes).length) continue;
                await connection.collection("donations").updateOne({ _id: listings[index]._id },
                    { $set: records[index].changes }, { session });
                report.applied += 1;
            }
        }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
        return report;
    } finally { await session.endSession(); }
};
