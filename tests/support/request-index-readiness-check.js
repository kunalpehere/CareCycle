import { connectDatabase, disconnectDatabase } from "../../src/config/database.js";
import { RequestIndexError } from "../../src/services/requestPolicy.js";

try {
    await connectDatabase();
    if (process.argv.includes("--ready")) console.log("Migrated request index passed startup readiness.");
    else { console.error("Legacy broad index was unexpectedly allowed at startup."); process.exitCode = 1; }
} catch (error) {
    if (process.argv.includes("--ready") || !(error instanceof RequestIndexError)) { console.error("Unexpected startup error type."); process.exitCode = 1; }
    else console.log(error.message);
} finally { await disconnectDatabase(); }
