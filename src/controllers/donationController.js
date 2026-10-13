import { guardActiveActor } from "../services/workflowActorService.js";
import path from "path";
import { Donation, EQUIPMENT_CONDITIONS, EQUIPMENT_TYPES } from "../models/Donation.js";
import { User } from "../models/User.js";
import { donationImageDirectory, removeDonationImages, saveDonationImages } from "../services/imageService.js";
import { sendDonationMail } from "../services/mailService.js";
import { validateDonation } from "../validators/input.js";
import { changeListing } from "../services/listingPolicyService.js";
import { expectedListingVersion } from "../services/requestPolicy.js";
import { workflowConflict } from "../services/workflowConflict.js";
import { DonationRequest } from "../models/DonationRequest.js";
import { OPEN_LISTING_STATUSES } from "../services/availabilityService.js";
import { quantityAccounting } from "../services/quantityContract.js";
import { buildDonorWorkspace } from "../services/donorWorkspaceService.js";
import { runTransaction } from "../services/transactionService.js";
import { specifications, functionalOptions, conditionLabels } from "../services/equipmentDetails.js";

const formData = (overrides = {}) => ({
    equipmentTypes: EQUIPMENT_TYPES,
    conditions: EQUIPMENT_CONDITIONS,
    donation: null,
    message: "",
    formTitle: "Create donation listing",
    formAction: "/donate",
    submitLabel: "Create listing",
    specifications, functionalOptions, conditionLabels, errors: {}, draft: null, removedImages: [],
    ...overrides
});

const listingErrors = (req, res, result, extra = {}) => {
    const donation = req.ownedDonation?.toObject() || null;
    const edits = donation ? { donation, formTitle: "Edit donation listing", formAction: `/donations/${donation._id}/edit`, submitLabel: "Save changes" } : {};
    return res.status(400).render("donate.ejs", formData({ ...edits, draft: result.draft, errors: { ...result.errors, ...extra },
        removedImages: [req.body.removeImages || []].flat().filter(item => typeof item === "string" && donation?.images.some(image => image.filename === item)),
        message: "Correct the highlighted fields. Your text entries are kept; oversized entries may be shortened. Select any new image files again." }));
};

export const showCreateDonation = (req, res) => res.render("donate.ejs", formData());

export const showDonorDashboard = async (req, res, next) => {
    try {
        // One read snapshot keeps listing totals and request progress consistent during concurrent decisions.
        const { donations, requests, legacyUser } = await runTransaction(Donation.db, async session => {
            const donations = await Donation.find({ donor: req.auth.userId }).sort({ createdAt: -1, _id: -1 }).session(session).lean();
            const requests = await DonationRequest.find({ donation: { $in: donations.map(item => item._id) } })
                .select("donation organization quantity status createdAt updatedAt respondedAt cancellation.at pickup.status pickup.proposal.start pickup.proposal.end pickup.proposal.timeZone pickup.proposal.proposedBy pickup.missedReport.disputed pickup.history.action pickup.history.at handedOverQuantity acknowledgedQuantity releasedQuantity fulfillment.transfers.quantity fulfillment.transfers.status fulfillment.transfers.at fulfillment.transfers.receivedQuantity fulfillment.transfers.acknowledgedBy fulfillment.transfers.donor fulfillment.transfers.acknowledgedAt fulfillment.transfers.resolution.quantity fulfillment.remainderProposal.actor fulfillment.completedAt")
                .populate({ path: "organization", select: "name", options: { session } }).sort({ createdAt: -1, _id: -1 }).session(session).lean();
            const legacyUser = await User.collection.findOne({ _id: req.auth.user._id }, { projection: { products: 1 }, session });
            return { donations, requests, legacyUser };
        });
        const legacyDonations = Array.isArray(legacyUser?.products) ? legacyUser.products.map((item) => ({
            equipment: String(item.equipment || "Unknown"), condition: String(item.quality || "Unknown"), status: "legacy", legacy: true
        })) : [];
        const workspace = buildDonorWorkspace({ donations, requests, donorId: req.auth.userId, query: req.query });
        res.render("donor-dashboard.ejs", { ...workspace, legacyDonations, message: String(req.query.message || "") });
    } catch (error) {
        next(error);
    }
};

export const listCurrentUserDonations = async (req, res, next) => {
    try {
        const donations = await Donation.find({ donor: req.auth.userId }).sort({ createdAt: -1 }).select("equipment condition quantity status createdAt").lean();
        res.json(donations.map((item) => ({ ...item, quality: item.condition })));
    } catch (error) {
        next(error);
    }
};

export const createDonation = async (req, res, next) => {
    let images = [];
    try {
        const result = validateDonation(req.body), { valid, value } = result;
        if (!valid || req.donationUploadError) return listingErrors(req, res, result, req.donationUploadError ? { images: req.donationUploadError } : {});

        try { images = await saveDonationImages(req.files); }
        catch (error) { if (error.status === 400) return listingErrors(req, res, result, { images: "An image does not match its declared format. Choose a valid JPEG, PNG or WebP file." }); throw error; }
        const donation = await runTransaction(Donation.db, async session => {
            if (!await guardActiveActor(req.auth.userId, session, "donor")) return null;
            const [created] = await Donation.create([{ donor: req.auth.userId, ...value, images }], { session });
            return created;
        });
        if (!donation) { await removeDonationImages(images); return res.status(403).send("Your account is unavailable. Sign in again before creating a listing."); }
        try {
            await sendDonationMail({ email: req.auth.user.email, equipment: value.equipment, condition: value.condition });
        } catch (mailError) {
            console.error("Donation email failed", { message: mailError.message });
        }
        res.redirect(`/donor/dashboard?message=${encodeURIComponent("Listing created. Verified NGOs can review it. Check your requests for the next step.")}`);
    } catch (error) {
        await removeDonationImages(images);
        next(error);
    }
};

