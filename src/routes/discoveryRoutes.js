import { Router } from "express";
import { serveDiscoveryImage, showEquipmentDetail, showEquipmentDiscovery } from "../controllers/discoveryController.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorizeRoles } from "../middleware/authorize.js";
import { requireVerifiedOrganization } from "../middleware/verifiedOrganization.js";

export const discoveryRoutes = Router();
const verifiedNgoOnly = [authenticate, authorizeRoles("ngo"), requireVerifiedOrganization];
discoveryRoutes.get("/ngo/equipment", verifiedNgoOnly, showEquipmentDiscovery);
discoveryRoutes.get("/ngo/equipment/:id", verifiedNgoOnly, showEquipmentDetail);
discoveryRoutes.get("/ngo/equipment/:id/images/:filename", verifiedNgoOnly, serveDiscoveryImage);
