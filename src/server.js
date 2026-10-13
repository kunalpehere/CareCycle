import { createApp } from "./app.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import { startNotificationWorker } from "./services/notificationWorker.js";
import { logEvent } from "./services/observabilityService.js";

export const startServer = async () => {
    await connectDatabase();
    const app = createApp();
    const server = app.listen(env.port);
    try { await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); }); }
    catch (error) { await disconnectDatabase(); throw error; }
    logEvent("server.started");
    const worker = startNotificationWorker();
    server.once("close", () => { void worker.stop(); });
    return server;
};
