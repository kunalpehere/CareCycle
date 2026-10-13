import { respondError } from "./errors.js";
import { consumeRateLimit } from "../services/securityStoreService.js";
export const createRateLimiter = ({ windowMs, max, namespace }) => {
    if (!namespace || !Number.isSafeInteger(windowMs) || windowMs < 1 || !Number.isSafeInteger(max) || max < 1) throw new Error("A rate limiter requires an explicit namespace and positive policy.");
    return async (req, res, next) => {
        try {
            const result = await consumeRateLimit({ namespace, address: req.ip, windowMs, max });
            if (result.allowed) return next();
            res.setHeader("Retry-After", Math.max(1, Math.ceil((result.resetAt.getTime() - Date.now()) / 1000)));
            return respondError(req, res, 429, "Too many requests. Please try again later.");
        } catch (error) { next(error); }
    };
};
export const authRateLimit = createRateLimiter({ namespace: "authentication", windowMs: 15 * 60 * 1000, max: 10 });
export const actionRateLimit = createRateLimiter({ namespace: "actions", windowMs: 60 * 1000, max: 10 });
