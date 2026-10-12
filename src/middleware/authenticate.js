import { User } from "../models/User.js";
import { verifyAccessToken } from "../services/tokenService.js";
import { clearAuthCookie } from "../services/authCookieService.js";
import { respondUnauthorized } from "./accessResponses.js";

export const authenticate = async (req, res, next) => {
    // Protected pages/media may contain contacts or verification evidence.
    // Set this before auth checks, including failures and conditional file reads.
    res.setHeader("Cache-Control", "private, no-store");
    res.vary("Cookie");
    try {
        const token = req.cookies.token;
        if (!token) return respondUnauthorized(req, res);

        const payload = verifyAccessToken(token);
        const user = await User.findOne({
            _id: payload.id,
            $or: [{ status: "active" }, { status: { $exists: false } }]
        }).select("_id email name role");
        if (!user) {
            clearAuthCookie(res);
            return respondUnauthorized(req, res, "Your account is unavailable. Please sign in again.");
        }
        req.auth = { userId: user.id, user };
        res.locals.currentUser = { id: user.id, name: user.name, email: user.email, role: user.role };
        next();
    } catch (error) {
        clearAuthCookie(res);
        return respondUnauthorized(req, res, "Your session expired. Please sign in again.");
    }
};
