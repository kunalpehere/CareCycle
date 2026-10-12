import path from "path";
import { Donation, EQUIPMENT_CONDITIONS, EQUIPMENT_TYPES } from "../models/Donation.js";
import { User } from "../models/User.js";
import { donationImageDirectory, removeDonationImages, saveDonationImages } from "../services/imageService.js";
import { sendDonationMail } from "../services/mailService.js";
import { validateDonation } from "../validators/input.js";

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
        if (donation.status !== "available" || donation.allocatedQuantity > 0) return res.status(409).send("Only available listings without commitments can be edited.");
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
    try {
        const donation = req.ownedDonation;
        if (donation.status !== "available" || donation.allocatedQuantity > 0) return res.status(409).send("Only available listings without commitments can be edited.");

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
        const updated = await Donation.findOneAndUpdate({ _id: donation._id, donor: req.auth.userId,
            status: "available", allocatedQuantity: { $in: [0, null] }, __v: donation.__v }, {
            $set: { ...value, images: [...retainedImages, ...newImages] }, $inc: { __v: 1 }
        }, { new: true, runValidators: true });
        if (!updated) {
            await removeDonationImages(newImages);
            return res.status(409).send("This listing changed. Reload it before editing.");
        }
        await removeDonationImages(removedImages);
        res.redirect("/donor/dashboard?message=Listing%20updated.");
    } catch (error) {
        await removeDonationImages(newImages);
        next(error);
    }
};

export const withdrawDonation = async (req, res, next) => {
    try {
        const donation = await Donation.findOneAndUpdate(
            { _id: req.params.id, donor: req.auth.userId, status: "available", allocatedQuantity: { $in: [0, null] } },
            { $set: { status: "withdrawn" } },
            { new: true }
        );
        if (!donation) return res.status(409).send("Only an available listing without commitments owned by you can be withdrawn.");
        res.redirect("/donor/dashboard?message=Listing%20withdrawn.");
    } catch (error) {
        next(error);
    }
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
