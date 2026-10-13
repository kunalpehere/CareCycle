import { User } from "../models/User.js";
import { verifyAccessToken } from "../services/tokenService.js";
import { clearAuthCookie, authCookieName } from "../services/authCookieService.js";
import { getDashboardPath } from "../services/roleService.js";

export const guestOnly = async (req, res, next) => {
    const token = req.cookies[authCookieName];
    if (!token) return next();
    try {
        const payload = verifyAccessToken(token);
        const user = await User.findOne({
            _id: payload.id,
            $or: [{ status: "active" }, { status: { $exists: false } }]
        }).select("role authVersion");
        if (user && (payload.authVersion ?? 0) === (user.authVersion ?? 0) && req.session?.auth?.userId === user.id && req.session.auth.authVersion === (user.authVersion ?? 0)) return res.redirect(getDashboardPath(user.role));
    } catch (error) {
        // An invalid or expired cookie should not prevent access to authentication pages.
    }
    clearAuthCookie(res);
    next();
};
