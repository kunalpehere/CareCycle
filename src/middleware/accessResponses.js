import { getDashboardPath } from "../services/roleService.js";

const expectsJson = (req) => req.path === "/donateinfo" || req.originalUrl.startsWith("/api/") || String(req.get("accept") || "").includes("application/json");

export const respondUnauthorized = (req, res, message = "Please sign in to continue.") => {
    if (expectsJson(req)) return res.status(401).json({ error: "authentication_required", message });
    return res.redirect(`/login?message=${encodeURIComponent(message)}`);
};

export const respondForbidden = (req, res, message = "You do not have permission to access this resource.") => {
    if (expectsJson(req)) return res.status(403).json({ error: "forbidden", message });
    const role = req.auth?.user?.role;
    return res.status(403).render("access-denied.ejs", {
        message,
        dashboardPath: getDashboardPath(role),
        role: role || "unknown"
    });
};
