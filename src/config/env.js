import dotenv from "dotenv";

dotenv.config();

const requiredNames = ["MONGO_URI", "JWT_SECRET", "SESSION_SECRET"];
const missingNames = requiredNames.filter((name) => !process.env[name]);

if (missingNames.length > 0) {
    throw new Error(`Missing required environment variables: ${missingNames.join(", ")}`);
}

const positiveInteger = (value, fallback) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const env = Object.freeze({
    nodeEnv: process.env.NODE_ENV || "development",
    isProduction: process.env.NODE_ENV === "production",
    port: positiveInteger(process.env.PORT, 4000),
    mongoUri: process.env.MONGO_URI,
    mongoDbName: process.env.MONGO_DB_NAME || "CareCycle",
    jwtSecret: process.env.JWT_SECRET,
    sessionSecret: process.env.SESSION_SECRET,
    mailService: process.env.MAIL_SERVICE || "gmail",
    mailUser: process.env.MAIL_USER || "",
    mailPassword: process.env.MAIL_PASSWORD || "",
    mailFrom: process.env.MAIL_FROM || process.env.MAIL_USER || "",
    mailRecipients: (process.env.MAIL_RECIPIENTS || "").split(",").map((value) => value.trim()).filter(Boolean),
    appUrl: process.env.APP_URL || "http://localhost:4000"
});
