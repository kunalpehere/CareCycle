import { Router } from "express";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { DEMO_IDS, DEMO_WRITE_LIMIT } from "../services/demoService.js";
import { createAccessToken } from "../services/tokenService.js";
import { setAuthCookie } from "../services/authCookieService.js";
import { getDashboardPath } from "../services/roleService.js";
import { verifyCsrfToken } from "../middleware/csrf.js";
import { authRateLimit } from "../middleware/rateLimit.js";

export const demoRoutes = Router();
demoRoutes.use("/demo", (req, res, next) => env.demoMode ? next() : res.sendStatus(404));
demoRoutes.get("/demo", (req, res) => res.render("demo.ejs", { writeLimit: DEMO_WRITE_LIMIT }));
demoRoutes.post("/demo/login", authRateLimit, verifyCsrfToken, async (req, res, next) => {
    try {
        if (!["donor", "ngo"].includes(req.body.role)) return res.status(400).send("Choose donor or NGO.");
        const user = await User.findOne({ _id: DEMO_IDS[req.body.role], role: req.body.role, status: "active" });
        if (!user) return res.sendStatus(503);
        await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
        req.session.auth = { userId: user.id, authVersion: user.authVersion };
        await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
        setAuthCookie(res, createAccessToken(user.id, user.authVersion));
        res.redirect(getDashboardPath(user.role));
    } catch (error) { next(error); }
});
