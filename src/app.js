import express from "express";
import path from "path";
import cookieParser from "cookie-parser";
import session from "express-session";
import { env } from "./config/env.js";
import { issueCsrfToken } from "./middleware/csrf.js";
import { errorHandler, notFound } from "./middleware/errors.js";
import { securityHeaders } from "./middleware/security.js";
import { authRoutes } from "./routes/authRoutes.js";
import { contactRoutes } from "./routes/contactRoutes.js";
import { donationRoutes } from "./routes/donationRoutes.js";
import { pageRoutes } from "./routes/pageRoutes.js";
import { dashboardRoutes } from "./routes/dashboardRoutes.js";
import { organizationRoutes } from "./routes/organizationRoutes.js";
import { discoveryRoutes } from "./routes/discoveryRoutes.js";
import { requestRoutes } from "./routes/requestRoutes.js";

export const createApp = () => {
    const app = express();
    app.disable("x-powered-by");
    app.set("view engine", "ejs");
    app.set("views", path.join(path.resolve(), "views"));
    app.use(securityHeaders);
    app.use(express.static(path.join(path.resolve(), "public")));
    app.use(express.urlencoded({ extended: false, limit: "20kb" }));
    app.use(express.json({ limit: "20kb" }));
    app.use(cookieParser());
    app.use(session({
        name: "carecycle.sid",
        secret: env.sessionSecret,
        resave: false,
        saveUninitialized: false,
        cookie: { httpOnly: true, secure: env.isProduction, sameSite: "lax", maxAge: 30 * 60 * 1000 }
    }));
    app.use(issueCsrfToken);
    app.use(authRoutes);
    app.use(pageRoutes);
    app.use(dashboardRoutes);
    app.use(organizationRoutes);
    app.use(discoveryRoutes);
    app.use(requestRoutes);
    app.use(donationRoutes);
    app.use(contactRoutes);
    app.use(notFound);
    app.use(errorHandler);
    return app;
};
