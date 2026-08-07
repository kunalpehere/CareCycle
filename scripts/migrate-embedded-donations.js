import { connectDatabase, disconnectDatabase } from "../src/config/database.js";
import { Donation, EQUIPMENT_CONDITIONS, EQUIPMENT_TYPES } from "../src/models/Donation.js";
import { User } from "../src/models/User.js";

const migrate = async () => {
    await connectDatabase();
    const cursor = User.collection.find({ products: { $exists: true, $type: "array" } });
    let usersMigrated = 0;
    let donationsMigrated = 0;
    let usersSkipped = 0;

    for await (const user of cursor) {
        const products = user.products || [];
        const normalized = products.map((product, index) => ({
            equipment: String(product.equipment || "").trim().toLowerCase(),
            condition: String(product.quality || "").trim().toLowerCase(),
            createdAt: product.createdAt || user._id.getTimestamp(),
            legacySourceKey: `${user._id}:${index}`
        }));
        const allValid = normalized.every((item) => EQUIPMENT_TYPES.includes(item.equipment) && EQUIPMENT_CONDITIONS.includes(item.condition));
        if (!allValid) {
            usersSkipped += 1;
            console.warn(`Skipped user ${user._id}: one or more legacy donations contain unsupported values.`);
            continue;
        }

        if (normalized.length > 0) {
            await Donation.bulkWrite(normalized.map((item) => ({
                updateOne: {
                    filter: { legacySourceKey: item.legacySourceKey },
                    update: { $setOnInsert: { ...item, donor: user._id, status: "available", updatedAt: item.createdAt } },
                    upsert: true
                }
            })));
        }
        await User.collection.updateOne(
            { _id: user._id },
            { $unset: { products: "", donor: "" }, $set: { role: "donor", status: "active", updatedAt: new Date() } }
        );
        usersMigrated += 1;
        donationsMigrated += normalized.length;
    }

    console.log(`Migration complete: ${usersMigrated} users and ${donationsMigrated} donation records migrated; ${usersSkipped} users skipped.`);
};

migrate()
    .catch((error) => {
        console.error("Migration failed:", error.message);
        process.exitCode = 1;
    })
    .finally(disconnectDatabase);
