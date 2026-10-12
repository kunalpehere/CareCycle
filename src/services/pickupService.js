import { DonationRequest } from "../models/DonationRequest.js";

export const pickupVersion = value => typeof value === "string" && /^(0|[1-9]\d*)$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;

// Resolve wall-clock minutes using the supplied IANA zone, never the server zone.
// Multiple matches (DST overlap) and zero matches (DST gap) require a new time.
export const zonedPickupTime = (local, timeZone) => {
    if (typeof local !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw new Error("Enter a valid local date and time.");
    if (typeof timeZone !== "string" || timeZone.length > 100 || !/^(UTC|[A-Za-z_]+\/[A-Za-z0-9_+\-/]+)$/.test(timeZone)) throw new Error("Enter an IANA time zone such as Asia/Kolkata.");
    let formatter;
    try { formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }); }
    catch { throw new Error("Enter a recognized IANA time zone."); }
    const wall = Date.parse(`${local}:00Z`);
    if (!Number.isFinite(wall) || new Date(wall).toISOString().slice(0, 16) !== local || Number(local.slice(0, 4)) < 2000) throw new Error("Enter a valid local date and time.");
    const asWall = millis => {
        const parts = Object.fromEntries(formatter.formatToParts(new Date(millis)).map(part => [part.type, part.value]));
        return Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00Z`);
    };
    const offsets = new Set();
    for (let hour = -36; hour <= 36; hour++) {
        const sample = wall + hour * 3600000;
        offsets.add(asWall(sample) - sample);
    }
    const matches = [...offsets].map(offset => wall - offset).filter(candidate => asWall(candidate) === wall);
    if (matches.length !== 1) throw new Error("This local time is skipped or occurs twice during a clock change. Choose another time.");
    return new Date(matches[0]);
};

export const validatePickupProposal = (body, now = new Date()) => {
    try {
        const start = zonedPickupTime(body.localStart, body.timeZone);
        const end = zonedPickupTime(body.localEnd, body.timeZone);
        if (start <= now || end <= start) throw new Error("Choose a future pickup window with an end after its start.");
        if (typeof body.address !== "string" || body.address.trim().length < 5 || body.address.trim().length > 500) throw new Error("Enter a pickup address between 5 and 500 characters.");
        if (body.instructions !== undefined && (typeof body.instructions !== "string" || body.instructions.trim().length > 1000)) throw new Error("Coordination instructions cannot exceed 1000 characters.");
        return { valid: true, value: { start, end, timeZone: body.timeZone, localStart: body.localStart, localEnd: body.localEnd, address: body.address.trim(), instructions: (body.instructions || "").trim() } };
    } catch (error) { return { valid: false, message: error.message }; }
};

export const updatePickup = async ({ request, version, actorId, actorRole, action, proposal, now = new Date() }) => {
    if (request.status !== "accepted" || version === null || version !== (request.pickup?.version || 0)) return false;
    const current = request.pickup;
    if (action === "confirm" && (!current || current.status !== "proposed" || current.proposal.proposerRole === actorRole || String(current.proposal.proposedBy) === String(actorId) || current.proposal.start <= now)) return false;
    if (action === "propose" && (!proposal || proposal.start <= now || proposal.end <= proposal.start)) return false;
    if (!["propose", "confirm"].includes(action)) return false;
    const nextProposal = action === "propose" ? { ...proposal, proposedBy: actorId, proposerRole: actorRole } : current.proposal;
    const event = { action: action === "confirm" ? "confirmed" : current ? "rescheduled" : "proposed", actor: actorId, actorRole, at: now, version: version + 1, proposal: nextProposal };
    const filter = { _id: request._id, status: "accepted", ...(version ? { "pickup.version": version } : { pickup: null }) };
    const fields = { "pickup.status": action === "confirm" ? "confirmed" : "proposed", "pickup.version": version + 1, "pickup.proposal": nextProposal,
        "pickup.confirmedBy": action === "confirm" ? actorId : null, "pickup.confirmedAt": action === "confirm" ? now : null };
    // MongoDB cannot set children of null. The initial write creates the whole plan.
    const update = version ? { $set: fields, $push: { "pickup.history": event } } : { $set: { pickup: { status: "proposed", version: 1, proposal: nextProposal, confirmedBy: null, confirmedAt: null, history: [event] } } };
    return Boolean(await DonationRequest.findOneAndUpdate(filter, update, { runValidators: true, new: true }));
};

export const formatPickupTime = (value, timeZone) => new Intl.DateTimeFormat("en-GB", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
