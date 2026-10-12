import { connectDatabase, disconnectDatabase } from "../src/config/database.js";
import { processOutboxBatch } from "../src/services/notificationService.js";
import { processEmailBatch, createNotificationSender } from "../src/services/notificationWorker.js";

try {
    if (process.argv.slice(2).some(arg => arg !== "--once")) throw new Error("Use --once to process one bounded notification batch.");
    await connectDatabase();
    const events = await processOutboxBatch();
    const emails = await processEmailBatch({ send: createNotificationSender() });
    console.log(`Processed ${events} lifecycle events; attempted ${emails} opted-in notification emails.`);
} catch { console.error("Notification batch failed. Check configuration and database readiness; pending work is retained."); process.exitCode = 1; }
finally { await disconnectDatabase(); }
