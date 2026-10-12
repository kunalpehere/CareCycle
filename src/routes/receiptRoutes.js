import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { authorizeRoles } from "../middleware/authorize.js";
import { requireVerifiedOrganization } from "../middleware/verifiedOrganization.js";
import { actionRateLimit } from "../middleware/rateLimit.js";
import { verifyCsrfToken } from "../middleware/csrf.js";
import { showReceipt, receiptDocument, updateReceipt, listAdministrationReceipts } from "../controllers/receiptController.js";

export const receiptRoutes = Router();
receiptRoutes.get("/admin/receipts", authenticate, authorizeRoles("admin"), listAdministrationReceipts);
for (const role of ["donor", "ngo", "admin"]) {
    const gates = [authenticate, authorizeRoles(role), ...(role === "ngo" ? [requireVerifiedOrganization] : [])];
    const base = `/${role}/requests/:requestId/receipt`;
    receiptRoutes.get(base, gates, showReceipt);
    receiptRoutes.get(`${base}/document`, gates, receiptDocument);
    receiptRoutes.get(`${base}/download`, gates, receiptDocument);
    receiptRoutes.post(`${base}/:action`, gates, actionRateLimit, verifyCsrfToken, role === "admin" ? (req, res) => res.status(403).send("Administration receipt access is read-only.") : updateReceipt);
}
