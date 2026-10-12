import { Router } from "express";
import {
    createDonation, listCurrentUserDonations, serveDonationImage, showCreateDonation,
    showDonorDashboard, showEditDonation, updateDonation, withdrawDonation, showQuantityChange, updateQuantity
} from "../controllers/donationController.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorizeRoles } from "../middleware/authorize.js";
import { verifyCsrfToken } from "../middleware/csrf.js";
import { actionRateLimit } from "../middleware/rateLimit.js";
import { uploadDonationImages } from "../services/imageService.js";
import { requireOwnedDonation } from "../middleware/ownership.js";

export const donationRoutes = Router();
const donorOnly = [authenticate, authorizeRoles("donor")];
donationRoutes.get("/donor/dashboard", donorOnly, showDonorDashboard);
donationRoutes.get("/donate", donorOnly, showCreateDonation);
donationRoutes.get("/donateinfo", donorOnly, listCurrentUserDonations);
donationRoutes.get("/donations/images/:filename", donorOnly, serveDonationImage);
donationRoutes.get("/donations/:id/edit", donorOnly, requireOwnedDonation, showEditDonation);
donationRoutes.get("/donations/:id/quantity", donorOnly, requireOwnedDonation, showQuantityChange);
donationRoutes.post("/donations/:id/quantity", donorOnly, requireOwnedDonation, actionRateLimit, verifyCsrfToken, updateQuantity);
donationRoutes.post("/donate", donorOnly, actionRateLimit, uploadDonationImages, verifyCsrfToken, createDonation);
donationRoutes.post("/donations/:id/edit", donorOnly, requireOwnedDonation, actionRateLimit, uploadDonationImages, verifyCsrfToken, updateDonation);
donationRoutes.post("/donations/:id/withdraw", donorOnly, requireOwnedDonation, actionRateLimit, verifyCsrfToken, withdrawDonation);
