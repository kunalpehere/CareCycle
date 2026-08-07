import { env } from "../config/env.js";

const commonOptions = {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    path: "/"
};

export const setAuthCookie = (res, token) => res.cookie("token", token, {
    ...commonOptions,
    maxAge: 30 * 60 * 1000
});

export const clearAuthCookie = (res) => res.clearCookie("token", commonOptions);
