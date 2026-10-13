# Day 23 verification: health, logs and support diagnostics

Date: October 13, 2026. Branch: `codex/day-23-observability`. Commit: the commit containing this record, `feat(observability): add health checks and correlated failures`.

## Delivered behavior

Public liveness and readiness routes run before persistent sessions and CSRF. Readiness checks a writable MongoDB primary, required security indexes and readable private media collections/indexes. Public responses disclose only alive/ready/unavailable, use no-store caching, and never create session cookies. Readiness has a two-second response deadline and one coalesced underlying probe group, so hung polls do not accumulate queries. Detailed dependency state, bounded process metrics and aggregate notification/worker health are available only to active administrators through `/admin/diagnostics`.

Each response has a new server-generated request reference; supplied references are ignored. Shared browser errors show that reference, and safe JSON logs correlate it with response status, registered route and allowlisted error code. Async request context follows related mail/cleanup work. Runtime logs exclude arbitrary error text, stack traces, URLs, query strings, cookies, addresses, contact information, account/resource IDs, beneficiary text and credentials. Unexpected errors use safe recovery copy; clients are guided to reload conflicts and check saved state before retrying infrastructure failures. Raw errors are not handed to the default Express logger after headers have been sent.

Notification workers publish expiring operational heartbeats with idle/running/failed/stopped status. Missing, stale and failed workers are observable without making core workflows unavailable. Provider failures are logged and counted separately from disabled mail and post-delivery persistence failures. The existing retry/lease policy and in-app updates remain usable. Startup failures are correlated and sanitized; an occupied listening address closes the database client rather than leaving a failed process running.

See [operational diagnostics policy](operational-diagnostics.md) for endpoint contracts, metric scope, heartbeat timing, log fields and support procedures.

## Verification evidence

- Final `npm test`: 94 unit/model/template/privacy checks passed; 176 JavaScript files passed source syntax checks.
- Full `npm run test:integration`: 169 checks passed on owned disposable MongoDB 8.2.5 replica sets.
- Final focused diagnostics and notification regression run: 25 checks passed, including the expanded deadline, worker failure, startup and post-delivery persistence cases. Reruns are not added to full-suite totals.
- Full `npm run test:browser`: all 50 Chromium desktop/mobile checks passed, including the new administrator diagnostics/support-reference accessibility scenario.
- Final focused browser rerun after spacing refinements: both desktop/mobile checks passed. Diagnostic screenshots were visually inspected; no horizontal overflow or axe accessibility violations were found.
- Git whitespace checks passed. Only authorized Day 23 files were staged.

Failure tests reject guest/participant diagnostics access, omit private data from logs/snapshots, trace a deliberate transactional failure from its response reference, and retain pending state after rollback. Missing media/security indexes and a disconnected database return unavailable readiness while liveness remains usable. Two simultaneous deliberately stalled probes return within the deadline and share one underlying operation. Disabled mail and provider failures remain distinct; accepted commitments and request pages stay usable. Worker batch failure, stopped and stale states are persisted and visible. Fake provider acceptance followed by a failed database update throws an infrastructure error without emitting a failed-delivery event.

Initial cookie-probe instrumentation assumed stdout contained a single JSON object. It was updated to select the probe result alongside the new structured records; the final full unit suite passes. The occupied-port test initially bound IPv4 loopback while the application used its default bind family on Windows. Matching the application's bind address made the intended collision reproducible; the final subprocess check exits with a sanitized correlated startup failure and no hanging database client.

Logs are retained in ignored `artifacts/logs/unit.log`, `integration.log`, `browser.log` and `day23-final-diagnostics.log`. Browser screenshots are under `artifacts/day-23`. The final focused browser run replaces the browser report with its two scenarios; the full-run log retains evidence for all 50 checks.

## Preserved data and deployment boundaries

Existing application databases, uploads, `.env`, receipt revisions and unrelated `Readme1.md` were preserved. Verification used synthetic files/data, disposable application runtimes and owned local database processes. No production migration, cleanup, external message, remote push, PR or deployment was performed. Reviewed runtime UI files were refreshed; application port 4000 and development database port 27018 were not started.

Process metrics reset on restart and are not a deployment-wide historical metrics service. Standard output still needs a private hosted log collector, retention policy and alerts. Readiness checks readable dependencies/indexes and primary state; it is not a backup drill or exhaustive write/integrity probe. Worker timestamps rely on synchronized clocks, and email remains at least once. Hosted outage detection, real proxy probes, provider delivery, other browser engines, physical devices/screen readers and prior operational/privacy findings remain unverified. Coordinated backup, retention and restore work is Day 24.
