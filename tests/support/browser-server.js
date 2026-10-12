import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startIsolatedDatabase } from "./database.js";
import { isolatedTestEnvironment } from "./environment.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const runtimeRoot = path.join(root, "artifacts/runtime");
await mkdir(runtimeRoot, { recursive: true });
const runtime = await mkdtemp(path.join(runtimeRoot, "browser-"));
Object.assign(process.env, isolatedTestEnvironment());
let database, server, disconnect, notificationWorker;
let stopping = false;
const stop = async () => {
    if (stopping) return;
    stopping = true;
    if (notificationWorker) await notificationWorker.stop();
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (disconnect) await disconnect();
    if (database) await database.stop();
    process.chdir(root);
    await rm(runtime, { recursive: true, force: true });
};
try {
    database = await startIsolatedDatabase();
    process.env.MONGO_URI = database.getUri();
    process.env.PORT = "4183";
    process.env.APP_URL = "http://127.0.0.1:4183";
    // Distinct synthetic client addresses isolate each viewport's real rate limits.
    process.env.TRUST_PROXY = "127.0.0.1";
    await cp(path.join(root, "views"), path.join(runtime, "views"), { recursive: true });
    await cp(path.join(root, "public"), path.join(runtime, "public"), { recursive: true });
    // dotenv sees no .env, and all upload paths are within disposable runtime.
    process.chdir(runtime);
    const { createApp } = await import("../../src/app.js");
    const { connectDatabase, disconnectDatabase } = await import("../../src/config/database.js");
    disconnect = disconnectDatabase;
    await connectDatabase();
    const { seedMatchingBrowserFixtures } = await import("./matching-browser-fixtures.js");
    await seedMatchingBrowserFixtures();
    const { seedDonorWorkspaceBrowserFixtures } = await import("./donor-workspace-browser-fixtures.js");
    await seedDonorWorkspaceBrowserFixtures();
    const { startNotificationWorker } = await import("../../src/services/notificationWorker.js");
    notificationWorker = startNotificationWorker({ intervalMs: 250, send: null });
    server = createApp().listen(4183, "127.0.0.1");
    await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
    console.log("Isolated browser test app listening on 127.0.0.1:4183");
    process.once("SIGTERM", () => stop().then(() => process.exit(0)));
    process.once("SIGINT", () => stop().then(() => process.exit(0)));
} catch (error) {
    console.error(`Browser test server failed: ${error.message}`);
    await stop();
    process.exitCode = 1;
}
