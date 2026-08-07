import mongoose from "mongoose";
import { Donation } from "../models/Donation.js";
import { DonationRequest } from "../models/DonationRequest.js";
import { validateDonationRequest, validateRequestDecision } from "../validators/input.js";
import { acceptPendingRequest } from "../services/matchingService.js";

export const createEquipmentRequest = async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).send("Equipment listing not found");
        const donation = await Donation.findOne({ _id: req.params.id, status: "available" }).select("quantity");
        if (!donation) return res.status(409).send("This equipment is no longer available.");
        const { valid, value } = validateDonationRequest(req.body, donation.quantity);
        if (!valid) return res.redirect(`/ngo/equipment/${donation.id}?message=${encodeURIComponent("Enter a valid quantity, beneficiary summary, and need statement.")}`);

        await DonationRequest.create({
            donation: donation._id,
            organization: req.verifiedOrganization._id,
            requestedBy: req.auth.userId,
            ...value
        });
        res.redirect("/ngo/requests?message=Equipment%20request%20submitted.");
    } catch (error) {
        if (error?.code === 11000) return res.redirect(`/ngo/equipment/${req.params.id}?message=${encodeURIComponent("Your organization has already requested this listing.")}`);
        next(error);
    }
};

export const showOrganizationRequests = async (req, res, next) => {
    try {
        const requests = await DonationRequest.find({ organization: req.verifiedOrganization._id })
            .sort({ createdAt: -1 })
            .populate({ path: "donation", select: "equipment condition quantity allocatedQuantity location status createdAt donor", populate: { path: "donor", select: "name email" } })
            .lean();
        for (const request of requests) {
            if (!request.donation) continue;
            if (["accepted", "completed"].includes(request.status)) {
                request.donorContact = request.donation.donor ? { name: request.donation.donor.name, email: request.donation.donor.email } : null;
            }
            delete request.donation.donor;
        }
        res.render("ngo-requests.ejs", { requests, organization: req.verifiedOrganization, message: String(req.query.message || "") });
    } catch (error) {
        next(error);
    }
};

export const showDonorRequests = async (req, res, next) => {
    try {
        const donationIds = await Donation.find({ donor: req.auth.userId }).distinct("_id");
        const requests = await DonationRequest.find({ donation: { $in: donationIds } })
            .sort({ createdAt: -1 })
            .populate({ path: "donation", select: "equipment condition quantity allocatedQuantity location status" })
            .populate({ path: "organization", select: "name description address contactPerson contactEmail phone" })
            .lean();
        for (const request of requests) {
            if (!request.organization) continue;
            request.organizationPublic = {
                name: request.organization.name,
                description: request.organization.description,
                address: request.organization.address
            };
            if (["accepted", "completed"].includes(request.status)) {
                request.organizationContact = {
                    contactPerson: request.organization.contactPerson,
                    contactEmail: request.organization.contactEmail,
                    phone: request.organization.phone
                };
            }
            delete request.organization;
        }
        res.render("donor-requests.ejs", { requests, message: String(req.query.message || "") });
    } catch (error) {
        next(error);
    }
};

export const decideEquipmentRequest = async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.requestId)) return res.status(404).send("Request not found");
        const decision = String(req.params.decision || "").toLowerCase();
        const { valid, value } = validateRequestDecision(req.body, decision);
        if (!valid) return res.redirect(`/donor/requests?message=${encodeURIComponent("Rejections require a reason of at least 10 characters; notes cannot exceed 500 characters.")}`);
        const request = await DonationRequest.findOne({ _id: req.params.requestId, status: "pending" }).select("donation quantity status");
        if (!request) return res.status(409).send("This request has already been decided or is unavailable.");
        const ownsDonation = await Donation.exists({ _id: request.donation, donor: req.auth.userId });
        if (!ownsDonation) return res.status(403).send("This request belongs to another donor's listing.");

        if (decision === "reject") {
            const rejected = await DonationRequest.findOneAndUpdate(
                { _id: request._id, status: "pending" },
                { $set: { status: "rejected", responseNote: value.responseNote, respondedAt: new Date(), respondedBy: req.auth.userId } },
                { new: true }
            );
            if (!rejected) return res.status(409).send("This request has already been decided.");
            return res.redirect("/donor/requests?message=Request%20rejected.");
        }

        const result = await acceptPendingRequest({ request, donorId: req.auth.userId, responseNote: value.responseNote, respondedBy: req.auth.userId });
        if (!result.accepted) {
            const message = result.reason === "capacity" ? "The listing no longer has enough unallocated quantity for this request." : "This request has already been decided.";
            return res.status(409).send(message);
        }
        res.redirect("/donor/requests?message=Request%20accepted.%20Contact%20details%20are%20now%20available.");
    } catch (error) {
        next(error);
    }
};

export const cancelEquipmentRequest = async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.requestId)) return res.status(404).send("Request not found");
        const request = await DonationRequest.findOneAndUpdate(
            { _id: req.params.requestId, organization: req.verifiedOrganization._id, status: "pending" },
            { $set: { status: "cancelled" } },
            { new: true }
        );
        if (!request) return res.status(409).send("Only a pending request owned by your organization can be cancelled.");
        res.redirect("/ngo/requests?message=Request%20cancelled.");
    } catch (error) {
        next(error);
    }
};
