import { User } from "../models/User.js";
import { verifyAccessToken } from "../services/tokenService.js";
import { clearAuthCookie } from "../services/authCookieService.js";
import { respondUnauthorized } from "./accessResponses.js";

const resolveAuthentication = async (req, res, next, optional) => {
    // Protected pages/media may contain contacts or verification evidence.
    // Set this before auth checks, including failures and conditional file reads.
    res.setHeader("Cache-Control", "private, no-store");
    res.vary("Cookie");
    try {
        const token = req.cookies.token;
        res.locals.currentUser = null;
        if (!token) return optional ? next() : respondUnauthorized(req, res);

        const payload = verifyAccessToken(token);
        const user = await User.findOne({
            _id: payload.id,
            $or: [{ status: "active" }, { status: { $exists: false } }]
        }).select("_id email name role");
        if (!user) {
            clearAuthCookie(res);
            return optional ? next() : respondUnauthorized(req, res, "Your account is unavailable. Please sign in again.");
        }
        req.auth = { userId: user.id, user };
        res.locals.currentUser = { id: user.id, name: user.name, email: user.email, role: user.role };
        next();
    } catch (error) {
        clearAuthCookie(res);
        return optional ? next() : respondUnauthorized(req, res, "Your session expired. Please sign in again.");
    }
};

export const authenticate = (req, res, next) => resolveAuthentication(req, res, next, false);
export const optionalAuthenticate = (req, res, next) => resolveAuthentication(req, res, next, true);
