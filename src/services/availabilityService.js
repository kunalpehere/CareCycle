import { quantityAccounting } from "./quantityContract.js";
import { User } from "../models/User.js";

export const OPEN_LISTING_STATUSES = ["available", "requested", "matched", "pickup_scheduled"];
export const availableListingQuery = (units = 1) => ({
    status: { $in: OPEN_LISTING_STATUSES },
    moderationStatus: { $ne: "hidden" },
    donorSuspended: { $ne: true },
    $expr: { $gte: [{ $subtract: ["$quantity", { $ifNull: ["$allocatedQuantity", 0] }] }, units] }
});
export const withRemainingAvailability = listing => ({ ...listing, availableQuantity: quantityAccounting(listing).available });

export const activeListingPipeline = (query = {}) => [
    { $match: { ...availableListingQuery(), ...query } },
    { $lookup: { from: User.collection.name, localField: "donor", foreignField: "_id", as: "donorAccount", pipeline: [{ $project: { status: 1, role: 1 } }] } },
    { $match: { "donorAccount.role": "donor", $or: [{ "donorAccount.status": "active" }, { "donorAccount.status": { $exists: false } }] } }
];
