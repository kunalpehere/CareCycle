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
import { receiptRoutes } from "./routes/receiptRoutes.js";
import { notificationRoutes } from "./routes/notificationRoutes.js";
import { adminReviewRoutes } from "./routes/adminReviewRoutes.js";
import { MongoSessionStore, SESSION_LIFETIME_MS } from "./services/securityStoreService.js";
import { sessionCookieName } from "./services/authCookieService.js";

export const createApp = ({ sessionStore = new MongoSessionStore() } = {}) => {
    const app = express();
    app.disable("x-powered-by");
    app.set("trust proxy", env.trustProxy);
    app.set("view engine", "ejs");
    app.set("views", path.join(path.resolve(), "views"));
    app.use(securityHeaders);
    app.use(express.static(path.join(path.resolve(), "public")));
    app.use(express.urlencoded({ extended: false, limit: "20kb" }));
    app.use(express.json({ limit: "20kb" }));
    app.use(cookieParser());
    app.use(session({
        store: sessionStore,
        name: sessionCookieName,
        secret: env.sessionSecret,
        resave: false,
        saveUninitialized: false,
        rolling: true,
        cookie: { httpOnly: true, secure: env.isProduction, sameSite: "lax", path: "/", maxAge: SESSION_LIFETIME_MS }
    }));
    app.use(issueCsrfToken);
    app.use(authRoutes);
    app.use(adminReviewRoutes);
    app.use(notificationRoutes);
    app.use(pageRoutes);
    app.use(dashboardRoutes);
    app.use(organizationRoutes);
    app.use(discoveryRoutes);
    app.use(receiptRoutes);
    app.use(requestRoutes);
    app.use(donationRoutes);
    app.use(contactRoutes);
    app.use(notFound);
    app.use(errorHandler);
    return app;
};
