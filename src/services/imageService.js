import crypto from "crypto";
import path from "path";
import { mkdir, unlink, writeFile } from "fs/promises";
import multer from "multer";

export const donationImageDirectory = path.join(path.resolve(), "uploads", "donations");
const supportedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

const donationUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 3, fields: 20 },
    fileFilter(req, file, callback) {
        callback(supportedTypes.has(file.mimetype) ? null : new Error("Only JPEG, PNG, and WebP images are allowed."), supportedTypes.has(file.mimetype));
    }
}).array("images", 3);

export const uploadDonationImages = (req, res, next) => donationUpload(req, res, (error) => {
    if (error) error.status = 400;
    next(error);
});

const matchesSignature = (file) => {
    const bytes = file.buffer;
    if (file.mimetype === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (file.mimetype === "image/png") return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (file.mimetype === "image/webp") return bytes.length >= 12 && bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
    return false;
};

export const saveDonationImages = async (files = []) => {
    if (files.some((file) => !matchesSignature(file))) {
        const error = new Error("An uploaded file does not match its declared image type.");
        error.status = 400;
        throw error;
    }
    await mkdir(donationImageDirectory, { recursive: true });
    const saved = [];
    try {
        for (const file of files) {
            const extension = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" }[file.mimetype];
            const filename = `${crypto.randomUUID()}${extension}`;
            await writeFile(path.join(donationImageDirectory, filename), file.buffer, { flag: "wx" });
            saved.push({ filename, originalName: path.basename(file.originalname).slice(0, 255), mimeType: file.mimetype, size: file.size });
        }
        return saved;
    } catch (error) {
        await removeDonationImages(saved);
        throw error;
    }
};

export const removeDonationImages = async (images = []) => {
    await Promise.all(images.map((image) => unlink(path.join(donationImageDirectory, path.basename(image.filename))).catch(() => undefined)));
};
