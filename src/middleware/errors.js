export const notFound = (req, res) => res.status(404).send("Page not found");

export const errorHandler = (error, req, res, next) => {
    console.error("Request failed", { method: req.method, path: req.path, message: error.message });
    if (res.headersSent) return next(error);
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 500;
    return res.status(status).send(status === 500 ? "Something went wrong. Please try again later." : error.message);
};
