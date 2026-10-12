export const respondError = (req, res, status, message) => {
    if (req.accepts?.(["html", "json"]) === "html") {
        res.setHeader("Cache-Control", "private, no-store"); res.vary("Cookie");
        return res.status(status).render("request-error.ejs", { status, message });
    }
    return res.status(status).send(message);
};
export const notFound = (req, res) => respondError(req, res, 404, "Page not found");

export const errorHandler = (error, req, res, next) => {
    console.error("Request failed", { method: req.method, path: req.path, message: error.message });
    if (res.headersSent) return next(error);
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 500;
    return respondError(req, res, status, status === 500 ? "Something went wrong. Please try again later." : error.message);
};
