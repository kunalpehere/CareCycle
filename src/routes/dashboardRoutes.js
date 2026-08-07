import { Router } from "express";
import { redirectToRoleDashboard, showAdminDashboard, showNgoDashboard } from "../controllers/dashboardController.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorizeRoles } from "../middleware/authorize.js";

export const dashboardRoutes = Router();
dashboardRoutes.get("/dashboard", authenticate, redirectToRoleDashboard);
dashboardRoutes.get("/ngo/dashboard", authenticate, authorizeRoles("ngo"), showNgoDashboard);
dashboardRoutes.get("/admin/dashboard", authenticate, authorizeRoles("admin"), showAdminDashboard);
