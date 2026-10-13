import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export const createAccessToken = (userId, authVersion = 0) => jwt.sign({ id: userId, authVersion }, env.jwtSecret, {
    algorithm: "HS256",
    expiresIn: "30m"
});

export const verifyAccessToken = (token) => jwt.verify(token, env.jwtSecret, {
    algorithms: ["HS256"]
});
