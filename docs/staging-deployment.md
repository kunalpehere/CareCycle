# Day 25: isolated staging demo and manual deployment

The local deployment preparation is implemented. A hosted URL, host-specific TLS/proxy behavior, container build, restart/redeploy, external monitoring and off-host backup remain deployment checks. Do not mark Day 25 complete until the hosted checklist below passes.

## What the public demo permits

Set `DEMO_MODE=true` only with a dedicated `carecycle_demo_...` database. This mode refuses enabled email and requires a replica set. `/demo` offers CSRF-protected donor/NGO role buttons that create normal persisted login sessions with regenerated session IDs. No passwords are published and no administrator is seeded. `/login` directs visitors to `/demo`.

The demo is explicitly **shared**, not private per visitor. All visitors see the same fictional accounts and activity. The banner, entry page and issued/downloaded receipts identify synthetic content. Never enter personal information. Email and organization verification in these deliberately seeded identities are fixture state, not evidence that a mailbox or NGO has been verified. Normal non-demo verification behavior is unchanged.

The seed includes two synthetic users, one synthetic verified NGO, one three-unit wheelchair listing, and a private authored PDF stating that it is synthetic evidence. Public administration, signup, password recovery, email-verification endpoints, organization modification/evidence endpoints and contact submissions are blocked. Multipart uploads are rejected before file processing; existing synthetic media remain in GridFS. Workflow forms, request decisions, pickup, handover, receipts, quantity changes, cancellation and notifications retain their normal authorization and transaction checks.

An atomic, majority-acknowledged budget permits 200 workflow submissions per shared account between operator resets. Rejected attempts may consume allowance; guest/CSRF failures and rejected uploads do not. Existing persistent per-address action/login rate limits still apply, including at most ten login/switch attempts per 15 minutes. Budgets survive process restarts. This bounds stored demo workflow growth but does not replace host-level traffic/request limits or database quotas.

Creating a new listing through the current multipart form is unavailable in the public demo. Demonstrate the seeded listing instead. The real application still supports uploads and creation outside demo mode. Pickup retains future-window and handover timing rules: choose the next minute, confirm through the counterparty, wait for that time, then record the fictional handover. No demo timing bypass is added.

## Before manual deployment

Choose a hosting service that runs a persistent Node 22 process or the included Docker image. A static-only host cannot run this application. Confirm it supports:

- Injected environment secrets, HTTPS, and a documented trusted proxy boundary using actual IP/CIDRs. The app intentionally rejects trust-all and hop-count configuration. If the provider cannot describe a safe boundary, resolve that before deployment instead of guessing or weakening validation.
- Reachable MongoDB with authentication, TLS and replica-set transactions; database permissions for collections/indexes, GridFS, persistent sessions/limits and the notification worker.
- A prestart/release command or private shell for initial database preparation, process termination grace of at least 30 seconds, log retention, rollback to an immutable previous application release, and health probes.

Use a dedicated database user restricted to the synthetic database. Configure network access for the host's actual outbound addresses/private networking. Do not point this release at the local development database or any real participant database. Use a separate database for any future real pilot.

