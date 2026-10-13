import { SecurityStoreError } from "../services/securityStoreService.js";
import { MediaStorageError } from "../services/privateStorageService.js";
import { logEvent } from "../services/observabilityService.js";
export const failureCode = status => ({ 400: "input_invalid", 401: "unauthenticated", 403: "forbidden", 404: "not_found", 409: "conflict", 413: "payload_too_large", 429: "rate_limited", 503: "database_unavailable" }[status] || "internal_failure");
export const respondError = (req, res, status, message, code = failureCode(status)) => {
    if (req.requestId) res.setHeader("X-Request-ID", req.requestId);
    res.setHeader("X-Error-Code", code);
    if (req.accepts?.(["html", "json"]) === "html") {
        res.setHeader("Cache-Control", "private, no-store"); res.vary("Cookie");
        return res.status(status).render("request-error.ejs", { status, message });
    }
    return res.status(status).send(message);
};
export const notFound = (req, res) => respondError(req, res, 404, "Page not found");

export const errorHandler = (error, req, res, next) => {
    const databaseFailure = /^(Mongo(Network|ServerSelection|TopologyClosed|NotConnected)|MongooseServerSelection)/.test(error.name || "");
    const status = error instanceof SecurityStoreError || error instanceof MediaStorageError || databaseFailure ? 503 :
        ["ValidationError", "CastError"].includes(error.name) ? 400 : Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : 500;
    const code = error instanceof SecurityStoreError ? "security_unavailable" : error instanceof MediaStorageError ? "media_unavailable" : failureCode(status);
    logEvent("request.failed", { reference: req.requestId, method: req.method, route: req.route?.path || "unmatched", status, code });
    // Avoid delegating raw errors to Express's default stack/error logger.
    if (res.headersSent) { res.destroy(); return; }
    const messages = { 400: "Check the submitted information and try again.", 401: "Sign in again to continue.", 403: "You cannot complete this action. Refresh the page or return to your dashboard.", 404: "The requested page or file is unavailable.", 409: "This record changed. Reload its current state before submitting again.", 413: "The submitted information is too large. Reduce its size and try again.", 429: "Please wait before trying again.", 503: "CareCycle is temporarily unavailable. Please try again later." };
    return respondError(req, res, status, messages[status] || "Something went wrong. Please try again later.", code);
};
