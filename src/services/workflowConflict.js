import { Donation } from "../models/Donation.js";
import { OPEN_LISTING_STATUSES } from "./availabilityService.js";
import { quantityAccounting } from "./quantityContract.js";

export const workflowConflict = async (req, res, { message, donationId, donor = false }) => {
    const query = { _id: donationId };
    if (donor) query.donor = req.auth.userId;
    const listing = donationId ? await Donation.findOne(query).select("quantity allocatedQuantity handedOverQuantity status").lean() : null;
    const available = listing && OPEN_LISTING_STATUSES.includes(listing.status) ? quantityAccounting(listing).available : 0;
    return res.status(409).render("workflow-conflict.ejs", { message, available,
        historyUrl: donor ? "/donor/requests" : "/ngo/requests", discoveryUrl: donor ? "/donor/dashboard" : "/ngo/equipment",
        listingUrl: listing && available > 0 ? (donor ? `/donations/${listing._id}/quantity` : `/ngo/equipment/${listing._id}`) : "" });
};
