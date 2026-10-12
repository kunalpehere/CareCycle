import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { authorizeRoles } from "../middleware/authorize.js";
import { verifyCsrfToken } from "../middleware/csrf.js";
import { actionRateLimit } from "../middleware/rateLimit.js";
import { showNotifications, markNotificationRead, openNotification, updateNotificationPreferences } from "../controllers/notificationController.js";

export const notificationRoutes = Router();
notificationRoutes.use("/notifications", authenticate, authorizeRoles("donor", "ngo", "admin"));
notificationRoutes.get("/notifications", showNotifications);
notificationRoutes.post("/notifications/preferences", actionRateLimit, verifyCsrfToken, updateNotificationPreferences);
notificationRoutes.post("/notifications/:id/read", actionRateLimit, verifyCsrfToken, markNotificationRead);
notificationRoutes.get("/notifications/:id/open", openNotification);
