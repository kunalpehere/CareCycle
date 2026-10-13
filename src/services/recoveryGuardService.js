export class RecoveryQuarantineError extends Error {
    constructor() { super("This restored database is quarantined. Complete recovery verification and operational review before starting CareCycle."); this.name = "RecoveryQuarantineError"; }
}
export const assertRecoveryReleased = async connection => {
    const marker = await connection.db.collection("operational_recovery").findOne({ _id: "restore" }, { projection: { state: 1 }, maxTimeMS: 1000 });
    if (marker && marker.state !== "released") throw new RecoveryQuarantineError();
};
