import { startServer } from "./src/server.js";

startServer().catch((error) => {
    console.error("Unable to start CareCycle:", error.message);
    process.exitCode = 1;
});
