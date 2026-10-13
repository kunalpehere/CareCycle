import { env } from "../config/env.js";
export const authCookieName = env.isProduction ? "__Host-carecycle.token" : "token";
export const sessionCookieName = env.isProduction ? "__Host-carecycle.sid" : "carecycle.sid";

const commonOptions = {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    path: "/"
};

export const setAuthCookie = (res, token) => res.cookie(authCookieName, token, {
    ...commonOptions,
    maxAge: 30 * 60 * 1000
});

export const clearAuthCookie = (res) => res.clearCookie(authCookieName, commonOptions);
export const clearSessionCookie = res => res.clearCookie(sessionCookieName, commonOptions);
