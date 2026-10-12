import { EQUIPMENT_CONDITIONS, EQUIPMENT_TYPES } from "../models/Donation.js";
import { SELF_REGISTERABLE_ROLES } from "../services/roleService.js";
import { scalarText, validateEquipmentDetails, specifications } from "../services/equipmentDetails.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

export const validateRegistration = (body) => {
    const value = {
        name: String(body.name || "").trim(),
        email: normalizeEmail(body.email),
        password: String(body.password || ""),
        role: String(body.role || "").trim().toLowerCase()
    };
    const valid = value.name.length >= 2 && value.name.length <= 80 && emailPattern.test(value.email)
        && value.email.length <= 254 && value.password.length >= 8 && value.password.length <= 128
        && SELF_REGISTERABLE_ROLES.includes(value.role);
    return { valid, value };
};

export const validateLogin = (body) => {
    const value = { email: normalizeEmail(body.email), password: String(body.password || "") };
    return { valid: emailPattern.test(value.email) && value.email.length <= 254 && value.password.length > 0 && value.password.length <= 128, value };
};

export const validateDonation = (body) => {
    const value = {
        equipment: String(body.equipment || "").trim().toLowerCase(),
        condition: String(body.quality || body.condition || "").trim().toLowerCase(),
        quantity: Number(body.quantity),
        description: String(body.description || "").trim(),
        location: {
            city: String(body.city || "").trim(),
            state: String(body.state || "").trim(),
            postalCode: String(body.postalCode || "").trim()
        }
    };
    const detailResult = validateEquipmentDetails(body, value.equipment);
    value.details = detailResult.details;
    const errors = { ...detailResult.errors };
    if (typeof body.equipment !== "string" || !EQUIPMENT_TYPES.includes(value.equipment)) errors.equipment = "Choose a supported equipment type.";
    if (typeof (body.quality || body.condition) !== "string" || !EQUIPMENT_CONDITIONS.includes(value.condition)) errors.quality = "Choose an appearance condition.";
    if (typeof body.quantity !== "string" || !Number.isInteger(value.quantity) || value.quantity < 1 || value.quantity > 100) errors.quantity = "Enter a whole quantity from 1 to 100.";
    for (const [field, min, max] of [["description", 10, 1000], ["city", 2, 100], ["state", 2, 100], ["postalCode", 3, 20]]) {
        if (typeof body[field] !== "string" || scalarText(body[field]).length < min || scalarText(body[field]).length > max) errors[field] = `Use ${min} to ${max} characters.`;
    }
    const draft = {};
    for (const key of ["equipment", "quality", "quantity", "description", "city", "state", "postalCode", "brand", "model", "functionalStatus", "defects", "missingAccessories", "spec_seatWidthCm", "spec_folding", "spec_heightAdjustable", "spec_chestpiece", "spec_tubingCondition"]) draft[key] = scalarText(body[key]).slice(0, 1000);
    draft.quality = scalarText(body.quality || body.condition).slice(0, 1000);
    for (const [category, fields] of Object.entries(specifications)) for (const field of fields) draft[`${category}_spec_${field.key}`] = scalarText(body[`${category}_spec_${field.key}`] ?? (category === value.equipment ? body[`spec_${field.key}`] : "")).slice(0, 1000);
    return { valid: Object.keys(errors).length === 0, value, errors, draft };
};

export const validateContact = (body) => {
    const value = { name: String(body.name || "").trim(), email: normalizeEmail(body.email), message: String(body.message || "").trim() };
    const valid = value.name.length >= 2 && value.name.length <= 80 && emailPattern.test(value.email) && value.email.length <= 254 && value.message.length >= 5 && value.message.length <= 2000;
    return { valid, value };
};

export const validateOrganization = (body) => {
    const value = {
        name: String(body.name || "").trim(),
        registrationNumber: String(body.registrationNumber || "").trim().toUpperCase(),
        contactPerson: String(body.contactPerson || "").trim(),
        contactEmail: normalizeEmail(body.contactEmail),
        phone: String(body.phone || "").trim(),
        website: String(body.website || "").trim(),
        description: String(body.description || "").trim(),
        address: {
            line1: String(body.line1 || "").trim(),
            city: String(body.city || "").trim(),
            state: String(body.state || "").trim(),
            postalCode: String(body.postalCode || "").trim()
        }
    };
    let websiteValid = true;
    if (value.website) {
        try {
            const parsed = new URL(value.website);
            websiteValid = parsed.protocol === "https:" || parsed.protocol === "http:";
        } catch (error) {
            websiteValid = false;
        }
    }
    const valid = value.name.length >= 2 && value.name.length <= 150
        && value.registrationNumber.length >= 3 && value.registrationNumber.length <= 100
        && value.contactPerson.length >= 2 && value.contactPerson.length <= 100
        && emailPattern.test(value.contactEmail) && value.contactEmail.length <= 254
        && value.phone.length >= 7 && value.phone.length <= 30
        && websiteValid
        && value.description.length >= 20 && value.description.length <= 1500
        && value.address.line1.length >= 5 && value.address.line1.length <= 200
        && value.address.city.length >= 2 && value.address.city.length <= 100
        && value.address.state.length >= 2 && value.address.state.length <= 100
        && value.address.postalCode.length >= 3 && value.address.postalCode.length <= 20;
    return { valid, value };
};

export const validateDonationRequest = (body, availableQuantity) => {
    const value = {
        quantity: Number(body.quantity),
        beneficiary: String(body.beneficiary || "").trim(),
        message: String(body.message || "").trim()
    };
    const maximum = Number(availableQuantity);
    const valid = Number.isInteger(value.quantity) && value.quantity >= 1 && value.quantity <= maximum && maximum <= 100
        && value.beneficiary.length >= 10 && value.beneficiary.length <= 500
        && value.message.length >= 20 && value.message.length <= 1000;
    return { valid, value };
};

export const validateRequestDecision = (body, decision) => {
    const responseNote = String(body.responseNote || "").trim();
    const validDecision = decision === "accept" || decision === "reject";
    const validNote = responseNote.length <= 500 && (decision !== "reject" || responseNote.length >= 10);
    return { valid: validDecision && validNote, value: { responseNote } };
};

export const validateAdminAccessRequest = (body) => {
    const value = {
        name: String(body.name || "").trim(),
        workEmail: normalizeEmail(body.workEmail),
        department: String(body.department || "").trim(),
        justification: String(body.justification || "").trim()
    };
    const valid = value.name.length >= 2 && value.name.length <= 80
        && emailPattern.test(value.workEmail) && value.workEmail.length <= 254
        && value.department.length >= 2 && value.department.length <= 120
        && value.justification.length >= 30 && value.justification.length <= 1000;
    return { valid, value };
};
