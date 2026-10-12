import mongoose from "mongoose";
import { DonationRequest } from "../models/DonationRequest.js";
import { Donation } from "../models/Donation.js";
import { formatPickupTime, pickupVersion, updatePickup, validatePickupProposal, validatePickupReason, reportPickupIssue } from "../services/pickupService.js";
import { cancelAcceptedRequest } from "../services/acceptedCancellationService.js";

const ownedRequest = async req => {
    if (!mongoose.Types.ObjectId.isValid(req.params.requestId)) return null;
    const request = await DonationRequest.findById(req.params.requestId).lean();
    if (!request) return null;
    if (req.auth.user.role === "ngo") return String(request.organization) === String(req.verifiedOrganization._id) ? request : null;
    return await Donation.exists({ _id: request.donation, donor: req.auth.userId }) ? request : null;
};

const renderPickup = (req, res, request, message = "", status = 200, values = null) => res.status(status).render("pickup.ejs", {
    request, message, values, formatPickupTime, role: req.auth.user.role,
    base: `/${req.auth.user.role}/requests/${request._id}/pickup`
});

export const showPickup = async (req, res, next) => {
    try {
        const request = await ownedRequest(req);
        if (!request) return res.status(404).send("Request not found");
        if (request.status !== "accepted" && !(request.status === "cancelled" && request.cancellation)) return res.status(409).send("Pickup arrangements require an accepted request. Return to your request history.");
        return renderPickup(req, res, request, String(req.query.message || ""));
    } catch (error) { next(error); }
};

export const changePickup = async (req, res, next) => {
    try {
        const request = await ownedRequest(req);
        if (!request) return res.status(404).send("Request not found");
        const action = req.params.action;
        if (!["propose", "confirm", "cancel", "missed", "dispute", "resolve"].includes(action)) return res.status(404).send("Pickup action not found");
        if (request.status !== "accepted") return request.cancellation ? renderPickup(req, res, request, "This request is already cancelled. The release and history were preserved.", 409) : res.status(409).send("Pickup arrangements require an accepted request. Return to your request history.");
        const version = pickupVersion(req.body._version);
        if (version === null || version !== (request.pickup?.version || 0)) return renderPickup(req, res, request, "The pickup plan changed or this form is outdated. Review the current plan before submitting again.", 409);
        let proposal;
        if (action === "propose") {
            const result = validatePickupProposal(req.body);
            if (!result.valid) return renderPickup(req, res, request, result.message, 422, Object.fromEntries(["localStart", "localEnd", "timeZone", "address", "instructions"].map(key => [key, typeof req.body[key] === "string" ? req.body[key] : ""])));
            proposal = result.value;
        }
        const issue = ["cancel", "missed", "dispute", "resolve"].includes(action);
        const noHandover = req.body.noHandover === "yes";
        if (issue && (!validatePickupReason(req.body) || (action !== "dispute" && !noHandover))) return renderPickup(req, res, request, "Enter a reason between 10 and 500 characters and confirm that no equipment has been handed over when required.", 422);
        const input = { request, version, actorId: req.auth.userId, actorRole: req.auth.user.role, action, proposal, reason: req.body.reason, noHandover };
        const changed = action === "cancel" ? await cancelAcceptedRequest({ ...input, requestId: request._id, organizationId: req.verifiedOrganization?._id }) : issue ? await reportPickupIssue(input) : await updatePickup(input);
        if (!changed) {
            const latest = await ownedRequest(req);
            if (!latest) return res.status(404).send("Request not found");
            return renderPickup(req, res, latest, "This action could not be applied. Review the current state, time window, participant permissions and any disagreement or handover evidence before trying again.", 409);
        }
        const messages = { confirm: "Pickup confirmation recorded.", propose: "Pickup proposal recorded.", cancel: "Request cancelled. Reserved units released.", missed: "Missed pickup report recorded.", dispute: "Disagreement recorded.", resolve: "Disagreement withdrawal recorded." };
        return res.redirect(`/${req.auth.user.role}/requests/${request._id}/pickup?message=${encodeURIComponent(messages[action])}`);
    } catch (error) { next(error); }
};