export const showEditDonation = async (req, res, next) => {
    try {
        const donation = req.ownedDonation.toObject();
        const pending = await DonationRequest.exists({ donation: donation._id, status: "pending" });
        if (!OPEN_LISTING_STATUSES.includes(donation.status) || donation.allocatedQuantity > 0 || pending) return await workflowConflict(req, res, { donationId: donation._id, donor: true, message: "Equipment details are locked while requests or commitments exist. You can review total quantity separately." });
        res.render("donate.ejs", formData({
            donation,
            formTitle: "Edit donation listing",
            formAction: `/donations/${donation._id}/edit`,
            submitLabel: "Save changes"
        }));
    } catch (error) {
        next(error);
    }
};

export const updateDonation = async (req, res, next) => {
    let newImages = [];
    let persisted = false;
    try {
        const donation = req.ownedDonation;
        const expectedVersion = expectedListingVersion(req.body._version);
        if (expectedVersion !== (donation.__v ?? 0)) return await workflowConflict(req, res, { donor: true, donationId: donation._id,
            message: "This listing changed since you opened the form. Review its current details before editing." });

        const validation = validateDonation(req.body), { valid, value } = validation;
        if (!valid || req.donationUploadError) return listingErrors(req, res, validation, req.donationUploadError ? { images: req.donationUploadError } : {});
        const requestedRemoval = new Set([req.body.removeImages || []].flat().map(String));
        const removedImages = donation.images.filter((image) => requestedRemoval.has(image.filename));
        const retainedImages = donation.images.filter((image) => !requestedRemoval.has(image.filename));
        if (retainedImages.length + (req.files?.length || 0) > 3) {
            return listingErrors(req, res, validation, { images: "A listing can have at most three images. Remove an existing image or select fewer new files." });
        }

        try { newImages = await saveDonationImages(req.files); }
        catch (error) { if (error.status === 400) return listingErrors(req, res, validation, { images: "An image does not match its declared format. Choose a valid JPEG, PNG or WebP file." }); throw error; }
        const result = await changeListing({ donationId: donation._id, donorId: req.auth.userId,
            expectedVersion, action: "edit", value, images: [...retainedImages, ...newImages] });
        if (!result.changed) {
            await removeDonationImages(newImages);
            return await workflowConflict(req, res, { donationId: donation._id, donor: true, message: result.reason === "details_locked"
                ? "Equipment details are locked while requests or commitments exist. Review total quantity separately."
                : "This listing changed since you opened the form. Review its current details before editing." });
        }
        persisted = true;
        await removeDonationImages(removedImages);
        res.redirect("/donor/dashboard?message=Listing%20updated.");
    } catch (error) {
        if (!persisted) await removeDonationImages(newImages);
        next(error);
    }
};

export const withdrawDonation = async (req, res, next) => {
    try {
        const result = await changeListing({ donationId: req.params.id, donorId: req.auth.userId,
            expectedVersion: expectedListingVersion(req.body._version), action: "withdraw" });
        if (!result.changed) return await workflowConflict(req, res, { donationId: req.params.id, donor: true,
            message: result.reason === "commitment" ? "Accepted commitments remain outstanding. Withdrawal cannot cancel them. Review the requests."
                : "This listing changed or closed since you opened the page. Review its current state before withdrawing." });
        res.redirect("/donor/dashboard?message=Listing%20withdrawn.");
    } catch (error) {
        next(error);
    }
};

export const showQuantityChange = async (req, res, next) => {
    try {
        const donation = req.ownedDonation.toObject();
        const accounting = quantityAccounting(donation);
        if (!OPEN_LISTING_STATUSES.includes(donation.status)) return await workflowConflict(req, res, { donor: true, donationId: donation._id, message: "This listing is closed." });
        res.render("donation-quantity.ejs", { donation, accounting });
    } catch (error) { next(error); }
};

export const updateQuantity = async (req, res, next) => {
    try {
        const result = await changeListing({ donationId: req.params.id, donorId: req.auth.userId,
            expectedVersion: expectedListingVersion(req.body._version), action: "quantity", value: { quantity: Number(req.body.quantity) } });
        if (!result.changed) return await workflowConflict(req, res, { donor: true, donationId: req.params.id,
            message: result.reason === "quantity" ? "Total quantity must be a whole number from 1 to 100 and cannot be below committed units."
                : "This listing changed since you opened the form. Review its current quantity before trying again." });
        res.redirect(`/donor/dashboard?message=${encodeURIComponent(`Quantity updated. ${result.resolved} pending requests resolved.`)}`);
    } catch (error) { next(error); }
};

export const serveDonationImage = async (req, res, next) => {
    try {
        const filename = path.basename(req.params.filename);
        if (filename !== req.params.filename || !/^[a-f0-9-]+\.(jpg|png|webp)$/.test(filename)) return res.status(404).send("Image not found");
        const ownsImage = await Donation.exists({ donor: req.auth.userId, "images.filename": filename });
        if (!ownsImage) return res.status(404).send("Image not found");
        res.sendFile(filename, { root: donationImageDirectory });
    } catch (error) {
        next(error);
    }
};
