export class DatabaseTopologyError extends Error {
    constructor() {
        super("MONGO_REQUIRE_REPLICA_SET requires a writable MongoDB replica-set primary with session support. Follow docs/runtime-configuration.md; a standalone server is not supported for transactional matching.");
        this.name = "DatabaseTopologyError";
    }
}

export const verifyReplicaSet = async (connection, required) => {
    if (!required) return;
    const hello = await connection.db.admin().command({ hello: 1, maxTimeMS: 10000 });
    if (!hello.setName || !hello.isWritablePrimary || typeof hello.logicalSessionTimeoutMinutes !== "number") throw new DatabaseTopologyError();
};
