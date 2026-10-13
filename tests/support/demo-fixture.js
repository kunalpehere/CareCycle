import { startIsolatedDatabase } from "./database.js";
import { createServer } from "node:net";

export const startDemoFixture = async ({ port = 0 } = {}) => {
    if (process.env.NODE_ENV !== "test" || !/^carecycle_test_/.test(process.env.MONGO_DB_NAME || "")) throw new Error("Demo fixtures require the isolated test runner.");
    const database = await startIsolatedDatabase();
    const portProbe = createServer();
    await new Promise(resolve => portProbe.listen(0, "127.0.0.1", resolve));
    const runtimePort = portProbe.address().port;
    await new Promise(resolve => portProbe.close(resolve));
    Object.assign(process.env, { DEMO_MODE: "true", MONGO_URI: database.getUri(), TRUST_PROXY: "127.0.0.1", PORT: String(runtimePort) });
    let server, mongoose, worker;
    const close = async () => {
        if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
        if (worker) await worker.stop();
        if (mongoose) await mongoose.disconnect();
        await database.stop();
    };
    try {
        mongoose = (await import("mongoose")).default;
        mongoose.set("strictQuery", true);
        const { env } = await import("../../src/config/env.js");
        const { prepareDemo, DEMO_IDS } = await import("../../src/services/demoService.js");
        await mongoose.connect(env.mongoUri, { dbName: env.mongoDbName, autoIndex: false, autoCreate: false });
        await prepareDemo(mongoose.connection, { confirmation: env.mongoDbName });
        // Normal connection path must accept initialized indexes and marker.
        await mongoose.disconnect();
        const { connectDatabase } = await import("../../src/config/database.js");
        await connectDatabase();
        const { createApp } = await import("../../src/app.js");
        const { startNotificationWorker } = await import("../../src/services/notificationWorker.js");
        worker = startNotificationWorker({ intervalMs: 100, send: null });
        server = createApp().listen(port, "127.0.0.1");
        await new Promise(resolve => server.once("listening", resolve));
        const origin = `http://127.0.0.1:${server.address().port}`;
        let sequence = 10;
        const client = () => {
            const cookies = new Map(); const address = `192.0.2.${++sequence}`;
            let csrf = "";
            const request = async (route, options = {}) => {
                const response = await fetch(origin + route, { redirect: "manual", ...options, headers: { Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; "), "X-Forwarded-For": address, ...options.headers } });
                for (const cookie of response.headers.getSetCookie()) { const part = cookie.split(";")[0]; const split = part.indexOf("="); cookies.set(part.slice(0, split), part.slice(split + 1)); }
                const text = await response.text();
                csrf = text.match(/name="_csrf" value="([^"]+)"/)?.[1] || csrf;
                return { status: response.status, text, headers: response.headers };
            };
            return { get: route => request(route), post: (route, body = {}) => request(route, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ _csrf: csrf, ...body }) }), request };
        };
        return { close, origin, mongoose, prepareDemo, DEMO_IDS, client, stopWorker: () => worker.stop() };
    } catch (error) { await close(); throw error; }
};
