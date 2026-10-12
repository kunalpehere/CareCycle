import { createHash } from "node:crypto";
import { LifecycleEvent } from "../models/LifecycleEvent.js";
import { Notification } from "../models/Notification.js";
import { Donation } from "../models/Donation.js";
import { DonationRequest } from "../models/DonationRequest.js";
import { Organization } from "../models/Organization.js";
import { User } from "../models/User.js";
import { runTransaction } from "./transactionService.js";

export const notificationTitles = Object.freeze({
    request_submitted: "Equipment request submitted", request_accepted: "Equipment request accepted", request_rejected: "Equipment request rejected", request_cancelled: "Equipment request cancelled",
    pickup_proposed: "Pickup proposed", pickup_rescheduled: "Pickup rescheduled", pickup_confirmed: "Pickup confirmed", pickup_missed: "Missed pickup reported", pickup_disputed: "Pickup report disputed", pickup_resolved: "Pickup disagreement withdrawn", pickup_cancelled: "Accepted request cancelled",
    handed_over: "Handover recorded. NGO confirmation required", acknowledged: "Equipment receipt acknowledged", receipt_disputed: "Equipment receipt discrepancy reported", resolution_proposed: "Receipt resolution proposed", receipt_resolved: "Equipment receipt resolution confirmed", remainder_proposed: "Remaining-unit release proposed", remainder_released: "Remaining reservation released", remainder_withdrawn: "Remaining-unit release proposal withdrawn",
    receipt_issued: "Donation receipt issued", receipt_outcome_updated: "Receipt outcome note updated", receipt_amendment_proposed: "Receipt name correction proposed", receipt_amendment_confirmed: "Receipt name correction confirmed", receipt_amendment_withdrawn: "Receipt correction proposal withdrawn",
    organization_submitted: "Organization application submitted", organization_verified: "Organization verified", organization_rejected: "Organization application needs corrections"
});
export const notificationKey = value => createHash("sha256").update(value).digest("hex");

const recordEvent = async ({ key, kind, resourceType, resourceId, recipients, session }) => {
    if (!session || !Object.hasOwn(notificationTitles, kind)) throw new Error("Lifecycle events require a transaction and a supported event kind.");
    const unique = [...new Map(recipients.filter(value => value.user).map(value => [String(value.user), value])).values()];
    await LifecycleEvent.updateOne({ _id: notificationKey(`${resourceType}:${resourceId}:${key}`) }, { $setOnInsert: { kind, resourceType, resourceId, recipients: unique, createdAt: new Date(), processedAt: null } }, { upsert: true, session });
};
export const recordRequestEvent = async ({ request, kind, key, session }) => {
    const donation = await Donation.findById(request.donation).select("donor").session(session).lean();
    const organization = await Organization.findById(request.organization).select("owner").session(session).lean();
    const donorId = request.receipt?.donorId || donation?.donor;
    await recordEvent({ key, kind, resourceType: "request", resourceId: request._id, session, recipients: [
        { user: donorId, role: "donor", href: kind.startsWith("receipt_") && ["receipt_issued", "receipt_outcome_updated", "receipt_amendment_proposed", "receipt_amendment_confirmed", "receipt_amendment_withdrawn"].includes(kind) ? `/donor/requests/${request._id}/receipt` : "/donor/requests" },
        { user: organization?.owner, role: "ngo", href: kind.startsWith("receipt_") && ["receipt_issued", "receipt_outcome_updated", "receipt_amendment_proposed", "receipt_amendment_confirmed", "receipt_amendment_withdrawn"].includes(kind) ? `/ngo/requests/${request._id}/receipt` : "/ngo/requests" }
    ] });
};
export const recordOrganizationEvent = async ({ organization, kind, session }) => {
    const admins = kind === "organization_submitted" ? await User.find({ role: "admin", status: "active" }).select("_id").session(session).lean() : [];
    await recordEvent({ key: `verification:${organization.__v || 0}:${kind}`, kind, resourceType: "organization", resourceId: organization._id, session, recipients: [
        { user: organization.owner, role: "ngo", href: "/ngo/dashboard" }, ...admins.map(admin => ({ user: admin._id, role: "admin", href: `/admin/organizations/${organization._id}/review` }))
    ] });
};

export const eligibleRecipient = async (record, session = null) => {
    const user = await User.findOne({ _id: record.user || record.recipient, role: record.role, $or: [{ status: "active" }, { status: { $exists: false } }] }).session(session).lean();
    if (!user) return null;
    if (record.resourceType === "organization") {
        const organization = await Organization.findById(record.resourceId).select("owner").session(session).lean();
        return organization && (record.role === "admin" || (record.role === "ngo" && String(organization.owner) === String(user._id))) ? user : null;
    }
    const request = await DonationRequest.findById(record.resourceId).select("donation organization receipt.donorId").session(session).lean();
    if (!request) return null;
    if (record.role === "ngo") return await Organization.exists({ _id: request.organization, owner: user._id, verificationStatus: "verified" }).session(session) ? user : null;
    if (record.role !== "donor") return null;
    if (request.receipt?.donorId) return String(request.receipt.donorId) === String(user._id) ? user : null;
    return await Donation.exists({ _id: request.donation, donor: user._id }).session(session) ? user : null;
};

export const processOutboxBatch = async ({ limit = 25, now = new Date() } = {}) => {
    const events = await LifecycleEvent.find({ processedAt: null }).sort({ createdAt: 1, _id: 1 }).limit(limit).select("_id").lean();
    let processed = 0;
    for (const entry of events) {
        const result = await runTransaction(LifecycleEvent.db, async session => {
            // Claim inside the transaction before creating inbox rows. A concurrent
            // worker retries and sees processedAt; an aborted write releases the claim.
            const event = await LifecycleEvent.findOneAndUpdate({ _id: entry._id, processedAt: null }, { $set: { processedAt: now } }, { new: true, session }).lean();
            if (!event) return false;
            for (const recipient of event.recipients) {
                const user = await eligibleRecipient({ ...recipient, resourceType: event.resourceType, resourceId: event.resourceId }, session);
                if (!user) continue;
                const id = notificationKey(`${event._id}:${user._id}`);
                await Notification.updateOne({ _id: id }, { $setOnInsert: { event: event._id, recipient: user._id, role: recipient.role, href: recipient.href,
                    kind: event.kind, resourceType: event.resourceType, resourceId: event.resourceId, createdAt: event.createdAt, readAt: null,
                    mailStatus: user.notificationEmailEnabled === true ? "pending" : "disabled", attempts: 0, nextAttemptAt: now } }, { upsert: true, session });
            }
            return true;
        });
        if (result) processed += 1;
    }
    return processed;
};
