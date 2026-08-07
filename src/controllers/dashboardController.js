import { getDashboardPath } from "../services/roleService.js";
import { Organization } from "../models/Organization.js";
import { loadAdminDashboardData } from "./adminController.js";

export const redirectToRoleDashboard = (req, res) => res.redirect(getDashboardPath(req.auth.user.role));

export const showNgoDashboard = async (req, res, next) => {
    try {
        const organization = await Organization.findOne({ owner: req.auth.userId }).lean();
        res.render("ngo-dashboard.ejs", { user: req.auth.user, organization, message: String(req.query.message || "") });
    } catch (error) {
        next(error);
    }
};

export const showAdminDashboard = async (req, res, next) => {
    try {
        const data = await loadAdminDashboardData();
        res.render("admin-dashboard.ejs", { user: req.auth.user, message: String(req.query.message || ''), ...data });
    } catch (error) {
        next(error);
    }
};
