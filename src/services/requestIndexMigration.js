import { runTransaction } from "./transactionService.js";
import { BLOCKING_REQUEST_STATUSES, REQUEST_INDEX_NAME, REQUEST_INDEX_FILTER, isRequestPairIndex, isCurrentRequestIndex } from "./requestPolicy.js";

export const migrateRequestIndex = async (connection, { apply = false } = {}) => {
    const exists = await connection.db.listCollections({ name: "donation_requests" }, { nameOnly: true }).hasNext();
    const collection = connection.collection("donation_requests");
    const indexes = exists ? await collection.indexes() : [];
    const oldIndexes = indexes.filter(index => isRequestPairIndex(index) && index.unique && !index.partialFilterExpression && !index.sparse);
    const incompatible = indexes.filter(index => (index.name === REQUEST_INDEX_NAME && !isCurrentRequestIndex(index)) ||
        (isRequestPairIndex(index) && index.unique && !isCurrentRequestIndex(index) && !oldIndexes.includes(index)));
    const report = await runTransaction(connection, async session => {
        const records = exists ? await collection.find({}, { session, projection: { donation: 1, organization: 1, status: 1 } }).toArray() : [];
        const pairs = new Map();
        const invalid = [];
        for (const record of records) {
            if (!["ObjectID", "ObjectId"].includes(record.donation?._bsontype) || !["ObjectID", "ObjectId"].includes(record.organization?._bsontype) ||
                ![...BLOCKING_REQUEST_STATUSES, "rejected", "cancelled"].includes(record.status)) { invalid.push(String(record._id)); continue; }
            if (!BLOCKING_REQUEST_STATUSES.includes(record.status)) continue;
            const key = `${record.donation}:${record.organization}`;
            if (!pairs.has(key)) pairs.set(key, []);
            pairs.get(key).push(String(record._id));
        }
        return { mode: apply ? "apply" : "dry-run", scanned: records.length, invalidRecords: invalid,
            conflictingRequestIds: [...pairs.values()].filter(ids => ids.length > 1), incompatibleIndexes: incompatible.map(index => index.name),
            create: !indexes.some(isCurrentRequestIndex), drop: oldIndexes.map(index => index.name), applied: false };
    });
    if (!apply || report.invalidRecords.length || report.conflictingRequestIds.length || report.incompatibleIndexes.length) return report;
    // DDL is deliberately ordered, not claimed to be transactional. Writers must
    // be stopped. Replacement exists before any old constraint is removed.
    if (!exists) await connection.db.createCollection("donation_requests");
    if (report.create) await collection.createIndex({ donation: 1, organization: 1 },
        { name: REQUEST_INDEX_NAME, unique: true, partialFilterExpression: REQUEST_INDEX_FILTER });
    for (const name of report.drop) await collection.dropIndex(name);
    report.applied = report.create || report.drop.length > 0;
    return report;
};
