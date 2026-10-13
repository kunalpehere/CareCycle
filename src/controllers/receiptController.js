import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { DonationRequest } from "../models/DonationRequest.js";
import { Donation } from "../models/Donation.js";
import { canIssueReceipt, changeReceipt, receiptActions, validateReceiptInput } from "../services/receiptService.js";
import { pickupVersion } from "../services/pickupService.js";

const ownedReceiptRequest = async req => {
    if (!mongoose.Types.ObjectId.isValid(req.params.requestId)) return null;
    const request = await DonationRequest.findById(req.params.requestId).lean();
    if (!request) return null;
    const role = req.auth.user.role;
    if (role === "admin") return request;
    if (role === "ngo") return String(request.organization) === String(req.verifiedOrganization._id) ? request : null;
    if (request.receipt) return String(request.receipt.donorId) === String(req.auth.userId) ? request : null;
    return await Donation.exists({ _id: request.donation, donor: req.auth.userId }) ? request : null;
};
const basePath = (req, request) => `/${req.auth.user.role}/requests/${request._id}/receipt`;
const renderReceipt = (req, res, request, message = "", status = 200) => res.status(status).render("receipt.ejs", {
    request, role: req.auth.user.role, base: basePath(req, request), canIssueReceipt,
    message, latest: request.receipt?.revisions.at(-1) || null
});
export const showReceipt = async (req, res, next) => {
    try {
        const request = await ownedReceiptRequest(req);
        if (!request) return res.status(404).send("Receipt request not found");
        return renderReceipt(req, res, request, String(req.query.message || ""));
    } catch (error) { next(error); }
};
export const receiptDocument = async (req, res, next) => {
    try {
        const request = await ownedReceiptRequest(req);
        if (!request) return res.status(404).send("Receipt request not found");
        const revision = req.query.revision === undefined ? request.receipt?.revisions.at(-1) : typeof req.query.revision === "string" && /^[1-9]\d*$/.test(req.query.revision) ? request.receipt?.revisions.find(value => value.number === Number(req.query.revision)) : null;
        if (!revision) return res.status(404).send("Receipt revision not found");
        const styles = [...revision.html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(match => `'sha256-${createHash("sha256").update(match[1].replace(/\r\n?/g, "\n")).digest("base64")}'`);
        res.setHeader("Content-Security-Policy", `default-src 'none'; style-src ${styles.join(" ") || "'none'"}; style-src-attr 'none'; script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`);
        if (req.path.endsWith("/download")) res.setHeader("Content-Disposition", `attachment; filename="${request.receipt.reference}-r${revision.number}.html"`);
        return res.type("html").send(revision.html);
    } catch (error) { next(error); }
};
export const updateReceipt = async (req, res, next) => {
    try {
        const request = await ownedReceiptRequest(req);
        if (!request) return res.status(404).send("Receipt request not found");
        const action = req.params.action;
        if (!receiptActions.includes(action)) return res.status(404).send("Receipt action not found");
        if (!validateReceiptInput(action, req.body)) return renderReceipt(req, res, request, "Enter bounded receipt details and confirm they contain no identifying beneficiary information.", 422);
        const changed = await changeReceipt({ requestId: request._id, version: pickupVersion(req.body._version), actorId: req.auth.userId, actorRole: req.auth.user.role, organizationId: req.verifiedOrganization?._id, action, body: req.body });
        if (!changed) {
            const latestRequest = await ownedReceiptRequest(req);
            if (!latestRequest) return res.status(404).send("Receipt request not found");
            return renderReceipt(req, res, latestRequest, "The receipt action could not be applied. Review the latest version, completion evidence, pending amendment and participant permissions.", 409);
        }
        return res.redirect(`${basePath(req, request)}?message=Receipt%20action%20recorded.`);
    } catch (error) { next(error); }
};

export const listAdministrationReceipts = async (req, res, next) => {
    try {
        const page = typeof req.query.page === "string" && /^[1-9]\d{0,4}$/.test(req.query.page) ? Number(req.query.page) : 1;
        const filter = { "receipt.reference": { $exists: true } };
        const [requests, count] = await Promise.all([DonationRequest.find(filter).sort({ _id: -1 }).skip((page - 1) * 20).limit(20).select("receipt.reference receipt.revisions.number receipt.revisions.snapshot").lean(), DonationRequest.countDocuments(filter)]);
        res.render("admin-receipts.ejs", { requests, page, count });
    } catch (error) { next(error); }
};
