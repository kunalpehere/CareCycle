import { env } from "../config/env.js";
export const applicationCsp = "default-src 'none'; script-src 'self'; script-src-attr 'none'; style-src 'self' https://fonts.googleapis.com; style-src-attr 'none'; font-src 'self' https://fonts.gstatic.com; img-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
export const securityHeaders = (req, res, next) => {
    res.locals.currentUser = null;
    res.locals.csrfToken = "";
    res.setHeader("Content-Security-Policy", applicationCsp);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (env.isProduction) {
        if (!req.secure) return res.status(400).send("Use HTTPS through the configured trusted proxy to access CareCycle.");
        res.setHeader("Strict-Transport-Security", "max-age=31536000");
    }
    next();
};
