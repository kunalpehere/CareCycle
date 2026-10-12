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

const formData = (overrides = {}) => ({
    equipmentTypes: EQUIPMENT_TYPES,
    conditions: EQUIPMENT_CONDITIONS,
    donation: null,
    message: "",
    formTitle: "Create donation listing",
    formAction: "/donate",
    submitLabel: "Create listing",
    ...overrides
});

export const showCreateDonation = (req, res) => res.render("donate.ejs", formData());

export const showDonorDashboard = async (req, res, next) => {
    try {
        const donations = await Donation.find({ donor: req.auth.userId }).sort({ createdAt: -1 }).lean();
        const legacyUser = await User.collection.findOne({ _id: req.auth.user._id }, { projection: { products: 1 } });
        const legacyDonations = Array.isArray(legacyUser?.products) ? legacyUser.products.map((item) => ({
            equipment: String(item.equipment || "Unknown"), condition: String(item.quality || "Unknown"), status: "legacy", legacy: true
        })) : [];
        res.render("donor-dashboard.ejs", { donations, legacyDonations, message: String(req.query.message || "") });
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
        const { valid, value } = validateDonation(req.body);
        if (!valid) return res.status(400).render("donate.ejs", formData({ donation: req.body, message: "Complete every field with valid listing information." }));

        images = await saveDonationImages(req.files);
        const donation = await Donation.create({ donor: req.auth.userId, ...value, images });
        let notification = "Email notification is not configured.";
        try {
            const result = await sendDonationMail({ email: req.auth.user.email, equipment: value.equipment, condition: value.condition });
            if (result.sent) notification = "Notification email sent.";
        } catch (mailError) {
            console.error("Donation email failed", { message: mailError.message });
            notification = "The notification email failed.";
        }
        res.redirect(`/donor/dashboard?message=${encodeURIComponent(`Listing created. ${notification}`)}`);
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

        const { valid, value } = validateDonation(req.body);
        if (!valid) return res.status(400).render("donate.ejs", formData({
            donation: { ...donation.toObject(), ...req.body }, message: "Complete every field with valid listing information.",
            formTitle: "Edit donation listing", formAction: `/donations/${donation._id}/edit`, submitLabel: "Save changes"
        }));
        const requestedRemoval = new Set([req.body.removeImages || []].flat().map(String));
        const removedImages = donation.images.filter((image) => requestedRemoval.has(image.filename));
        const retainedImages = donation.images.filter((image) => !requestedRemoval.has(image.filename));
        if (retainedImages.length + (req.files?.length || 0) > 3) {
            return res.status(400).render("donate.ejs", formData({
                donation, message: "A listing can have at most three images.", formTitle: "Edit donation listing",
                formAction: `/donations/${donation._id}/edit`, submitLabel: "Save changes"
            }));
        }

        newImages = await saveDonationImages(req.files);
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
