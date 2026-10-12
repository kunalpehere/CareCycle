import bcrypt from "bcrypt";
import { User } from "../models/User.js";
import { createAccessToken } from "../services/tokenService.js";
import { clearAuthCookie, setAuthCookie } from "../services/authCookieService.js";
import { validateAdminAccessRequest, validateLogin, validateRegistration } from "../validators/input.js";
import { getDashboardPath } from "../services/roleService.js";
import { AdminAccessRequest } from "../models/AdminAccessRequest.js";
import { LOGIN_REALMS, roleCanUseRealm } from "../services/loginRealmService.js";

export const showRegister = (req, res) => res.render("register.ejs", { message: "", selectedRole: req.query.role === "ngo" ? "ngo" : "donor" });
export const showLogin = (req, res) => res.render("login.ejs", { message: String(req.query.message || "Welcome back!") });
export const showAdminLogin = (req, res) => res.render("admin-login.ejs", { message: String(req.query.message || "Authorized CareCycle administrators only.") });
export const showAdminAccessRequest = (req, res) => res.render("admin-access-request.ejs", { message: String(req.query.message || "") });

const regenerateSession = (req) => new Promise((resolve, reject) => {
    req.session.regenerate((error) => error ? reject(error) : resolve());
});

export const register = async (req, res, next) => {
    try {
        const { valid, value } = validateRegistration(req.body);
        if (!valid) return res.status(400).render("register.ejs", { message: "Select Donor or NGO member, enter valid details, and use a password of at least 8 characters." });

        const existingUser = await User.findOne({ email: value.email }).select("_id");
        if (existingUser) return res.status(409).render("login.ejs", { message: "Account already exists. Please login." });

        const password = await bcrypt.hash(value.password, 12);
        const user = await User.create({ name: value.name, email: value.email, password, role: value.role });
        await regenerateSession(req);
        setAuthCookie(res, createAccessToken(user.id));
        res.redirect(getDashboardPath(user.role));
    } catch (error) {
        if (error?.code === 11000) return res.status(409).render("login.ejs", { message: "Account already exists. Please login." });
        next(error);
    }
};

export const login = async (req, res, next) => {
    try {
        const { valid, value } = validateLogin(req.body);
        if (!valid) return res.status(400).render("login.ejs", { message: "Enter a valid email and password." });

        const user = await User.findOne({ email: value.email, role: { $in: LOGIN_REALMS.participant } }).select("+password");
        const matches = user ? await bcrypt.compare(value.password, user.password) : false;
        if (!matches) return res.status(401).render("login.ejs", { message: "Invalid email or password." });
        if (user.status === "suspended" || user.status === "deleted") return res.status(403).render("login.ejs", { message: "This participant account is suspended. Contact CareCycle support." });
        if (!roleCanUseRealm(user.role, "participant")) return res.status(403).render("login.ejs", { message: "Use the correct sign-in portal for this account." });

        user.lastLoginAt = new Date();
        await user.save();
        await regenerateSession(req);
        setAuthCookie(res, createAccessToken(user.id));
        res.redirect(getDashboardPath(user.role));
    } catch (error) {
        next(error);
    }
};

export const adminLogin = async (req, res, next) => {
    try {
        const { valid, value } = validateLogin(req.body);
        if (!valid) return res.status(400).render('admin-login.ejs', { message: 'Enter a valid administrator email and password.' });
        const user = await User.findOne({ email: value.email, role: { $in: LOGIN_REALMS.administration } }).select('+password');
        const matches = user ? await bcrypt.compare(value.password, user.password) : false;
        if (!matches) return res.status(401).render('admin-login.ejs', { message: 'Invalid administrator credentials.' });
        if (user.status !== 'active') return res.status(403).render('admin-login.ejs', { message: 'This CareCycle Administration account is unavailable.' });
        user.lastLoginAt = new Date(); await user.save(); await regenerateSession(req);
        setAuthCookie(res, createAccessToken(user.id)); res.redirect('/admin/dashboard');
    } catch (error) { next(error); }
};

export const requestAdminAccess = async (req, res, next) => {
    try {
        const { valid, value } = validateAdminAccessRequest(req.body);
        if (!valid) return res.status(400).render('admin-access-request.ejs', { message: 'Complete every field using a valid work email and a detailed justification.' });
        const existingAdmin = await User.exists({ email: value.workEmail, role: 'admin' });
        if (existingAdmin) return res.redirect('/admin/login?message=An%20administrator%20account%20already%20exists%20for%20this%20email.');
        await AdminAccessRequest.create(value);
        res.redirect('/admin/login?message=Access%20request%20recorded.%20A%20CareCycle%20supervisor%20must%20review%20and%20provision%20the%20account.');
    } catch (error) {
        if (error?.code === 11000) return res.redirect('/admin/login?message=An%20access%20request%20already%20exists%20for%20this%20email.');
        next(error);
    }
};

export const logout = (req, res, next) => {
    clearAuthCookie(res);
    req.session.destroy((error) => {
        if (error) return next(error);
        res.redirect("/login");
    });
};
