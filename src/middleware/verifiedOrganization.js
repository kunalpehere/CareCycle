import { Organization } from "../models/Organization.js";
import { respondForbidden } from "./accessResponses.js";

export const createVerifiedOrganizationMiddleware = (model = Organization) => async (req, res, next) => {
    try {
        const organization = await model.findOne({ owner: req.auth.userId });
        if (!organization) return respondForbidden(req, res, "Create and submit your organization profile before discovering equipment.");
        if (organization.verificationStatus !== "verified") {
            return respondForbidden(req, res, "Equipment discovery is available after your organization is verified.");
        }
        req.verifiedOrganization = organization;
        next();
    } catch (error) {
        next(error);
    }
};

export const requireVerifiedOrganization = createVerifiedOrganizationMiddleware();
