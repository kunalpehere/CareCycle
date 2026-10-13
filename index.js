import { logEvent, withOperationReference } from "./src/services/observabilityService.js";

withOperationReference(async () => {
    try {
        const { startServer } = await import("./src/server.js");
        const server = await startServer();
        let stopping = false;
        const stop = () => {
            if (stopping) return;
            stopping = true;
            const deadline = setTimeout(() => { server.closeAllConnections(); process.exit(1); }, 25000);
            server.shutdown().catch(() => { logEvent("task.failed", { code: "internal_failure" }); process.exitCode = 1; }).finally(() => clearTimeout(deadline));
        };
        process.once("SIGTERM", stop);
        process.once("SIGINT", stop);
    }
    catch (error) { logEvent("startup.failed", { code: error.name === "ConfigurationError" ? "configuration_invalid" : error.name === "RecoveryQuarantineError" ? "recovery_quarantined" : "startup_failed" }); process.exitCode = 1; }
});
