import { logEvent, withOperationReference } from "./src/services/observabilityService.js";

withOperationReference(async () => {
    try { const { startServer } = await import("./src/server.js"); await startServer(); }
    catch (error) { logEvent("startup.failed", { code: error.name === "ConfigurationError" ? "configuration_invalid" : "startup_failed" }); process.exitCode = 1; }
});
