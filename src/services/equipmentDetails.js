export const functionalOptions = { not_checked: "Not checked or unknown", working: "Reported working", partly_working: "Reported partly working", not_working: "Reported not working" };
export const conditionLabels = { "brand-new": "Unused", good: "Good appearance, some wear", used: "Used, visible wear", old: "Older, substantial wear" };
export const specifications = {
    wheelchair: [{ key: "seatWidthCm", label: "Seat width (cm)", type: "number", min: 1, max: 100 }, { key: "folding", label: "Folding frame", options: { unknown: "Unknown", yes: "Yes", no: "No" } }],
    walker: [{ key: "heightAdjustable", label: "Height adjustable", options: { unknown: "Unknown", yes: "Yes", no: "No" } }, { key: "folding", label: "Folding frame", options: { unknown: "Unknown", yes: "Yes", no: "No" } }],
    cane: [{ key: "heightAdjustable", label: "Height adjustable", options: { unknown: "Unknown", yes: "Yes", no: "No" } }],
    stethoscope: [{ key: "chestpiece", label: "Chestpiece type or description", type: "text", maxLength: 80 }, { key: "tubingCondition", label: "Reported tubing condition", options: { not_checked: "Not checked", intact: "Appears intact", worn: "Worn", damaged: "Damaged" } }]
};
export const scalarText = value => typeof value === "string" ? value.trim() : "";
export const validateEquipmentDetails = (body, equipment) => {
    const errors = {}, details = {};
    for (const [field, max] of Object.entries({ brand: 80, model: 80, defects: 500, missingAccessories: 500 })) {
        const text = scalarText(body[field]);
        if ((body[field] !== undefined && typeof body[field] !== "string") || text.length > max) errors[field] = `Enter text of at most ${max} characters.`;
        details[field] = text;
    }
    const functionalStatus = body.functionalStatus === undefined || body.functionalStatus === "" ? "not_checked" : body.functionalStatus;
    if (typeof functionalStatus !== "string" || !Object.hasOwn(functionalOptions, functionalStatus)) errors.functionalStatus = "Choose a reported functional condition.";
    details.functionalStatus = functionalStatus;
    details.specifications = {};
    for (const field of Object.hasOwn(specifications, equipment) ? specifications[equipment] : []) {
        const name = `${equipment}_spec_${field.key}`, raw = body[name] ?? body[`spec_${field.key}`], text = scalarText(raw);
        if (raw !== undefined && typeof raw !== "string") { errors[name] = "Enter one value for this field."; continue; }
        if (!text) continue;
        if (field.type === "number") {
            if (!/^\d+(\.\d)?$/.test(text) || Number(text) < field.min || Number(text) > field.max) errors[name] = `Enter ${field.min} to ${field.max}, with at most one decimal place, or leave blank.`;
            else details.specifications[field.key] = Number(text);
        } else if (field.options) {
            if (!Object.hasOwn(field.options, text)) errors[name] = "Choose one of the listed options.";
            else details.specifications[field.key] = text;
        } else if (text.length > field.maxLength) errors[name] = `Use at most ${field.maxLength} characters.`;
        else details.specifications[field.key] = text;
    }
    return { details, errors };
};
export const storedDetailsValid = (equipment, details) => {
    if (!details) return true;
    const spec = details.specifications?.toObject?.() || details.specifications || {};
    const allowed = new Set((Object.hasOwn(specifications, equipment) ? specifications[equipment] : []).map(field => field.key));
    if (Object.entries(spec).some(([key, value]) => value !== undefined && value !== null && !allowed.has(key))) return false;
    const body = { brand: details.brand, model: details.model, defects: details.defects, missingAccessories: details.missingAccessories, functionalStatus: details.functionalStatus };
    for (const [key, value] of Object.entries(spec)) if (value !== undefined && value !== null) body[`spec_${key}`] = String(value);
    return Object.keys(validateEquipmentDetails(body, equipment).errors).length === 0;
};
