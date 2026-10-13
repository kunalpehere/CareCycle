import { connectDatabase, disconnectDatabase } from "../../src/config/database.js";
import { createApp } from "../../src/app.js";
if (process.env.NODE_ENV !== "test" || !/^carecycle_test_/.test(process.env.MONGO_DB_NAME || "") || !process.send) throw new Error("Security instances require the isolated IPC harness.");
await connectDatabase();
const server = createApp().listen(0, "127.0.0.1");
await new Promise(resolve => server.once("listening", resolve));
process.send({ origin: `http://127.0.0.1:${server.address().port}` });
process.on("message", async message => {
    if (message !== "stop") return;
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await disconnectDatabase(); process.exit(0);
});
