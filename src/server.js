import { createApp } from "./app.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import { startNotificationWorker } from "./services/notificationWorker.js";
import { logEvent } from "./services/observabilityService.js";

export const startServer = async () => {
    await connectDatabase();
    const app = createApp();
    // Match the setup listener: localhost proxy traffic must use the observed
    // IPv4 peer rather than switching to ::1 on a dual-stack listener.
    const server = app.listen(env.port, env.isProduction ? "0.0.0.0" : undefined);
    try { await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); }); }
    catch (error) { await disconnectDatabase(); throw error; }
    logEvent("server.started");
    const worker = startNotificationWorker();
    let shuttingDown;
    server.shutdown = () => {
        if (!shuttingDown) shuttingDown = (async () => {
            const drained = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
            server.closeIdleConnections();
            await drained;
            await worker.stop();
            await disconnectDatabase();
        })();
        return shuttingDown;
    };
    return server;
};
