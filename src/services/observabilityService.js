import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

const context = new AsyncLocalStorage();
const events = new Set(["request.completed", "request.failed", "mail.sent", "mail.failed", "mail.disabled", "worker.started", "worker.stopped", "worker.failed", "media.cleanup_deferred", "server.started", "startup.failed", "task.failed", "task.completed"]);
const codes = new Set(["input_invalid", "not_found", "forbidden", "unauthenticated", "conflict", "rate_limited", "payload_too_large", "security_unavailable", "media_unavailable", "database_unavailable", "internal_failure", "delivery_failed", "mail_disabled", "worker_batch_failed", "cleanup_deferred", "startup_failed", "configuration_invalid", "recovery_quarantined"]);
const methods = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
const channels = new Set(["notification", "account", "contact", "donation"]);
const uuid = value => typeof value === "string" && /^[a-f0-9-]{36}$/.test(value);
const safeRoute = value => typeof value === "string" && value.length <= 160 && /^\/[a-zA-Z0-9_/:.*-]*$/.test(value) ? value : "unmatched";

export const createTelemetry = ({ write = line => console.log(line) } = {}) => {
    const startedAt = new Date().toISOString();
    const metrics = { requests: 0, clientErrors: 0, serverErrors: 0, aborted: 0, durationMsTotal: 0, durationMsMax: 0, emailSent: 0, emailFailed: 0, emailDisabled: 0, workerFailures: 0 };
    return {
        log(event, fields = {}) {
            if (!events.has(event)) return;
            const reference = fields.reference || context.getStore()?.reference;
            const record = { timestamp: new Date().toISOString(), level: event.endsWith("failed") || fields.status >= 500 ? "error" : fields.status >= 400 || event === "media.cleanup_deferred" ? "warn" : "info", event };
            if (uuid(reference)) record.reference = reference;
            if (codes.has(fields.code)) record.code = fields.code;
            if (fields.method) record.method = methods.has(fields.method) ? fields.method : "OTHER";
            if (fields.route) record.route = safeRoute(fields.route);
            if (Number.isInteger(fields.status) && fields.status >= 100 && fields.status <= 599) record.status = fields.status;
            for (const key of ["durationMs", "eventsProcessed", "emailsAttempted"]) if (Number.isFinite(fields[key]) && fields[key] >= 0) record[key] = Math.round(fields[key]);
            if (channels.has(fields.channel)) record.channel = fields.channel;
            // No errors, URLs, bodies, headers, IPs, account/resource IDs or arbitrary fields.
            try { write(JSON.stringify(record)); } catch { /* A log sink cannot reverse a business operation. */ }
        },
        increment(key) { if (Object.hasOwn(metrics, key)) metrics[key]++; },
        request(status, durationMs, aborted) {
            metrics.requests++; if (status >= 400 && status < 500) metrics.clientErrors++; if (status >= 500) metrics.serverErrors++;
            if (aborted) metrics.aborted++;
            metrics.durationMsTotal += durationMs; metrics.durationMsMax = Math.max(metrics.durationMsMax, durationMs);
        },
        snapshot() { return { scope: "this_process_since_start", startedAt, ...metrics, durationMsMean: metrics.requests ? Math.round(metrics.durationMsTotal / metrics.requests) : 0 }; }
    };
};
export const telemetry = createTelemetry();
export const logEvent = (event, fields) => telemetry.log(event, fields);
export const withOperationReference = callback => context.run({ reference: randomUUID() }, callback);
export const recordMailOutcome = (channel, result) => {
    const state = result.sent ? "sent" : result.reason === "not-configured" ? "disabled" : "failed";
    telemetry.increment({ sent: "emailSent", disabled: "emailDisabled", failed: "emailFailed" }[state]);
    logEvent(`mail.${state}`, { channel, code: state === "sent" ? undefined : state === "disabled" ? "mail_disabled" : "delivery_failed" });
};

export const observeRequest = (req, res, next) => {
    const reference = randomUUID();
    req.requestId = reference; res.locals.supportReference = reference;
    res.setHeader("X-Request-ID", reference);
    const started = performance.now(); let recorded = false;
    const done = aborted => {
        if (recorded) return; recorded = true;
        const durationMs = Math.round(performance.now() - started), status = aborted ? 499 : res.statusCode;
        telemetry.request(status, durationMs, aborted);
        // Keep successful static assets and routine probes out of log volume;
        // all HTTP responses still contribute to the bounded metrics.
        if (status < 400 && (!req.route || req.baseUrl === "/health")) return;
        const code = status >= 400 ? res.getHeader?.("X-Error-Code") || ({ 400: "input_invalid", 401: "unauthenticated", 403: "forbidden", 404: "not_found", 409: "conflict", 413: "payload_too_large", 429: "rate_limited", 503: "database_unavailable" }[status] || "internal_failure") : undefined;
        logEvent("request.completed", { reference, method: req.method, route: req.route ? `${req.baseUrl || ""}${req.route.path}` : "unmatched", status, code, durationMs });
    };
    res.once("finish", () => done(false)); res.once("close", () => done(!res.writableFinished));
    context.run({ reference }, next);
};
