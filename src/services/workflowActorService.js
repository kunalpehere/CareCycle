import { User } from "../models/User.js";

// Write, rather than only read, to serialize workflow mutations with suspension.
export const guardActiveActor = async (id, session, role) => {
    const result = await User.updateOne({ _id: id, ...(role ? { role } : {}),
        $or: [{ status: "active" }, { status: { $exists: false } }] }, { $inc: { workflowGuard: 1 } }, { session });
    return result.matchedCount === 1;
};
