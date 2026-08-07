import { createApp } from "./app.js";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";

export const startServer = async () => {
    await connectDatabase();
    const app = createApp();
    return app.listen(env.port, () => console.log(`CareCycle server listening on port ${env.port}`));
};
