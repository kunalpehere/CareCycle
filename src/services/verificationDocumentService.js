import crypto from "crypto";
import path from "path";
import { mkdir, unlink, writeFile } from "fs/promises";
import multer from "multer";

export const verificationDocumentDirectory = path.join(path.resolve(), "uploads", "verification-documents");
const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);

const verificationUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 30 },
    fileFilter(req, file, callback) {
        const allowed = allowedTypes.has(file.mimetype);
        callback(allowed ? null : new Error("Verification documents must be PDF, JPEG, or PNG files."), allowed);
    }
}).single("verificationDocument");

export const uploadVerificationDocument = (req, res, next) => verificationUpload(req, res, (error) => {
    if (error) error.status = 400;
    next(error);
});

const validSignature = (file) => {
    const bytes = file.buffer;
    if (file.mimetype === "application/pdf") return bytes.length >= 5 && bytes.subarray(0, 5).toString() === "%PDF-";
    if (file.mimetype === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (file.mimetype === "image/png") return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    return false;
};

export const saveVerificationDocument = async (file) => {
    if (!file) {
        const error = new Error("A verification document is required.");
        error.status = 400;
        throw error;
    }
    if (!validSignature(file)) {
        const error = new Error("The verification document does not match its declared file type.");
        error.status = 400;
        throw error;
    }
    await mkdir(verificationDocumentDirectory, { recursive: true });
    const extension = { "application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png" }[file.mimetype];
    const filename = `${crypto.randomUUID()}${extension}`;
    await writeFile(path.join(verificationDocumentDirectory, filename), file.buffer, { flag: "wx" });
    return { filename, originalName: path.basename(file.originalname).slice(0, 255), mimeType: file.mimetype, size: file.size };
};

export const removeVerificationDocument = async (document) => {
    if (!document?.filename) return;
    await unlink(path.join(verificationDocumentDirectory, path.basename(document.filename))).catch(() => undefined);
};
