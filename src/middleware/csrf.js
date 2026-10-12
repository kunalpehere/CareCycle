import crypto from "crypto";
import { respondError } from "./errors.js";

export const issueCsrfToken = (req, res, next) => {
    if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString("hex");
    res.locals.csrfToken = req.session.csrfToken;
    next();
};

export const verifyCsrfToken = (req, res, next) => {
    const suppliedValue = req.body?._csrf || req.get("x-csrf-token");
    const expectedValue = req.session.csrfToken;
    if (!suppliedValue || !expectedValue) {
        return respondError(req, res, 403, "Invalid request token. Refresh the page and try again.");
    }

    const supplied = Buffer.from(suppliedValue);
    const expected = Buffer.from(expectedValue);
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
        return respondError(req, res, 403, "Invalid request token. Refresh the page and try again.");
    }
    next();
};
