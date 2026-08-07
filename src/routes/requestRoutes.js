import { Router } from "express";
import { cancelEquipmentRequest, createEquipmentRequest, decideEquipmentRequest, showDonorRequests, showOrganizationRequests } from "../controllers/requestController.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorizeRoles } from "../middleware/authorize.js";
import { requireVerifiedOrganization } from "../middleware/verifiedOrganization.js";
import { actionRateLimit } from "../middleware/rateLimit.js";
import { verifyCsrfToken } from "../middleware/csrf.js";

export const requestRoutes = Router();
const verifiedNgoOnly = [authenticate, authorizeRoles("ngo"), requireVerifiedOrganization];
const donorOnly = [authenticate, authorizeRoles("donor")];
requestRoutes.get("/ngo/requests", verifiedNgoOnly, showOrganizationRequests);
requestRoutes.post("/ngo/equipment/:id/requests", verifiedNgoOnly, actionRateLimit, verifyCsrfToken, createEquipmentRequest);
requestRoutes.post("/ngo/requests/:requestId/cancel", verifiedNgoOnly, actionRateLimit, verifyCsrfToken, cancelEquipmentRequest);
requestRoutes.get("/donor/requests", donorOnly, showDonorRequests);
requestRoutes.post("/donor/requests/:requestId/:decision", donorOnly, actionRateLimit, verifyCsrfToken, decideEquipmentRequest);
