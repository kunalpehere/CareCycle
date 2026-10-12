export const runTransaction = async (connection, operation) => {
    const session = await connection.startSession();
    let result;
    try {
        await session.withTransaction(async () => { result = await operation(session); },
            { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
        return result;
    } finally { await session.endSession(); }
};
