import { Router } from "express";
import { adminLogin, login, logout, register, requestAdminAccess, showAdminAccessRequest, showAdminLogin, showLogin, showRegister } from "../controllers/authController.js";
import { authRateLimit } from "../middleware/rateLimit.js";
import { verifyCsrfToken } from "../middleware/csrf.js";
import { guestOnly } from "../middleware/guestOnly.js";

export const authRoutes = Router();
authRoutes.get("/register", guestOnly, showRegister);
authRoutes.get("/login", guestOnly, showLogin);
authRoutes.get("/admin/login", guestOnly, showAdminLogin);
authRoutes.get("/admin/access-request", guestOnly, showAdminAccessRequest);
authRoutes.post("/register", authRateLimit, verifyCsrfToken, register);
authRoutes.post("/login", authRateLimit, verifyCsrfToken, login);
authRoutes.post("/admin/login", authRateLimit, verifyCsrfToken, adminLogin);
authRoutes.post("/admin/access-request", authRateLimit, verifyCsrfToken, requestAdminAccess);
authRoutes.post("/logout", verifyCsrfToken, logout);
