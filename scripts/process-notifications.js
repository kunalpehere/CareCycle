import { connectDatabase, disconnectDatabase } from "../src/config/database.js";
import { processOutboxBatch } from "../src/services/notificationService.js";
import { processEmailBatch, createNotificationSender } from "../src/services/notificationWorker.js";
import { logEvent, withOperationReference } from "../src/services/observabilityService.js";

await withOperationReference(async () => { try {
    if (process.argv.slice(2).some(arg => arg !== "--once")) throw new Error("Use --once to process one bounded notification batch.");
    await connectDatabase();
    const events = await processOutboxBatch();
    const emails = await processEmailBatch({ send: createNotificationSender() });
    logEvent("task.completed", { eventsProcessed: events, emailsAttempted: emails });
} catch { logEvent("task.failed", { code: "worker_batch_failed" }); process.exitCode = 1; }
finally { await disconnectDatabase(); }
});
