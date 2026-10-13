# Health, logs and support diagnostics (Day 23)

## Public probes and dependency checks

`GET /health/live` returns `200 {"status":"alive"}` while the HTTP process can respond. It is independent of database/session availability. `GET /health/ready` returns `200 {"status":"ready"}` only when the configured MongoDB connection is open, the server is a writable primary (with a replica set when required), the session/rate TTL indexes are present and readable, and the private GridFS file/chunk collections have their required indexes and are readable. Failure returns `503 {"status":"unavailable"}`. Neither response discloses hosts, credentials, database/collection names, counts, worker details or exception text.

Probes run before cookies, session reads and CSRF creation. They do not issue a session cookie or create test uploads. Security headers and the production HTTPS/trusted-proxy requirement still apply. Configure hosted probes through the trusted TLS path. Both responses disable caching and include a server-generated `X-Request-ID`.

Readiness has a two-second response deadline and server-side one-second query limits. Concurrent polls share one actual probe while it remains in flight, including after a deadline expires; repeated polls cannot accumulate stalled probe groups. A probe checks availability/indexes, not every possible upload, integrity hash, database write privilege or backup restore. Normal storage operations continue to verify actual bytes and enforce majority acknowledgement. Email/worker degradation does not make core dependency readiness fail.

## Administrator diagnostics

The administration dashboard links to `/admin/diagnostics`. An active administrator is required. Browsers receive an accessible page; `Accept: application/json` receives the same aggregate snapshot. Both use existing private/no-store authentication boundaries. This is not a public metrics endpoint.

The snapshot includes:

- Current database, security-store and private-storage readiness.
- Request count, 4xx/5xx counts, aborted responses, and response duration mean/maximum for this process since start. Counters include all HTTP responses, including assets and probes, and reset on restart. Mean/maximum are not percentile histograms. Collect structured logs outside the process for deployment-wide history.
- Process-local email sent/failed/disabled outcome counts and worker batch failure counts. These count attempts/outcomes, not unique recipients; account, contact, donation and lifecycle email are included. Disabled email is separate from provider failure.
- Durable lifecycle-event backlog and notification mail status totals, retrying pending mail, and oldest pending mail time. No recipient, subject, beneficiary text or resource link is returned.
- Up to 50 unexpired worker heartbeat snapshots. The limit bounds diagnostics size; this prototype is not a fleet management system.

Workers persist only operational timestamps, status, mail-configured flag and expiry in `operational_workers`, using opaque random IDs. Startup creates a TTL index; records expire after 24 hours without updates. Heartbeats refresh during batches and at least every ten seconds while the process is active. Publication is coalesced so a stalled database cannot build an unbounded heartbeat queue. Shutdown records `stopped` when storage is available. A crash leaves a row which becomes `stale` after 45 seconds. A failed batch is `degraded`; a continuously running batch older than ten minutes is also degraded. Missing recent workers produces degraded notification health. These timestamps require reasonably synchronized deployment clocks. TTL cleanup is asynchronous; reads explicitly exclude expired rows.

Provider failures are recorded as `delivery_failed`, remain queued with existing retry/backoff rules, and become failed after five attempts. Successful core workflows and in-app updates remain usable. Disabled mail does not consume attempts. Provider acceptance followed by a database write failure is reported as infrastructure failure; notification delivery remains at least once, and a lease recovery can resend that email. A one-shot `npm run notifications:process` emits structured batch logs; it is not a continuously heartbeating worker.

## Structured logs and support references

Runtime logs are one JSON object per line on standard output. Supported event names, error codes, methods, registered route patterns, statuses, durations, batch counts and mail channels are explicitly allowed. Request references are new random UUIDs; client `X-Request-ID` values are ignored. Async request context carries the same reference into related mail and cleanup logs, including account recovery work that completes after the response. Continuous worker batches and standalone batches use operation references.

Logs exclude raw exception messages/stacks, supplied URLs/query strings, form/JSON bodies, headers/cookies, session IDs, client IPs, user/resource IDs, filenames, credentials, reset/verification links, contact details and beneficiary text. Unknown paths are logged as `unmatched`, and routes use placeholders such as `:requestId`. Successful static assets and routine successful health polls are omitted from request logs to limit volume, while their counters still advance. All failed/aborted requests remain observable. Logging sink errors do not reverse application actions.

Every response includes `X-Request-ID`. Shared error responses also provide `X-Error-Code`; browser error pages display the support reference. Input/authorization failures and conflicts remain 4xx; unavailable security/private media/network dependencies become 503; unexpected server failures remain 500. Unexpected error text is replaced with safe recovery copy. After a response has begun, the connection is closed without handing raw errors to Express's default stack logger.

Use the reference from a support report to find `request.failed` and `request.completed` records with the same reference. Inspect status, code and registered route, then follow related mail/cleanup events. For 409, reload the current record before resubmitting. For 5xx, check the saved state from the dashboard before retrying. Do not ask users to send passwords, cookies, reset links, beneficiary details or private documents as diagnostics.

Use `npm run config:check` before startup to obtain safe configuration validation details. Startup itself emits a correlated `startup.failed` code, with `configuration_invalid` distinguished from other startup failures. Startup failures and failed worker operations do not print raw provider/database errors.

## Operational collection and verification limits

Collect standard output using the deployment's existing log collector, keep access restricted to operational staff, and configure retention and alerting as part of deployment. This stage supplies structured records and a private current snapshot; it does not install an external monitoring platform or define the Day 24 privacy/backup retention policy. Avoid publishing logs or exposing the administrator JSON endpoint as an unauthenticated exporter.

Local tests use synthetic data and disposable replica sets to verify correlation, input privacy, forbidden diagnostic access, missing indexes, disconnection, bounded/shared probes, disabled/failing email, worker failure/stale/stopped states and unaffected commitments. Browser checks audit the diagnostics and support-reference pages for accessibility and responsive layout. Actual hosted outage detection, proxy probes, external log collection, alerts and provider delivery require deployment verification.
