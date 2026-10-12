import { Router } from "express";
import { showAbout, showContact, showHome } from "../controllers/pageController.js";
import { optionalAuthenticate } from "../middleware/authenticate.js";

export const pageRoutes = Router();
pageRoutes.get(["/", "/home"], optionalAuthenticate, showHome);
pageRoutes.get("/about", optionalAuthenticate, showAbout);
pageRoutes.get("/contact", optionalAuthenticate, showContact);
