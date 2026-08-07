import { respondForbidden } from "./accessResponses.js";

export const authorizeRoles = (...roles) => (req, res, next) => {
    if (!req.auth?.user || !roles.includes(req.auth.user.role)) {
        return respondForbidden(req, res);
    }
    next();
};
