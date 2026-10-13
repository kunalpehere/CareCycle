import { User } from "../models/User.js";
import { issueAccountCredential, consumeAccountCredential, hasAccountCredential, validRecoveryPassword } from "../services/accountRecoveryService.js";
import { clearAuthCookie } from "../services/authCookieService.js";

const render = (res, mode, message = "", extra = {}) => res.render("account-recovery.ejs", { mode, message, id: "", token: "", ...extra });
export const privateRecoveryPage = (req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
};
export const showForgotPassword = (req, res) => render(res, "forgot");
export const requestPasswordReset = (req, res) => {
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    // Respond independently of lookup and provider latency. Never disclose account eligibility.
    if (email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        User.findOne({ email, status: "active" }).then(user => user && issueAccountCredential(user, "reset"))
            .catch(() => { console.error("Account recovery request could not be processed."); });
    }
    return render(res, "forgot", "If an eligible account exists, a reset email will be attempted. Check your inbox and spam folder. Wait at least one minute before retrying. If no email arrives, contact CareCycle through the Contact page.");
};
export const showResetPassword = async (req, res, next) => {
    try {
        const { id, token } = req.query;
        if (!await hasAccountCredential(id, "reset", token)) return render(res.status(400), "invalid", "This link is invalid, expired, or already used. Request a new link.");
        render(res, "reset", "", { id, token });
    } catch (error) { next(error); }
};
export const resetPassword = async (req, res, next) => {
    try {
        const { id, token, password, confirmation } = req.body;
        if (!validRecoveryPassword(password) || password !== confirmation) return render(res.status(400), "reset", "Use at least 8 characters and no more than 72 UTF-8 bytes. Both password entries must match.", {
            id: typeof id === "string" ? id : "", token: typeof token === "string" ? token : ""
        });
        if (!await consumeAccountCredential({ id, token, password, purpose: "reset" })) return render(res.status(400), "invalid", "This link is invalid, expired, or already used. Request a new link.");
        clearAuthCookie(res);
        req.session.destroy(error => {
            if (error) return next(error);
            res.redirect("/login?message=Password%20updated.%20Sign%20in%20again.%20Administrators%20must%20use%20the%20admin%20portal.");
        });
    } catch (error) { next(error); }
};
export const showEmailVerification = (req, res) => render(res, "email", req.auth.user.emailVerifiedAt ? "Your email address is verified." : "Verify your email before creating a new listing or equipment request. You can still manage existing commitments. Organization approval is a separate review.");
export const resendVerification = async (req, res, next) => {
    try {
        const result = await issueAccountCredential(req.auth.user, "verification");
        const message = req.auth.user.emailVerifiedAt ? "Your email address is already verified." : result.sent ? "Verification email sent. Check your inbox and spam folder." : result.reason === "cooldown-or-ineligible" ? "Wait at least one minute before requesting another verification email." : "The verification email could not be sent. Try again after one minute. If delivery remains unavailable, use the Contact page for help.";
        render(res, "email", message);
    } catch (error) { next(error); }
};
export const showVerifyEmail = async (req, res, next) => {
    try {
        const { id, token } = req.query;
        if (!await hasAccountCredential(id, "verification", token)) return render(res.status(400), "invalid", "This verification link is invalid, expired, or already used.");
        render(res, "verify", "Confirm that you want to verify this email address.", { id, token });
    } catch (error) { next(error); }
};
export const verifyEmail = async (req, res, next) => {
    try {
        const success = await consumeAccountCredential({ ...req.body, purpose: "verification" });
        render(success ? res : res.status(400), success ? "done" : "invalid", success ? "Email verified. Sign in to continue." : "This verification link is invalid, expired, or already used.");
    } catch (error) { next(error); }
};
