import { env } from "../src/config/env.js";

try {
    for (const route of ["/health/live", "/health/ready", ...(env.demoMode ? ["/demo", "/admin/login"] : [])]) {
        const response = await fetch(env.appUrl + route, { redirect: "manual", signal: AbortSignal.timeout(10000) });
        const text = await response.text();
        const expected = route === "/admin/login" ? 403 : 200;
        if (response.status !== expected) throw new Error();
        if (route.startsWith("/health/") && (JSON.parse(text).status !== (route.endsWith("live") ? "alive" : "ready") || response.headers.has("set-cookie"))) throw new Error();
        if (route === "/demo" && (!text.includes("shared synthetic demo") || !response.headers.get("cache-control")?.includes("no-store"))) throw new Error();
        if (env.isProduction && !response.headers.has("strict-transport-security")) throw new Error();
        console.log(`PASS ${route}`);
    }
    console.log("Basic deployment probes passed. Complete the manual hosted workflow and restart checks in docs/staging-deployment.md.");
} catch { console.error("Deployment probes failed. Check trusted HTTPS routing, readiness, demo initialization and availability. Connection details are not printed."); process.exitCode = 1; }
