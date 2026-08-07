import mongoose from "mongoose";
import path from "path";
import { Donation, EQUIPMENT_CONDITIONS, EQUIPMENT_TYPES } from "../models/Donation.js";
import { donationImageDirectory } from "../services/imageService.js";
import { DonationRequest } from "../models/DonationRequest.js";

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normalizedFilter = (value, allowed) => allowed.includes(String(value || "").toLowerCase()) ? String(value).toLowerCase() : "";
const discoveryData = (overrides = {}) => ({ equipmentTypes: EQUIPMENT_TYPES, conditions: EQUIPMENT_CONDITIONS, ...overrides });

export const showEquipmentDiscovery = async (req, res, next) => {
    try {
        const filters = {
            equipment: normalizedFilter(req.query.equipment, EQUIPMENT_TYPES),
            condition: normalizedFilter(req.query.condition, EQUIPMENT_CONDITIONS),
            location: String(req.query.location || "").trim().slice(0, 100)
        };
        const query = { status: "available" };
        if (filters.equipment) query.equipment = filters.equipment;
        if (filters.condition) query.condition = filters.condition;
        if (filters.location) {
            const pattern = new RegExp(escapeRegex(filters.location), "i");
            query.$or = [{ "location.city": pattern }, { "location.state": pattern }, { "location.postalCode": pattern }];
        }
        const requestedPage = Number.parseInt(req.query.page, 10);
        const page = Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 1000) : 1;
        const pageSize = 12;
        const [donations, total] = await Promise.all([
            Donation.find(query).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize)
                .select("equipment condition quantity description location images createdAt").lean(),
            Donation.countDocuments(query)
        ]);
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const filterQuery = new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString();
        res.render("equipment-discovery.ejs", discoveryData({ donations, filters, organization: req.verifiedOrganization, total, page, totalPages, filterQuery }));
    } catch (error) {
        next(error);
    }
};

export const showEquipmentDetail = async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).send("Equipment listing not found");
        const donation = await Donation.findOne({ _id: req.params.id, status: "available" })
            .select("equipment condition quantity description location images createdAt").lean();
        if (!donation) return res.status(404).send("Equipment listing not found");
        const existingRequest = await DonationRequest.findOne({ donation: donation._id, organization: req.verifiedOrganization._id })
            .select("status quantity createdAt").lean();
        res.render("equipment-detail.ejs", { donation, organization: req.verifiedOrganization, existingRequest, message: String(req.query.message || "") });
    } catch (error) {
        next(error);
    }
};

export const serveDiscoveryImage = async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).send("Image not found");
        const filename = path.basename(req.params.filename);
        if (filename !== req.params.filename || !/^[a-f0-9-]+\.(jpg|png|webp)$/.test(filename)) return res.status(404).send("Image not found");
        const listed = await Donation.exists({ _id: req.params.id, status: "available", "images.filename": filename });
        if (!listed) return res.status(404).send("Image not found");
        res.sendFile(filename, { root: donationImageDirectory });
    } catch (error) {
        next(error);
    }
};
