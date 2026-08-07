import mongoose from "mongoose";
import { Donation } from "../models/Donation.js";
import { Organization } from "../models/Organization.js";
import { respondForbidden } from "./accessResponses.js";

export const requireOwnedResource = ({ model, paramName, ownerField, attachAs }) => async (req, res, next) => {
    try {
        const resourceId = req.params[paramName];
        if (!mongoose.Types.ObjectId.isValid(resourceId)) return res.status(404).send("Resource not found");

        const resource = await model.findById(resourceId);
        if (!resource) return res.status(404).send("Resource not found");
        if (String(resource[ownerField]) !== String(req.auth.userId)) {
            return respondForbidden(req, res, "This resource belongs to another account.");
        }
        req[attachAs] = resource;
        next();
    } catch (error) {
        next(error);
    }
};

export const requireOwnedDonation = requireOwnedResource({
    model: Donation,
    paramName: "id",
    ownerField: "donor",
    attachAs: "ownedDonation"
});

export const requireOwnedOrganization = requireOwnedResource({
    model: Organization,
    paramName: "organizationId",
    ownerField: "owner",
    attachAs: "ownedOrganization"
});
