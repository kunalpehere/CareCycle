import { quantityAccounting } from "./quantityContract.js";

export const OPEN_LISTING_STATUSES = ["available", "requested", "matched", "pickup_scheduled"];
export const availableListingQuery = (units = 1) => ({
    status: { $in: OPEN_LISTING_STATUSES },
    $expr: { $gte: [{ $subtract: ["$quantity", { $ifNull: ["$allocatedQuantity", 0] }] }, units] }
});
export const withRemainingAvailability = listing => ({ ...listing, availableQuantity: quantityAccounting(listing).available });
