import { randomBytes } from "node:crypto";
import signature from "cookie-signature";
import { env } from "../../src/config/env.js";
import { MongoSessionStore, SESSION_LIFETIME_MS } from "../../src/services/securityStoreService.js";
import { createAccessToken } from "../../src/services/tokenService.js";

// Private fixture setup, never a web route or production authentication bypass.
export const syntheticSession = async (user, token = createAccessToken(user.id, user.authVersion)) => {
    if (process.env.NODE_ENV !== "test" || !/^carecycle_test_/.test(process.env.MONGO_DB_NAME || "")) throw new Error("Synthetic sessions require an isolated test database.");
    const sid = randomBytes(24).toString("hex"), csrf = randomBytes(32).toString("hex");
    const value = { cookie: { expires: new Date(Date.now() + SESSION_LIFETIME_MS), originalMaxAge: SESSION_LIFETIME_MS, httpOnly: true, secure: false, sameSite: "lax", path: "/" }, csrfToken: csrf, auth: { userId: user.id, authVersion: user.authVersion ?? 0 } };
    const store = new MongoSessionStore();
    await new Promise((resolve, reject) => store.set(sid, value, error => error ? reject(error) : resolve()));
    return { sid, csrf, cookie: `token=${token}; carecycle.sid=${encodeURIComponent("s:" + signature.sign(sid, env.sessionSecret))}` };
};
