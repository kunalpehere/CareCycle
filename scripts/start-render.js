import { renderOrigin } from "../src/config/renderPlatform.js";

try {
    renderOrigin(process.env);
    const args = process.argv.slice(2);
    if (args.length !== 2 || args[0] !== "--initialize" || args[1] !== process.env.MONGO_DB_NAME) throw new Error("Exact synthetic database confirmation is required.");
    if (!process.env.TRUST_PROXY || process.env.TRUST_PROXY === "false") {
        const { startRenderSetup } = await import("../src/services/renderSetupService.js");
        const server = await startRenderSetup();
        let stopping = false;
        const stop = () => {
            if (stopping) return; stopping = true;
            const deadline = setTimeout(() => process.exit(1), 10000);
            server.close(() => clearTimeout(deadline)); server.closeIdleConnections();
        };
        process.once("SIGTERM", stop); process.once("SIGINT", stop);
    } else {
        const { initializeRenderDemo } = await import("../src/services/renderDemoService.js");
        await initializeRenderDemo(args[1]);
        await import("../index.js");
    }
} catch { console.error("Render setup failed. Check provider metadata, exact demo database confirmation, configuration and stopped maintenance. Supplied values are not printed."); process.exitCode = 1; }
