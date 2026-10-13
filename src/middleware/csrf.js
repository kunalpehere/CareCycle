import crypto from "crypto";
import { respondError } from "./errors.js";

export const issueCsrfToken = (req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.vary("Cookie");
    const created = !req.session.csrfToken;
    if (created) req.session.csrfToken = crypto.randomBytes(32).toString("hex");
    res.locals.csrfToken = req.session.csrfToken;
    // Establish the guest session before rendering a usable form. Express's
    // response-time save alone can report an outage after sending a 200 body.
    if (created) return req.session.save(error => error ? next(error) : next());
    next();
};

export const verifyCsrfToken = (req, res, next) => {
    const suppliedValue = req.body?._csrf || req.get("x-csrf-token");
    const expectedValue = req.session.csrfToken;
    if (typeof suppliedValue !== "string" || typeof expectedValue !== "string" || !suppliedValue || !expectedValue) {
        return respondError(req, res, 403, "Invalid request token. Refresh the page and try again.");
    }

    const supplied = Buffer.from(suppliedValue);
    const expected = Buffer.from(expectedValue);
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
        return respondError(req, res, 403, "Invalid request token. Refresh the page and try again.");
    }
    next();
};
