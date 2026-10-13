import { randomBytes } from "node:crypto";

// Set every runtime setting so dotenv cannot fill it from a developer's .env.
// Integration/browser harnesses replace the deliberately unreachable unit URI.
export const isolatedTestEnvironment = () => ({
    ...process.env,
    NODE_ENV: "test",
    DEMO_MODE: "false",
    NODE_OPTIONS: "",
    PORT: "4183",
    MONGO_URI: "mongodb://127.0.0.1:1",
    MONGO_DB_NAME: `carecycle_test_${randomBytes(8).toString("hex")}`,
    MONGO_REQUIRE_REPLICA_SET: "true",
    TRUST_PROXY: "false",
    JWT_SECRET: randomBytes(48).toString("hex"),
    SESSION_SECRET: randomBytes(48).toString("hex"),
    APP_URL: "http://127.0.0.1:1",
    MAIL_SERVICE: "",
    MAIL_USER: "",
    MAIL_PASSWORD: "",
    MAIL_FROM: "",
    MAIL_RECIPIENTS: "",
    CARECYCLE_BACKUP_KEY: "",
    // Do not accept an externally supplied database binary or download mirror.
    MONGOMS_SYSTEM_BINARY: "",
    MONGOMS_DOWNLOAD_URL: "",
    MONGOMS_DOWNLOAD_MIRROR: "https://fastdl.mongodb.org",
    MONGOMS_VERSION: "8.0.16",
    MONGOMS_MD5_CHECK: "true"
});