The portable packaging follows the official [Node container guide](https://docs.docker.com/guides/nodejs/develop/) and [Node image practices](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md). Database configuration follows the official [MongoDB connection-string reference](https://www.mongodb.com/docs/manual/reference/connection-string/). No particular provider, price or plan has been selected.

## LiveIDE hosting preference

The existing LiveIDE chat records Vercel deployment. CareCycle's current continuous worker is designed for a persistent process. Vercel supports Express through functions, but background work must be adapted to its invocation lifecycle or moved to a separate worker/queue. This Day 25 package has **not** added or tested that Vercel adaptation. The included `Dockerfile` and `node index.js` instructions target persistent Node hosting. A hosting decision remains pending: retain the existing runtime on a persistent host, or implement and verify a Vercel adapter and durable worker processing before importing this project there. See [Vercel's Express guidance](https://vercel.com/kb/guide/ship-a-express-app-on-vercel) and [function limits](https://vercel.com/docs/functions/limitations).

## Manual steps, in order

1. Keep the Day 25 source revision and a rollback source/image revision recorded. Push this branch to your own repository when you decide to deploy; no remote push is performed by these changes. Run `npm ci`, `npm test`, `npm run test:integration` and `npm run test:demo-browser` in the verification environment described in [testing.md](testing.md).
2. Provision a **fresh** hosted replica-set database and its restricted database user. Obtain the provider connection string. Percent-encode credentials when required. Set an explicit name such as `carecycle_demo_staging` because the application's `MONGO_DB_NAME` overrides the URI database path.
3. Create the hosted web service. For native Node hosting use Node 22.x and npm 10.x, install with `npm ci --omit=dev`, and start with `node index.js`. There is no frontend build. For Docker hosting build the root `Dockerfile`. It copies only runtime source/assets/scripts and installs production dependencies; the process runs as the `node` user. The allowlist build context excludes `.env`, Git, local data, uploads, tests and artifacts. Record the resolved base-image digest and resulting image ID; set `NODE_IMAGE` to an approved digest for reproducible hosted releases. A Docker build has not been executed on this workstation because Docker is unavailable.
4. Add the settings in [deploy/staging.env.example](../deploy/staging.env.example) to the host's secret settings. Replace every placeholder. Generate independent JWT/session secrets, for example by running `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"` twice locally. Keep secrets out of Git, screenshots and chat. Leave **all** `MAIL_*` credentials/recipients blank. Set `NODE_ENV=production`, `DEMO_MODE=true`, `MONGO_REQUIRE_REPLICA_SET=true`, the dedicated database name, the actual public HTTPS origin and actual trusted proxy IP/CIDRs. Respect the host's assigned `PORT`; do not replace it with a fixed number if the host injects one. Production ignores the local `.env`.
5. With the service still stopped, run `npm run config:check` in its configured environment. Then run `npm run demo:prepare -- init carecycle_demo_staging` (substitute the **exact** database name). This command deliberately bypasses ordinary startup's pre-existing-index requirement to initialize a fresh database, create declared indexes and durable fixtures, then release the demo marker. It refuses adoption of an existing database, even one with empty collections. **Never use it as an every-deployment startup command.** If initialization fails partway, keep the service stopped and review the error/configuration; a marked partial demo can be recovered with the controlled reset below.
6. Start the web service. The continuous notification worker already starts inside the same process; no separate worker hosting service is required for this demo. It processes durable in-app events even with mail disabled. `npm run notifications:process` is a one-shot maintenance command, not a continuous worker.
7. Configure HTTPS probes through the trusted proxy: `/health/live` for liveness and `/health/ready` for dependency readiness. A plain internal HTTP probe is rejected by production HTTPS enforcement; ensure provider probes support the trusted route. Health probes create no sessions. Configure your host/monitor to alert on unavailability; this repository does not automatically create an external monitor. Retain structured stdout logs. Do not expose internal MongoDB access or a backend route that bypasses the proxy.
8. Run `npm run deploy:check` in the configured environment. This requests the actual `APP_URL`, verifies liveness/readiness, synthetic entry/no-store behavior, blocked admin access and production HSTS. It never prints supplied credentials/URLs. These are basic probes, not the complete release gate.
9. Complete the hosted checklist below. Record evidence, actual host/source revision, check times and failures in [day-25-verification.md](day-25-verification.md). Only then share the demo URL.

Example container commands, after securely populating a locally ignored `deploy/staging.env` with the actual configuration:

```powershell
docker build -t carecycle:day25 .
docker run --rm --env-file deploy/staging.env carecycle:day25 npm run config:check
docker run --rm --env-file deploy/staging.env carecycle:day25 npm run demo:prepare -- init carecycle_demo_staging
```

The hosting service must supply its own network/proxy routing; these one-off commands do not create a public HTTPS endpoint. Do not publish port 4000 directly to the internet. If the environment file exists, restrict its local permissions and never commit it.

## Hosted acceptance checklist

- A fresh browser loads `/home` and `/demo` via HTTPS, understands the shared synthetic status, switches roles and reaches both dashboards. Check desktop/mobile navigation and focus. Verify secure, HttpOnly, SameSite=Lax host-only cookies and HSTS at the actual edge.
- As the NGO, request one unit from the synthetic three-unit listing. As donor, accept. Confirm that two units remain requestable. Propose a fictional future pickup, confirm as the counterparty, wait until its start, record handover as donor, acknowledge as NGO, issue/download the synthetic receipt. Check in-app notifications. Do not use real contact/beneficiary information.
- Public signup, account recovery, administration, contact writes, organization modifications and multipart uploads stay blocked. The demo buttons accept donor/NGO only, require CSRF, and do not grant admin access. No outbound email occurs. Public health responses disclose no operational details or cookies.
- Keep an authenticated browser open and record a request/receipt identifier. Restart/redeploy **without reinitializing**. Check the same session, records, accounting, immutable receipt and private synthetic GridFS PDF remain available. Verify `/health/ready` returns 200 again and the worker resumes durable events. A redeploy with the same database and signing secrets must preserve valid unexpired sessions.
- Privately inspect `operational_workers` for a fresh heartbeat and successful batch after redeployment. With public admin routes blocked, use a restricted database/operator session instead of creating a public admin login. Confirm email is disabled. Review structured logs and test the configured outage alert.
- Rehearse the operator reset on synthetic staging, including prior session invalidation and preserved indexes. Verify rollback to the recorded compatible source/image. Configure encrypted off-host backups and recoverable keys according to [backup-recovery.md](backup-recovery.md); synthetic staging recovery does not establish pilot recovery guarantees.

## Operator-only reset

There is no public reset route. Stop **all** web/worker instances and wait for graceful shutdown. A recent non-stopped worker heartbeat blocks reset; do not force-delete its heartbeat to get past that check. Stop traffic/writers even if a worker heartbeat is stale. Then, in the configured private environment:

```powershell
npm run demo:prepare -- reset carecycle_demo_staging
```

The exact database name is a required confirmation. The reset verifies the dedicated naming/configuration, marker, expected accounts/ownership, collections and media, then enters maintenance. It deletes only the declared synthetic business/session/worker/budget collections' contents in one transaction, retains indexes and rate-limit buckets, preserves the immutable synthetic evidence file, reseeds fixture records and increments the authentication generation. Previous sessions/tokens become unusable. Unexpected accounts, request ownership, collections or files cause refusal; investigate rather than deleting evidence to bypass it. Concurrent generation changes fail the transaction. Reset is unsuitable for a real database.

A failure after maintenance begins leaves the demo unavailable. Keep writers stopped, fix the underlying problem and retry the controlled reset; never toggle the database marker manually to bypass failed preparation. Start the service again only after preparation succeeds and readiness is verified.

## Shutdown and rollback

SIGTERM/SIGINT stop admission, drain HTTP requests, stop/await the worker and disconnect MongoDB. The entrypoint forces a failed exit after 25 seconds if shutdown cannot finish, so configure at least 30 seconds of termination grace. Incomplete notification work remains durable for retry; email remains disabled here.

Day 25's schema/index preparation is additive and scoped to a separate demo database. Application rollback does not automatically roll back database writes. Prefer a recorded **Day 25-compatible** build that understands the demo boundary/control marker and receipt fixtures. Never serve this public database with Day 24 code that lacks demo restrictions. If the new version fails, remove public traffic first, retain a backup, then either redeploy a verified compatible build or recover/reset a separate synthetic target. Future schema migrations need explicit compatibility review and fresh backup before release. Do not drop indexes or restore over the live database as a shortcut.

## Remaining stages

Day 26 expands the complete deployed release gate, including adverse paths. Day 27 measures performance and records actual feedback. Day 28 refreshes portfolio media, case study and release tag. A hosted synthetic portfolio demo is not authorization for a real operational pilot.
