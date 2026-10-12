import mongoose from "mongoose";
import { Donation } from "../models/Donation.js";
import { DonationRequest } from "../models/DonationRequest.js";
import { validateDonationRequest, validateRequestDecision } from "../validators/input.js";
import { acceptPendingRequest, createPendingRequest } from "../services/matchingService.js";
import { availableListingQuery } from "../services/availabilityService.js";
import { quantityAccounting } from "../services/quantityContract.js";
import { workflowConflict } from "../services/workflowConflict.js";
import { runTransaction } from "../services/transactionService.js";
import { recordRequestEvent } from "../services/notificationService.js";

export const createEquipmentRequest = async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).send("Equipment listing not found");
        const donation = await Donation.findOne({ _id: req.params.id, ...availableListingQuery() }).select("quantity allocatedQuantity handedOverQuantity");
        if (!donation) return await workflowConflict(req, res, { donationId: req.params.id, message: "This equipment is no longer requestable. Review current availability and your request history." });
        const { valid, value } = validateDonationRequest(req.body, quantityAccounting(donation).available);
        if (!valid) return await workflowConflict(req, res, { donationId: donation._id, message: "Enter a quantity within current availability, a beneficiary summary and a valid need statement." });

        const created = await createPendingRequest({
            donation: donation._id,
            organization: req.verifiedOrganization._id,
            requestedBy: req.auth.userId,
            ...value
        });
        if (!created) return await workflowConflict(req, res, { donationId: donation._id, message: "Availability changed while you submitted the form. Review current stock before trying again." });
        res.redirect("/ngo/requests?message=Equipment%20request%20submitted.");
    } catch (error) {
        if (error?.code === 11000) return workflowConflict(req, res, { donationId: req.params.id, message: "Your organization already has a pending, accepted or completed request for this listing. Review its history." }).catch(next);
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
        const query = { donation: { $in: donationIds } };
        if (req.query.request !== undefined) {
            if (!mongoose.Types.ObjectId.isValid(req.query.request)) return res.status(404).send("Request not found");
            query._id = req.query.request;
        }
        const requests = await DonationRequest.find(query)
            .sort({ createdAt: -1 })
            .populate({ path: "donation", select: "equipment condition quantity allocatedQuantity location status" })
            .populate({ path: "organization", select: "name description address contactPerson contactEmail phone" })
            .lean();
        if (req.query.request !== undefined && !requests.length) return res.status(404).send("Request not found");
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
        const request = await DonationRequest.findById(req.params.requestId).select("donation quantity status");
        if (!request) return res.status(404).send("Request not found");
        const ownsDonation = await Donation.exists({ _id: request.donation, donor: req.auth.userId });
        if (!ownsDonation) return res.status(403).send("This request belongs to another donor's listing.");
        if (request.status !== "pending") return await workflowConflict(req, res, { donor: true, donationId: request.donation, message: "This request has already been decided. Its recorded decision was preserved." });

        if (decision === "reject") {
            const rejected = await runTransaction(DonationRequest.db, async session => {
                const changed = await DonationRequest.findOneAndUpdate(
                    { _id: request._id, status: "pending" },
                    { $set: { status: "rejected", responseNote: value.responseNote, respondedAt: new Date(), respondedBy: req.auth.userId } },
                    { new: true, session }
                );
                if (changed) await recordRequestEvent({ request: changed, kind: "request_rejected", key: "rejected", session });
                return changed;
            });
            if (!rejected) return await workflowConflict(req, res, { donor: true, donationId: request.donation, message: "Another action already resolved this request. Review its history." });
            return res.redirect("/donor/requests?message=Request%20rejected.");
        }

        const result = await acceptPendingRequest({ request, donorId: req.auth.userId, responseNote: value.responseNote, respondedBy: req.auth.userId });
        if (!result.accepted) {
            if (result.reason === "ownership") return res.status(403).send("This request belongs to another donor's listing.");
            const message = result.reason === "capacity" ? "The listing no longer has enough unallocated quantity for this request." : "This request has already been decided.";
            return await workflowConflict(req, res, { donor: true, donationId: request.donation, message });
        }
        res.redirect("/donor/requests?message=Request%20accepted.%20Contact%20details%20are%20now%20available.");
    } catch (error) {
        next(error);
    }
};

export const cancelEquipmentRequest = async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.requestId)) return res.status(404).send("Request not found");
        const owned = await DonationRequest.findOne({ _id: req.params.requestId, organization: req.verifiedOrganization._id }).select("donation");
        if (!owned) return res.status(404).send("Request not found");
        const request = await runTransaction(DonationRequest.db, async session => {
            const changed = await DonationRequest.findOneAndUpdate(
                { _id: req.params.requestId, organization: req.verifiedOrganization._id, status: "pending" },
                { $set: { status: "cancelled", resolutionReason: "organization_cancelled", responseNote: "Your organization cancelled this pending request.", respondedAt: new Date(), respondedBy: req.auth.userId } },
                { new: true, session }
            );
            if (changed) await recordRequestEvent({ request: changed, kind: "request_cancelled", key: "cancelled", session });
            return changed;
        });
        if (!request) return await workflowConflict(req, res, { donationId: owned.donation, message: "Only a pending request can be cancelled here. Review the recorded decision before continuing." });
        res.redirect("/ngo/requests?message=Request%20cancelled.");
    } catch (error) {
        next(error);
    }
};
