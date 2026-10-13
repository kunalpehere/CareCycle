import { respondError } from "./errors.js";
export const requireVerifiedEmail = (req, res, next) => {
    if (req.auth.user.emailVerifiedAt) return next();
    if (req.accepts(["html", "json"]) === "html") return res.redirect("/account/email");
    return respondError(req, res, 403, "Verify your email at /account/email before creating a new listing or request.");
};
