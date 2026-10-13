import mongoose from "mongoose";
import path from "node:path";
import { User } from "../models/User.js";
import { Donation } from "../models/Donation.js";
import { DonationRequest } from "../models/DonationRequest.js";
import { AuditLog } from "../models/AuditLog.js";
import { reviewVersion, reviewReason, versionFilter, moderateListing, paginate, exceptionPipeline } from "../services/adminReviewService.js";
import { positivePage } from "../services/ngoWorkspaceService.js";
import { guardActiveActor } from "../services/workflowActorService.js";
import { runTransaction } from "../services/transactionService.js";
import { respondError } from "../middleware/errors.js";
import { sendPrivateMedia } from "../services/privateStorageService.js";

const validId = id => typeof id === "string" && mongoose.isValidObjectId(id);
const historyFor = (targetType, targetId) => AuditLog.find({ targetType, targetId }).sort({ createdAt: -1, _id: -1 }).limit(20).populate("actor", "name").lean();
const caseData = extra => ({ fields: [], images: [], commitments: [], commitmentTotal: 0, form: null, history: [], ...extra });
export const showAdminUser = async (req, res, next) => {
    try {
        if (!validId(req.params.userId)) return respondError(req, res, 404, "Account not found.");
        const user = await User.findOne({ _id: req.params.userId, role: { $in: ["donor", "ngo"] } }).select("name email status role moderationReason moderatedAt").lean();
        if (!user) return respondError(req, res, 404, "Account not found.");
        const pipeline = exceptionPipeline("all", user._id);
        const [result] = await DonationRequest.aggregate([...pipeline, { $facet: { count: [{ $count: "total" }], records: [{ $sort: { updatedAt: -1, _id: -1 } }, { $limit: 20 }] } }]);
        res.render("admin-review-case.ejs", caseData({ title: user.name, back: "/admin/users", fields: [["Role", user.role], ["Email", user.email], ["Account status", user.status], ["Last moderation reason", user.moderationReason || "No reason recorded"]],
            commitments: result.records, commitmentTotal: result.count[0]?.total || 0, history: await historyFor("user", user._id) }));
    } catch (error) { next(error); }
};
export const showAdminListings = async (req, res, next) => {
    try {
        const status = ["hidden", "visible"].includes(req.query.status) ? req.query.status : "";
        const query = status === "hidden" ? { moderationStatus: "hidden" } : status === "visible" ? { moderationStatus: { $ne: "hidden" } } : {};
        const pagination = await paginate(Donation, query, req.query.page, "donor equipment condition quantity allocatedQuantity handedOverQuantity status moderationStatus donorSuspended");
        await Donation.populate(pagination.records, { path: "donor", select: "name status" });
        res.render("admin-review-queue.ejs", { kind: "listings", records: pagination.records, pagination, status });
    } catch (error) { next(error); }
};
export const showAdminListing = async (req, res, next) => {
    try {
        if (!validId(req.params.id)) return respondError(req, res, 404, "Listing not found.");
        const listing = await Donation.findById(req.params.id).populate("donor", "name status").lean();
        if (!listing) return respondError(req, res, 404, "Listing not found.");
        const details = listing.details;
        const reported = details ? [["Reported brand", details.brand || "Not reported"], ["Reported model", details.model || "Not reported"], ["Functional declaration", String(details.functionalStatus || "not_checked").replaceAll("_", " ")], ["Reported defects", details.defects || "None reported"], ["Missing accessories", details.missingAccessories || "None reported"]] : [["Equipment details", "No additional details"]];
        for (const [key, label] of [["seatWidthCm", "Seat width in cm"], ["folding", "Folding"], ["heightAdjustable", "Height adjustable"], ["chestpiece", "Chestpiece"], ["tubingCondition", "Tubing condition"]]) if (details?.specifications?.[key] !== undefined) reported.push([label, String(details.specifications[key]).replaceAll("_", " ")]);
        res.render("admin-review-case.ejs", caseData({ title: `${listing.equipment} listing`, back: "/admin/listings", fields: [["Donor", listing.donor?.name || "Unavailable"], ["Donor account", listing.donor?.status || "Unavailable"], ["Lifecycle status", listing.status], ["Discovery moderation", listing.moderationStatus || "visible"], ["Total units", listing.quantity], ["Allocated units", listing.allocatedQuantity || 0], ["Handed over units", listing.handedOverQuantity || 0], ["Description", listing.description], ...reported, ["Last moderation reason", listing.moderationReason || "No reason recorded"]],
            images: listing.images.map(item => ({ url: `/admin/listings/${listing._id}/images/${item.filename}`, name: item.originalName })),
            form: { action: `/admin/listings/${listing._id}/${listing.moderationStatus === "hidden" ? "visible" : "hidden"}`, version: listing.__v || 0, label: listing.moderationStatus === "hidden" ? "Restore discovery visibility" : "Hide from new requests" },
            history: await historyFor("donation", listing._id) }));
    } catch (error) { next(error); }
};
export const changeAdminListing = async (req, res, next) => {
    try {
        const version = reviewVersion(req.body._version), reason = reviewReason(req.body.reason);
        if (!validId(req.params.id) || !["visible", "hidden"].includes(req.params.status) || version === null || !reason) return respondError(req, res, 400, "Provide a current listing version, valid visibility decision and a reason between 10 and 500 characters.");
        const changed = await moderateListing({ donationId: req.params.id, actorId: req.auth.userId, status: req.params.status, version, reason });
        if (!changed) return respondError(req, res, 409, "This listing changed or was already moderated. Reload its review before deciding again.");
        res.redirect(`/admin/listings/${req.params.id}/review`);
    } catch (error) { next(error); }
};
export const showAdminExceptions = async (req, res, next) => {
    try {
        const status = ["suspended", "discrepancy", "missed"].includes(req.query.status) ? req.query.status : "all";
        const pipeline = exceptionPipeline(status);
        const [count] = await DonationRequest.aggregate([...pipeline, { $count: "total" }]);
        const total = count?.total || 0, totalPages = Math.max(1, Math.ceil(total / 20)), page = Math.min(positivePage(req.query.page), totalPages);
        const records = await DonationRequest.aggregate([...pipeline, { $sort: { updatedAt: -1, _id: -1 } }, { $skip: (page - 1) * 20 }, { $limit: 20 }]);
        res.render("admin-review-queue.ejs", { kind: "exceptions", records, pagination: { total, totalPages, page }, status });
    } catch (error) { next(error); }
};
export const showAdminException = async (req, res, next) => {
    try {
        if (!validId(req.params.requestId)) return respondError(req, res, 404, "Commitment not found.");
        const request = await DonationRequest.findById(req.params.requestId).select("donation requestedBy status quantity handedOverQuantity acknowledgedQuantity releasedQuantity pickup.status fulfillment.transfers.status updatedAt __v").populate("donation", "equipment donor moderationStatus").populate("requestedBy", "name status").lean();
        if (!request) return respondError(req, res, 404, "Commitment not found.");
        const donor = request.donation ? await User.findById(request.donation.donor).select("name status").lean() : null;
        res.render("admin-review-case.ejs", caseData({ title: "Commitment review", back: "/admin/exceptions", fields: [["Equipment", request.donation?.equipment || "Unavailable"], ["Donor", donor?.name || "Unavailable"], ["Donor account", donor?.status || "Unavailable"], ["NGO member", request.requestedBy?.name || "Unavailable"], ["NGO account", request.requestedBy?.status || "Unavailable"], ["Request status", request.status], ["Pickup status", request.pickup?.status || "Not arranged"], ["Committed units", request.quantity], ["Handed over units", request.handedOverQuantity || 0], ["Acknowledged units", request.acknowledgedQuantity || 0], ["Released units", request.releasedQuantity || 0], ["Handover discrepancy", request.fulfillment?.transfers?.some(item => item.status === "disputed") ? "Unresolved" : "None recorded"]],
            form: request.status === "accepted" ? { action: `/admin/requests/${request._id}/note`, version: request.__v || 0, stamp: request.updatedAt.toISOString(), label: "Record administrative review note" } : null,
            history: await historyFor("request", request._id) }));
    } catch (error) { next(error); }
};
export const addAdminReviewNote = async (req, res, next) => {
    try {
        const reason = reviewReason(req.body.reason), version = reviewVersion(req.body._version), stamp = typeof req.body._stamp === "string" && /^\d{4}-\d\d-\d\dT/.test(req.body._stamp) ? new Date(req.body._stamp) : null;
        if (!validId(req.params.requestId) || !reason || version === null || !stamp || !Number.isFinite(stamp.getTime())) return respondError(req, res, 400, "Provide the current review version and timestamp, and a note between 10 and 500 characters.");
        const changed = await runTransaction(DonationRequest.db, async session => {
            if (!await guardActiveActor(req.auth.userId, session, "admin")) return false;
            const result = await DonationRequest.updateOne({ _id: req.params.requestId, status: "accepted", updatedAt: stamp, ...versionFilter("__v", version) }, { $inc: { __v: 1 } }, { session });
            if (!result.matchedCount) return false;
            await AuditLog.create([{ actor: req.auth.userId, action: "request.review_note", targetType: "request", targetId: req.params.requestId, details: { reason } }], { session });
            return true;
        });
        if (!changed) return respondError(req, res, 409, "This commitment changed or was already reviewed. Reload it before recording another note.");
        res.redirect(`/admin/requests/${req.params.requestId}/review`);
    } catch (error) { next(error); }
};
export const serveAdminListingImage = async (req, res, next) => {
    try {
        const filename = path.basename(req.params.filename);
        if (!validId(req.params.id) || filename !== req.params.filename) return respondError(req, res, 404, "Image not found.");
        const listing = await Donation.findOne({ _id: req.params.id, "images.filename": filename }).select("images").lean();
        if (!listing) return respondError(req, res, 404, "Image not found.");
        await sendPrivateMedia(res, "donations", listing.images.find(image => image.filename === filename));
    } catch (error) { next(error); }
};
