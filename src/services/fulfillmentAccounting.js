import { quantityAccounting } from "./quantityContract.js";

export const requestAccounting = request => {
    const quantity = request.quantity, handed = request.handedOverQuantity ?? 0, acknowledged = request.acknowledgedQuantity ?? 0, released = request.releasedQuantity ?? 0;
    if (![quantity, handed, acknowledged, released].every(value => Number.isSafeInteger(value) && value >= 0 && value <= 100) || quantity < 1 || acknowledged > handed || handed + released > quantity) throw new RangeError("Fulfillment quantities must be whole numbers within the accepted commitment.");
    const transfers = request.fulfillment?.transfers || [];
    if (transfers.some(transfer => !Number.isSafeInteger(transfer.quantity) || transfer.quantity < 0 || transfer.quantity > 100)) throw new RangeError("Transfer quantities must be whole numbers between 0 and 100.");
    const tracked = transfers.reduce((sum, transfer) => sum + transfer.quantity, 0);
    const received = transfers.filter(transfer => transfer.status === "acknowledged").reduce((sum, transfer) => sum + transfer.quantity, 0);
    return { handed, acknowledged, released, remaining: quantity - handed - released, tracked: tracked === handed && received === acknowledged,
        settled: transfers.every(transfer => transfer.status === "acknowledged") && tracked === handed && received === acknowledged };
};

export const canArrangePickup = request => {
    try { const accounting = requestAccounting(request); return request.status === "accepted" && accounting.remaining > 0 && accounting.settled && !request.fulfillment?.remainderProposal; }
    catch { return false; }
};

export const reconciledListing = async (listing, session, RequestModel) => {
    const accounting = quantityAccounting(listing);
    const requests = await RequestModel.find({ donation: listing._id, status: { $in: ["accepted", "completed"] } }).session(session).lean();
    let allocated = 0, handed = 0;
    for (const request of requests) {
        const amounts = requestAccounting(request);
        if (!amounts.tracked) return false;
        allocated += request.quantity - amounts.released; handed += amounts.handed;
    }
    return allocated === accounting.allocated && handed === accounting.handedOver;
};
