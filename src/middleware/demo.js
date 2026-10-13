import mongoose from "mongoose";
import { env } from "../config/env.js";
import { consumeDemoBudget, DEMO_IDS } from "../services/demoService.js";
import { assertDemoDatabase } from "../services/demoGuardService.js";
import { authenticate } from "./authenticate.js";
import { verifyCsrfToken } from "./csrf.js";

const blocked = /^\/(?:admin(?:\/|$)|register(?:\/|$)|forgot-password(?:\/|$)|reset-password(?:\/|$)|verify-email(?:\/|$)|account\/email(?:\/|$)|organizations(?:\/|$)|ngo\/organizations(?:\/|$))/i;
const mutation = /^(?:POST|PUT|PATCH|DELETE)$/;
export const demoBoundary = async (req, res, next) => {
    res.locals.demoMode = env.demoMode;
    if (!env.demoMode) return next();
    res.setHeader("Cache-Control", "private, no-store");
    try {
        await assertDemoDatabase(mongoose.connection);
        // Express routes are case-insensitive and accept a trailing slash.
        const route = req.path.toLowerCase().replace(/\/+$/, "") || "/";
        if (route === "/login") return ["GET", "HEAD"].includes(req.method) ? res.redirect("/demo") : res.status(403).send("Use the synthetic role buttons at /demo.");
        if (blocked.test(route) || (mutation.test(req.method) && ["/contact", "/ngo/organization"].includes(route))) return res.status(403).send("This action is unavailable in the synthetic demo. Return to /demo.");
        // Reject multipart before Multer or any durable upload write.
        if (req.is("multipart/form-data")) return res.status(403).send("Public demo uploads are disabled. Use the existing synthetic listing.");
        if (!mutation.test(req.method) || ["/demo/login", "/logout"].includes(route)) return next();
        return authenticate(req, res, () => {
            if (![DEMO_IDS.donor, DEMO_IDS.ngo].includes(req.auth.userId)) return res.status(403).send("Synthetic demo accounts only.");
            verifyCsrfToken(req, res, () => {
                consumeDemoBudget(req.auth.userId).then(allowed => allowed ? next() : res.status(429).send("The shared demo activity limit has been reached. An operator must reset the demo.")).catch(next);
            });
        });
    } catch { return res.status(503).send("The synthetic demo is undergoing maintenance. Please return later."); }
};
