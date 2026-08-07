import { Router } from "express";
import {
    createOrganization, serveVerificationDocument, showAdminOrganizationReview, showCreateOrganization,
    showEditOrganization, updateOrganization
} from "../controllers/organizationController.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorizeRoles } from "../middleware/authorize.js";
import { requireOwnedOrganization } from "../middleware/ownership.js";
import { actionRateLimit } from "../middleware/rateLimit.js";
import { verifyCsrfToken } from "../middleware/csrf.js";
import { uploadVerificationDocument } from "../services/verificationDocumentService.js";
import { decideOrganization, showUsers, updateUserStatus } from "../controllers/adminController.js";

export const organizationRoutes = Router();
const ngoOnly = [authenticate, authorizeRoles("ngo")];
organizationRoutes.get("/ngo/organization", ngoOnly, showCreateOrganization);
organizationRoutes.post("/ngo/organization", ngoOnly, actionRateLimit, uploadVerificationDocument, verifyCsrfToken, createOrganization);
organizationRoutes.get("/ngo/organizations/:organizationId/edit", ngoOnly, requireOwnedOrganization, showEditOrganization);
organizationRoutes.post("/ngo/organizations/:organizationId/edit", ngoOnly, requireOwnedOrganization, actionRateLimit, uploadVerificationDocument, verifyCsrfToken, updateOrganization);
organizationRoutes.get("/organizations/:organizationId/verification-document", authenticate, authorizeRoles("ngo", "admin"), serveVerificationDocument);
organizationRoutes.get("/admin/organizations/:organizationId/review", authenticate, authorizeRoles("admin"), showAdminOrganizationReview);
organizationRoutes.post("/admin/organizations/:organizationId/:decision", authenticate, authorizeRoles("admin"), actionRateLimit, verifyCsrfToken, decideOrganization);
organizationRoutes.get("/admin/users", authenticate, authorizeRoles("admin"), showUsers);
organizationRoutes.post("/admin/users/:userId/:status", authenticate, authorizeRoles("admin"), actionRateLimit, verifyCsrfToken, updateUserStatus);
