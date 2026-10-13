import { Router } from "express";
import { cancelEquipmentRequest, createEquipmentRequest, decideEquipmentRequest, showDonorRequests, showOrganizationRequests } from "../controllers/requestController.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorizeRoles } from "../middleware/authorize.js";
import { requireVerifiedOrganization } from "../middleware/verifiedOrganization.js";
import { actionRateLimit } from "../middleware/rateLimit.js";
import { verifyCsrfToken } from "../middleware/csrf.js";
import { showPickup, changePickup } from "../controllers/pickupController.js";
import { requireVerifiedEmail } from "../middleware/verifiedEmail.js";

export const requestRoutes = Router();
const verifiedNgoOnly = [authenticate, authorizeRoles("ngo"), requireVerifiedOrganization];
const donorOnly = [authenticate, authorizeRoles("donor")];
for (const [role, gates] of [["donor", donorOnly], ["ngo", verifiedNgoOnly]]) {
    requestRoutes.get(`/${role}/requests/:requestId/pickup`, gates, showPickup);
    requestRoutes.post(`/${role}/requests/:requestId/pickup/:action`, gates, actionRateLimit, verifyCsrfToken, changePickup);
}
requestRoutes.get("/ngo/requests", verifiedNgoOnly, showOrganizationRequests);
requestRoutes.post("/ngo/equipment/:id/requests", verifiedNgoOnly, requireVerifiedEmail, actionRateLimit, verifyCsrfToken, createEquipmentRequest);
requestRoutes.post("/ngo/requests/:requestId/cancel", verifiedNgoOnly, actionRateLimit, verifyCsrfToken, cancelEquipmentRequest);
requestRoutes.get("/donor/requests", donorOnly, showDonorRequests);
requestRoutes.post("/donor/requests/:requestId/:decision", donorOnly, actionRateLimit, verifyCsrfToken, decideEquipmentRequest);
