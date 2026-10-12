import mongoose from "mongoose";
import path from "path";
import { Donation, EQUIPMENT_CONDITIONS, EQUIPMENT_TYPES } from "../models/Donation.js";
import { donationImageDirectory } from "../services/imageService.js";
import { DonationRequest } from "../models/DonationRequest.js";
import { availableListingQuery, withRemainingAvailability } from "../services/availabilityService.js";
import { BLOCKING_REQUEST_STATUSES } from "../services/requestPolicy.js";
import { positivePage } from '../services/ngoWorkspaceService.js';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normalizedFilter = (value, allowed) => allowed.includes(String(value || "").toLowerCase()) ? String(value).toLowerCase() : "";
const discoveryData = (overrides = {}) => ({ equipmentTypes: EQUIPMENT_TYPES, conditions: EQUIPMENT_CONDITIONS, ...overrides });
export const discoveryContext = query => new URLSearchParams(Object.entries({
    equipment: normalizedFilter(query.equipment, EQUIPMENT_TYPES), condition: normalizedFilter(query.condition, EQUIPMENT_CONDITIONS),
    location: typeof query.location === 'string' ? query.location.trim().slice(0, 100) : '', page: String(positivePage(query.page))
}).filter(([, value]) => value)).toString();

export const showEquipmentDiscovery = async (req, res, next) => {
    try {
        const filters = {
            equipment: normalizedFilter(req.query.equipment, EQUIPMENT_TYPES),
            condition: normalizedFilter(req.query.condition, EQUIPMENT_CONDITIONS),
            location: typeof req.query.location === 'string' ? req.query.location.trim().slice(0, 100) : ''
        };
        const query = availableListingQuery();
        if (filters.equipment) query.equipment = filters.equipment;
        if (filters.condition) query.condition = filters.condition;
        if (filters.location) {
            const pattern = new RegExp(escapeRegex(filters.location), "i");
            query.$or = [{ "location.city": pattern }, { "location.state": pattern }, { "location.postalCode": pattern }];
        }
        let page = positivePage(req.query.page);
        const pageSize = 12;
        const total = await Donation.countDocuments(query);
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        page = Math.min(page, totalPages);
        const donations = await Donation.find(query).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize)
            .select("equipment condition quantity allocatedQuantity handedOverQuantity description details location images createdAt").lean();
        const filterQuery = new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString();
        res.render("equipment-discovery.ejs", discoveryData({ donations: donations.map(withRemainingAvailability), filters, organization: req.verifiedOrganization, total, page, totalPages, filterQuery, returnQuery: discoveryContext({ ...filters, page: String(page) }) }));
    } catch (error) {
        next(error);
    }
};

export const showEquipmentDetail = async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).send("Equipment listing not found");
        const donation = await Donation.findOne({ _id: req.params.id, ...availableListingQuery() })
            .select("equipment condition quantity allocatedQuantity handedOverQuantity description details location images createdAt").lean();
        if (!donation) return res.status(404).send("Equipment listing not found");
        const pair = { donation: donation._id, organization: req.verifiedOrganization._id };
        const existingRequest = await DonationRequest.findOne({ ...pair, status: { $in: BLOCKING_REQUEST_STATUSES } })
            .sort({ createdAt: -1, _id: -1 }).select("status quantity createdAt").lean() ||
            await DonationRequest.findOne(pair).sort({ createdAt: -1, _id: -1 }).select("status quantity createdAt").lean();
        res.render("equipment-detail.ejs", { donation: withRemainingAvailability(donation), organization: req.verifiedOrganization, existingRequest, returnQuery: discoveryContext(req.query), message: String(req.query.message || "") });
    } catch (error) {
        next(error);
    }
};

export const serveDiscoveryImage = async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).send("Image not found");
        const filename = path.basename(req.params.filename);
        if (filename !== req.params.filename || !/^[a-f0-9-]+\.(jpg|png|webp)$/.test(filename)) return res.status(404).send("Image not found");
        const listed = await Donation.exists({ _id: req.params.id, ...availableListingQuery(), "images.filename": filename });
        if (!listed) return res.status(404).send("Image not found");
        res.sendFile(filename, { root: donationImageDirectory });
    } catch (error) {
        next(error);
    }
};
