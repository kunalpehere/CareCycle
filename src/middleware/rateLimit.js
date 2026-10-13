import { respondError } from "./errors.js";
export const createRateLimiter = ({ windowMs, max }) => {
    const attempts = new Map();
    return (req, res, next) => {
        const now = Date.now();
        if (attempts.size >= 10000) {
            for (const [address, attempt] of attempts) if (now >= attempt.resetAt) attempts.delete(address);
            if (!attempts.has(req.ip) && attempts.size >= 10000) {
                res.setHeader("Retry-After", Math.ceil(windowMs / 1000));
                return respondError(req, res, 429, "Too many requests. Please try again later.");
            }
        }
        const key = req.ip;
        const entry = attempts.get(key);

        if (!entry || now >= entry.resetAt) {
            attempts.set(key, { count: 1, resetAt: now + windowMs });
            return next();
        }
        if (entry.count >= max) {
            res.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
            return respondError(req, res, 429, "Too many requests. Please try again later.");
        }
        entry.count += 1;
        next();
    };
};

export const authRateLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });
export const actionRateLimit = createRateLimiter({ windowMs: 60 * 1000, max: 10 });
