import { Router } from "express";
import { showAbout, showContact, showHome } from "../controllers/pageController.js";
import { authenticate } from "../middleware/authenticate.js";

export const pageRoutes = Router();
pageRoutes.get(["/", "/home"], authenticate, showHome);
pageRoutes.get("/about", authenticate, showAbout);
pageRoutes.get("/contact", authenticate, showContact);
