import crypto from "crypto";
import path from "path";
import { writePrivateMedia, removePrivateMedia } from "./privateStorageService.js";
import { logEvent } from "./observabilityService.js";
import multer from "multer";

const supportedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

const donationUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 3, fields: 40, fieldSize: 20000 },
    fileFilter(req, file, callback) {
        callback(supportedTypes.has(file.mimetype) ? null : new Error("Only JPEG, PNG, and WebP images are allowed."), supportedTypes.has(file.mimetype));
    }
}).array("images", 3);

export const uploadDonationImages = (req, res, next) => donationUpload(req, res, (error) => {
    if (error) req.donationUploadError = "Choose up to three JPEG, PNG or WebP images, each no larger than 5 MB. Check the submitted field sizes too.";
    next();
});

export const matchesImageSignature = (file) => {
    const bytes = file.buffer;
    if (file.mimetype === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (file.mimetype === "image/png") return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (file.mimetype === "image/webp") return bytes.length >= 12 && bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
    return false;
};

export const saveDonationImages = async (files = []) => {
    if (files.length > 3 || files.some((file) => !matchesImageSignature(file) || file.size !== file.buffer.length || file.size < 1 || file.size > 5 * 1024 * 1024)) {
        const error = new Error("An uploaded file does not match its declared image type.");
        error.status = 400;
        throw error;
    }
    const saved = [];
    try {
        for (const file of files) {
            const extension = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" }[file.mimetype];
            const filename = `${crypto.randomUUID()}${extension}`;
            saved.push(await writePrivateMedia("donations", { filename, originalName: path.basename(file.originalname.replaceAll("\\", "/")).replace(/[\x00-\x1f\x7f]/g, "").slice(0, 255) || "image", mimeType: file.mimetype, size: file.size }, file.buffer));
        }
        return saved;
    } catch (error) {
        await removeDonationImages(saved);
        throw error;
    }
};

export const removeDonationImages = async (images = []) => {
    const results = await Promise.allSettled(images.map((image) => removePrivateMedia("donations", image)));
    if (results.some(result => result.status === "rejected")) logEvent("media.cleanup_deferred", { code: "cleanup_deferred" });
};
