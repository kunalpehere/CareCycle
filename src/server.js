import { createApp } from "./app.js";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import { startNotificationWorker } from "./services/notificationWorker.js";

export const startServer = async () => {
    await connectDatabase();
    const app = createApp();
    const server = app.listen(env.port, () => console.log(`CareCycle server listening on port ${env.port}`));
    const worker = startNotificationWorker();
    server.once("close", () => { void worker.stop(); });
    return server;
};
