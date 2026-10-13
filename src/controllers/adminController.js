import mongoose from "mongoose";
import { AuditLog } from "../models/AuditLog.js";
import { Donation } from "../models/Donation.js";
import { DonationRequest } from "../models/DonationRequest.js";
import { Organization } from "../models/Organization.js";
import { User } from "../models/User.js";
import { AdminAccessRequest } from "../models/AdminAccessRequest.js";
import { runTransaction } from "../services/transactionService.js";
import { recordOrganizationEvent } from "../services/notificationService.js";
import { reviewVersion, versionFilter, reviewReason, moderateUser, paginate } from "../services/adminReviewService.js";
import { guardActiveActor } from "../services/workflowActorService.js";
import { respondError } from "../middleware/errors.js";

export const decideOrganization = async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.organizationId)) return res.status(404).send("Organization not found");
        const decision = String(req.params.decision || "");
        const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
        const version = reviewVersion(req.body._version);
        if (!['approve', 'reject'].includes(decision)) return res.status(400).send("Invalid verification decision.");
        if (version === null || reason.length < 10 || reason.length > 1000 || req.body.evidenceReviewed !== "yes") return respondError(req, res, 400, "Confirm evidence review and provide the application version and a reason between 10 and 1000 characters.");
        const update = decision === 'approve'
            ? { verificationStatus: 'verified', verifiedAt: new Date(), verifiedBy: req.auth.userId, rejectionReason: '' }
            : { verificationStatus: 'rejected', verifiedAt: null, verifiedBy: null, rejectionReason: reason };
        const organization = await runTransaction(Organization.db, async session => {
            if (!await guardActiveActor(req.auth.userId, session, "admin")) return null;
            const current = await Organization.findById(req.params.organizationId).session(session);
            if (!current || (decision === "approve" && (!current.verificationDocument?.filename || !await guardActiveActor(current.owner, session, "ngo")))) return null;
            const changed = await Organization.findOneAndUpdate({ _id: req.params.organizationId, verificationStatus: 'pending', ...versionFilter("__v", version) }, { $set: update, $inc: { __v: 1 } }, { new: true, session });
            if (!changed) return null;
            await AuditLog.create([{ actor: req.auth.userId, action: `organization.${decision === 'approve' ? 'verified' : 'rejected'}`, targetType: 'organization', targetId: changed._id, details: { reason, version, organizationName: changed.name, registrationNumber: changed.registrationNumber, submittedAt: changed.submittedAt, document: { name: changed.verificationDocument?.originalName, size: changed.verificationDocument?.size, mimeType: changed.verificationDocument?.mimeType } } }], { session });
            await recordOrganizationEvent({ organization: changed, kind: decision === 'approve' ? 'organization_verified' : 'organization_rejected', session });
            return changed;
        });
        if (!organization) return respondError(req, res, 409, "This application changed, was already reviewed, or its owner cannot be approved. Reload the review before deciding again.");
        res.redirect(`/admin/dashboard?message=${encodeURIComponent(`${organization.name} was ${decision === 'approve' ? 'verified' : 'rejected'}.`)}`);
    } catch (error) { next(error); }
};

export const showUsers = async (req, res, next) => {
    try {
        const role = ['donor', 'ngo'].includes(String(req.query.role)) ? String(req.query.role) : '';
        const status = ['active', 'suspended'].includes(String(req.query.status)) ? String(req.query.status) : '';
        const query = { role: { $in: ['donor', 'ngo'] } };
        if (role) query.role = role;
        if (status) query.status = status;
        const pagination = await paginate(User, query, req.query.page, 'name email role status createdAt lastLoginAt moderationVersion moderationReason moderatedAt');
        res.render('admin-users.ejs', { users: pagination.records, pagination, filters: { role, status }, message: String(req.query.message || '') });
    } catch (error) { next(error); }
};

export const updateUserStatus = async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.userId)) return res.status(404).send('User not found');
        const status = String(req.params.status || '');
        if (!['active', 'suspended'].includes(status)) return res.status(400).send('Invalid account status.');
        const reason = reviewReason(req.body.reason), version = reviewVersion(req.body._version);
        if (!reason || version === null) return respondError(req, res, 400, "Both suspension and reactivation require a current version and a reason between 10 and 500 characters.");
        const changed = await moderateUser({ userId: req.params.userId, actorId: req.auth.userId, status, version, reason });
        if (!changed) return respondError(req, res, 409, "This account changed or is unavailable for moderation. Reload the accounts page before deciding again.");
        res.redirect('/admin/users?message=Account%20decision%20recorded.%20Review%20affected%20commitments%20in%20Exceptions.');
    } catch (error) { next(error); }
};

export const loadAdminDashboardData = async (query = {}) => {
    const queueStatus = ['pending', 'verified', 'rejected'].includes(query.status) ? query.status : 'pending';
    const queue = await paginate(Organization, { verificationStatus: queueStatus }, query.page, 'name owner contactEmail submittedAt verificationStatus', { submittedAt: 1, _id: 1 });
    const [pendingOrganizations, userCount, verifiedCount, donationCount, completedRequestCount, recentAudit, accessRequests] = await Promise.all([
        Organization.populate(queue.records, { path: 'owner', select: 'name status' }),
        User.countDocuments({ role: { $in: ['donor', 'ngo'] } }), Organization.countDocuments({ verificationStatus: 'verified' }),
        Donation.countDocuments(), DonationRequest.countDocuments({ status: 'completed' }),
        AuditLog.find().sort({ createdAt: -1 }).limit(12).populate('actor', 'name').lean(),
        AdminAccessRequest.find({ status: 'pending' }).sort({ createdAt: 1 }).limit(20).lean()
    ]);
    return { pendingOrganizations, queue, queueStatus, metrics: { userCount, verifiedCount, donationCount, completedRequestCount }, recentAudit, accessRequests };
};
