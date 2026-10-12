import mongoose from "mongoose";
import { AuditLog } from "../models/AuditLog.js";
import { Donation } from "../models/Donation.js";
import { DonationRequest } from "../models/DonationRequest.js";
import { Organization } from "../models/Organization.js";
import { User } from "../models/User.js";
import { AdminAccessRequest } from "../models/AdminAccessRequest.js";
import { runTransaction } from "../services/transactionService.js";
import { recordOrganizationEvent } from "../services/notificationService.js";

export const decideOrganization = async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.organizationId)) return res.status(404).send("Organization not found");
        const decision = String(req.params.decision || "");
        const reason = String(req.body.reason || "").trim();
        if (!['approve', 'reject'].includes(decision)) return res.status(400).send("Invalid verification decision.");
        if (decision === 'reject' && (reason.length < 10 || reason.length > 1000)) return res.redirect(`/admin/organizations/${req.params.organizationId}/review?message=${encodeURIComponent('Provide a rejection reason between 10 and 1000 characters.')}`);
        const update = decision === 'approve'
            ? { verificationStatus: 'verified', verifiedAt: new Date(), verifiedBy: req.auth.userId, rejectionReason: '' }
            : { verificationStatus: 'rejected', verifiedAt: null, verifiedBy: null, rejectionReason: reason };
        const organization = await runTransaction(Organization.db, async session => {
            const changed = await Organization.findOneAndUpdate({ _id: req.params.organizationId, verificationStatus: 'pending' }, { $set: update, $inc: { __v: 1 } }, { new: true, session });
            if (!changed) return null;
            await AuditLog.create([{ actor: req.auth.userId, action: `organization.${decision === 'approve' ? 'verified' : 'rejected'}`, targetType: 'organization', targetId: changed._id, details: decision === 'reject' ? { reason } : {} }], { session });
            await recordOrganizationEvent({ organization: changed, kind: decision === 'approve' ? 'organization_verified' : 'organization_rejected', session });
            return changed;
        });
        if (!organization) return res.status(409).send("This application has already been reviewed or is unavailable.");
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
        const users = await User.find(query).sort({ createdAt: -1 }).limit(200).select('name email role status createdAt lastLoginAt').lean();
        res.render('admin-users.ejs', { users, filters: { role, status }, message: String(req.query.message || '') });
    } catch (error) { next(error); }
};

export const updateUserStatus = async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.userId)) return res.status(404).send('User not found');
        const status = String(req.params.status || '');
        if (!['active', 'suspended'].includes(status)) return res.status(400).send('Invalid account status.');
        const reason = String(req.body.reason || '').trim();
        if (status === 'suspended' && (reason.length < 10 || reason.length > 500)) return res.redirect(`/admin/users?message=${encodeURIComponent('Suspension requires a reason between 10 and 500 characters.')}`);
        const user = await User.findOneAndUpdate({ _id: req.params.userId, role: { $in: ['donor', 'ngo'] } }, { $set: { status } }, { new: true }).select('name email role status');
        if (!user) return res.status(404).send('User not found');
        await AuditLog.create({ actor: req.auth.userId, action: `user.${status === 'active' ? 'reactivated' : 'suspended'}`, targetType: 'user', targetId: user._id, details: reason ? { reason } : {} });
        res.redirect(`/admin/users?message=${encodeURIComponent(`${user.name}'s account is now ${status}.`)}`);
    } catch (error) { next(error); }
};

export const loadAdminDashboardData = async () => {
    const [pendingOrganizations, userCount, verifiedCount, donationCount, completedRequestCount, recentAudit, accessRequests] = await Promise.all([
        Organization.find({ verificationStatus: 'pending' }).sort({ submittedAt: 1 }).populate('owner', 'name email').lean(),
        User.countDocuments({ role: { $in: ['donor', 'ngo'] } }), Organization.countDocuments({ verificationStatus: 'verified' }),
        Donation.countDocuments(), DonationRequest.countDocuments({ status: 'completed' }),
        AuditLog.find().sort({ createdAt: -1 }).limit(12).populate('actor', 'name').lean(),
        AdminAccessRequest.find({ status: 'pending' }).sort({ createdAt: 1 }).limit(20).lean()
    ]);
    return { pendingOrganizations, metrics: { userCount, verifiedCount, donationCount, completedRequestCount }, recentAudit, accessRequests };
};
