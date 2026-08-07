import { Router } from "express";
import { submitContact } from "../controllers/contactController.js";
import { authenticate } from "../middleware/authenticate.js";
import { verifyCsrfToken } from "../middleware/csrf.js";
import { actionRateLimit } from "../middleware/rateLimit.js";

export const contactRoutes = Router();
contactRoutes.post("/contact", authenticate, actionRateLimit, verifyCsrfToken, submitContact);
