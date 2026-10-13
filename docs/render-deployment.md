# Render Free deployment setup

This guide uses the existing continuous Node/Express server with a shared synthetic demo and MongoDB Atlas. It does not enable real donations, signup, uploads, admin access or email. Render Free sleeps when idle; the application and worker resume when the service wakes. See [Render Free limitations](https://render.com/docs/free).

The repository intentionally excludes all environment files and templates. Enter secrets only in Render's environment settings. Never paste them into GitHub, logs or screenshots.

## Fields in the Render form

- Repository: CareCycle; branch: `codex/day-25-staging-demo`.
- Name: `carecycle-demo` (Render may assign a suffix to its public hostname).
- Runtime: Node; region: Singapore; root directory: blank; compute: Free.
- Build: `npm ci --omit=dev`.
- Start: `npm run start:render -- --initialize carecycle_demo_staging`.
- Advanced health-check path: leave blank for Render's default TCP probe during setup. It checks the bound port without relying on HTTPS forwarding headers. After application startup, separately verify `/health/ready` through the public HTTPS origin; TCP checks alone do not verify database readiness.

Set `NODE_ENV=production`, `DEMO_MODE=true`, `MONGO_DB_NAME=carecycle_demo_staging`, `MONGO_REQUIRE_REPLICA_SET=true`, `MONGO_URI` to the private Atlas connection string for the restricted `carecycle_app` user, and distinct random `JWT_SECRET`/`SESSION_SECRET` values of at least 32 characters each. The committed `.nvmrc` selects Node 22; this is a version selector, not a credentials file.

No mail settings are needed. `PORT` comes from Render. When `APP_URL` is absent, the app validates and uses Render's injected `RENDER_EXTERNAL_URL` and matching `RENDER_EXTERNAL_HOSTNAME`; it requires the provider web-service metadata and an assigned HTTPS `onrender.com` origin. An explicit validated `APP_URL` can still select a custom domain later. See [Render's documented environment variables](https://render.com/docs/environment-variables).

## First deployment: setup only

Initially leave `TRUST_PROXY` unset. The start command launches a minimal setup server rather than the application. It does not load the seven secret variables into logs, connect to MongoDB, create sessions, start the notification worker or expose any donation routes. All routes except the liveness setup probe return a clear 503 setup message; `/health/ready` also returns 503. The liveness probe returns `{"status":"setup"}`, not application readiness.

The restricted Render logs show:

- `render.setup.started`: the actual assigned public origin, with no credentials.
- `render.setup.proxy`: only observed private/loopback socket peer addresses and whether the peer supplied exactly `X-Forwarded-Proto: https`.

These are observations, not automatic proxy authorization. Public socket addresses are omitted; forwarded client IPs, query strings, headers, emails, cookies and environment secrets are never logged. The address log is bounded to 32 distinct observations per process. Visit the assigned public HTTPS origin to obtain an edge observation. Do not substitute Atlas network-access addresses or Render outbound addresses for inbound proxy peers; these serve different purposes.

Review Render's routing boundary and observed HTTPS peer(s) before supplying `TRUST_PROXY` as explicit observed IPs/CIDRs. Do not infer a whole private network from a single address, use `true`, set a hop count or guess a range. Peer addresses can change during platform routing/deployment; unknown peers remain rejected. Deployed edge checks must confirm secure cookies and forwarded-header handling before sharing the demo. See [Express proxy guidance](https://expressjs.com/en/guide/behind-proxies/) and [Render web-service routing](https://render.com/docs/web-services).

## Atlas access and actual application startup

After the service exists, obtain its outbound IP ranges from Render's dashboard. Add those actual ranges to the CareCycle Atlas project's IP Access List. Do not replace this with worldwide access. The existing local IP entry is for the project owner's computer, not the hosted service. See [Render outbound IPs](https://render.com/docs/outbound-ip-addresses).

After validating the proxy boundary, set the exact `TRUST_PROXY` value in Render and redeploy. The same start command then validates production configuration, checks the replica-set topology and handles database preparation:

- A fresh, correctly named synthetic database is initialized with declared indexes, two restricted synthetic identities, one NGO and one fictional listing/private evidence file.
- An existing ready demo marker causes preparation to be skipped. Records, quantities, budgets, files, receipts and the authentication generation are preserved.
- Existing unmarked collections, wrong name/confirmation, invalid configuration, unavailable MongoDB or a maintenance/quarantine marker cause refusal. No startup path resets or adopts existing data.
- After preparation, ordinary application startup performs its existing security/storage/index/readiness checks and starts the continuous worker.

This avoids needing a shell or one-off job, neither of which is provided by Render Free. An interrupted initialization stays in maintenance and requires the deliberate private recovery/reset procedure; it is never automatically reset on restart. Use [staging deployment](staging-deployment.md) for operator reset, safe backup and rollback.

## Acceptance

Run the existing hosted checklist after normal application startup. `/health/live` must now report `alive`; `/health/ready` must report `ready`; `/demo` must show the synthetic entry and normal donor/NGO role switching. Verify private cookies, CSP, rejected untrusted forwarding headers, partial request/acceptance, normal-timed pickup/handover/acknowledgement/labelled receipt, notifications and restart persistence. A setup-only deployment is not completion of Day 25.
