import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { authorizeRoles } from "../middleware/authorize.js";
import { dependencyReadiness, loadOperationalDiagnostics } from "../services/diagnosticsService.js";

export const healthRoutes = Router();
healthRoutes.use((req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
healthRoutes.get("/live", (req, res) => res.json({ status: "alive" }));
healthRoutes.get("/ready", async (req, res, next) => {
    try { const dependencies = await dependencyReadiness(); res.status(dependencies.ready ? 200 : 503).json({ status: dependencies.ready ? "ready" : "unavailable" }); }
    catch (error) { next(error); }
});
export const diagnosticsRoutes = Router();
diagnosticsRoutes.get("/admin/diagnostics", authenticate, authorizeRoles("admin"), async (req, res, next) => {
    try {
        const diagnostics = await loadOperationalDiagnostics();
        if (req.accepts(["html", "json"]) === "json") return res.json(diagnostics);
        res.render("admin-diagnostics.ejs", { diagnostics });
    } catch (error) { next(error); }
});
