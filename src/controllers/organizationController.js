import path from "path";
import mongoose from "mongoose";
import { Organization } from "../models/Organization.js";
import { validateOrganization } from "../validators/input.js";
import {
    removeVerificationDocument, saveVerificationDocument, verificationDocumentDirectory
} from "../services/verificationDocumentService.js";
import { sameOwner } from "../services/authorizationService.js";
import { respondForbidden } from "../middleware/accessResponses.js";
import { runTransaction } from "../services/transactionService.js";
import { recordOrganizationEvent } from "../services/notificationService.js";

const organizationFormData = (overrides = {}) => ({
    organization: null,
    message: "",
    formTitle: "Create organization profile",
    formAction: "/ngo/organization",
    submitLabel: "Submit for verification",
    requireDocument: true,
    ...overrides
});

export const showCreateOrganization = async (req, res, next) => {
    try {
        const existing = await Organization.findOne({ owner: req.auth.userId }).select("_id");
        if (existing) return res.redirect(`/ngo/organizations/${existing.id}/edit`);
        res.render("organization-form.ejs", organizationFormData({
            organization: { contactPerson: req.auth.user.name, contactEmail: req.auth.user.email }
        }));
    } catch (error) {
        next(error);
    }
};

export const createOrganization = async (req, res, next) => {
    let savedDocument;
    let committed = false;
    try {
        const existing = await Organization.exists({ owner: req.auth.userId });
        if (existing) return res.status(409).send("This NGO member already owns an organization profile.");
        const { valid, value } = validateOrganization(req.body);
        if (!valid) return res.status(400).render("organization-form.ejs", organizationFormData({ organization: req.body, message: "Complete every required organization field with valid information." }));

        savedDocument = await saveVerificationDocument(req.file);
        const organization = await runTransaction(Organization.db, async session => {
            const [created] = await Organization.create([{
                owner: req.auth.userId,
                ...value,
                verificationDocument: savedDocument,
                verificationStatus: "pending",
                submittedAt: new Date()
            }], { session });
            await recordOrganizationEvent({ organization: created, kind: "organization_submitted", session });
            return created;
        });
        committed = true;
        res.redirect(`/ngo/dashboard?message=${encodeURIComponent(`${organization.name} was submitted for verification.`)}`);
    } catch (error) {
        if (!committed) await removeVerificationDocument(savedDocument);
        if (error?.code === 11000) return res.status(409).send("That organization or registration number is already registered.");
        next(error);
    }
};

export const showEditOrganization = (req, res) => {
    const organization = req.ownedOrganization;
    if (organization.verificationStatus === "verified") {
        return res.render("organization-profile.ejs", { organization, message: "Verified organization details are locked. Contact an administrator to request changes." });
    }
    const rejected = organization.verificationStatus === "rejected";
    res.render("organization-form.ejs", organizationFormData({
        organization,
        formTitle: rejected ? "Correct and resubmit organization" : "Update pending organization",
        formAction: `/ngo/organizations/${organization.id}/edit`,
        submitLabel: rejected ? "Resubmit for verification" : "Save pending application",
        requireDocument: rejected,
        message: rejected ? organization.rejectionReason || "Your application requires corrections before resubmission." : "Your application is pending review."
    }));
};

export const updateOrganization = async (req, res, next) => {
    let newDocument;
    let committed = false;
    try {
        const organization = req.ownedOrganization;
        if (organization.verificationStatus === "verified") return res.status(409).send("Verified organization details cannot be changed here.");
        const { valid, value } = validateOrganization(req.body);
        const rejected = organization.verificationStatus === "rejected";
        if (!valid) return res.status(400).render("organization-form.ejs", organizationFormData({
            organization: { ...organization.toObject(), ...req.body },
            formTitle: rejected ? "Correct and resubmit organization" : "Update pending organization",
            formAction: `/ngo/organizations/${organization.id}/edit`,
            submitLabel: rejected ? "Resubmit for verification" : "Save pending application",
            requireDocument: rejected,
            message: "Complete every required organization field with valid information."
        }));
        if (rejected && !req.file) return res.status(400).render("organization-form.ejs", organizationFormData({
            organization, formTitle: "Correct and resubmit organization", formAction: `/ngo/organizations/${organization.id}/edit`,
            submitLabel: "Resubmit for verification", requireDocument: true, message: "Upload a replacement verification document before resubmitting."
        }));

        if (req.file) newDocument = await saveVerificationDocument(req.file);
        const previousDocument = organization.verificationDocument?.toObject?.() || organization.verificationDocument;
        const changed = await runTransaction(Organization.db, async session => {
            const current = await Organization.findOneAndUpdate({ _id: organization._id, owner: req.auth.userId, __v: organization.__v, verificationStatus: organization.verificationStatus },
                { $set: { ...value, ...(newDocument ? { verificationDocument: newDocument } : {}), verificationStatus: "pending", rejectionReason: "", submittedAt: new Date(), verifiedAt: null, verifiedBy: null }, $inc: { __v: 1 } }, { new: true, runValidators: true, session });
            if (!current) return false;
            await recordOrganizationEvent({ organization: current, kind: "organization_submitted", session }); return true;
        });
        if (!changed) { await removeVerificationDocument(newDocument); return res.status(409).send("This application changed during review. Reload it before submitting again."); }
        committed = true;
        if (newDocument) await removeVerificationDocument(previousDocument).catch(() => console.error("Previous verification document cleanup failed."));
        res.redirect("/ngo/dashboard?message=Organization%20application%20updated.");
    } catch (error) {
        if (!committed) await removeVerificationDocument(newDocument);
        if (error?.code === 11000) return res.status(409).send("That registration number is already registered.");
        next(error);
    }
};

export const serveVerificationDocument = async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.organizationId)) return res.status(404).send("Organization not found");
        const organization = await Organization.findById(req.params.organizationId);
        if (!organization) return res.status(404).send("Organization not found");
        const isAdmin = req.auth.user.role === "admin";
        if (!isAdmin && !sameOwner(req.auth.userId, organization.owner)) return respondForbidden(req, res);
        const document = organization.verificationDocument;
        res.type(document.mimeType);
        res.setHeader("Content-Disposition", `inline; filename="${path.basename(document.originalName).replaceAll('"', '')}"`);
        res.sendFile(path.basename(document.filename), { root: verificationDocumentDirectory });
    } catch (error) {
        next(error);
    }
};

export const showAdminOrganizationReview = async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.organizationId)) return res.status(404).send("Organization not found");
        const organization = await Organization.findById(req.params.organizationId).populate("owner", "name email status");
        if (!organization) return res.status(404).send("Organization not found");
        res.render("admin-organization-review.ejs", { organization, message: String(req.query.message || '') });
    } catch (error) {
        next(error);
    }
};
