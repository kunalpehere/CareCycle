# Day 25 verification: staging preparation and isolated demo

Date: October 13, 2026.
Branch: `codex/day-25-staging-demo`.
Status: local implementation and verification; hosted deployment acceptance pending. This is not a completed hosted release.

## Delivered locally

- Opt-in `DEMO_MODE`, enforced isolated database naming, replica-set requirement, disabled outbound mail, marker/preflight validation and refusal to start a marked demo database with demo mode disabled.
- Labelled shared synthetic entry at `/demo`, CSRF-protected donor/NGO role switching with session regeneration, preverified synthetic identities, a three-unit fictional wheelchair listing, private synthetic PDF evidence and labelled issued/downloaded receipt snapshots. No admin user or public password is seeded.
- Public admin, signup/recovery/verification, organization mutations/evidence, contact writes and multipart uploads blocked before their handlers. Case/trailing-slash variants follow Express's routing semantics. Shared atomic 200-submission account budgets use majority acknowledgement and survive reconnects; existing rate limits remain enforced.
- Fresh-database initialization with declared indexes and an operator-only reset: exact database-name confirmation, marker/ownership/collection/media guards, active-worker refusal, maintenance state, transactional record replacement, retained rate-limit buckets/indexes/private fixture, incremented auth generation and prior-session invalidation. No HTTP reset endpoint.
- Production-only Docker packaging with runtime source allowlist, production dependency install and non-root process; example environment settings, deployment smoke CLI, manual HTTPS/proxy/health/worker instructions and explicit compatible rollback guidance.
- Graceful server shutdown API and SIGTERM/SIGINT wiring: HTTP drain, worker stop/await, MongoDB disconnect, idempotent shutdown and a 25-second entrypoint deadline.

## Verification evidence

Local checks use Node 22.14.0/npm 10.9.2 and disposable MongoDB 8.2.5 replica sets from the explicitly selected installed executable. No local development or hosted participant database is used. Mail configuration is blank. Sandbox restrictions prevented a disposable MongoDB startup and an existing localhost-cookie probe; permitted reruns used their isolated infrastructure.

- `npm test`: 95 unit tests and syntax checks for 194 JavaScript files passed. Final log: `artifacts/logs/day25-unit-final.log`.
- Full integration regression rerun: all 191 checks passed, with no skipped checks. Log: `artifacts/logs/day25-integration-final.log`. All 12 final focused demo checks passed after route case/trailing-slash normalization and deployment smoke CLI coverage were added. Log: `artifacts/logs/day25-demo-final.log`.
- Focused demo/readiness checks: the normal timing and full synthetic request/accept/pickup/handover/acknowledgement/receipt journey passed. Testing waits for the actual next-minute pickup start; no production clock or fixture mutation bypass is added. Shared concurrent budgets, reset/refusal, session invalidation, readiness/maintenance and idempotent server shutdown passed. Focused log: `artifacts/logs/day25-focused-integration.log`.
- Existing browser suite: all 50 desktop/mobile checks passed. Log: `artifacts/logs/day25-browser-regression.log`.
- Dedicated demo browser suite: both desktop/mobile flows passed, including role switching, synthetic labels, account separation, no horizontal overflow and blocked administration. Log: `artifacts/logs/day25-demo-browser.log`.
- Desktop/mobile entry screenshots were visually inspected. The original banner placement was hidden by fixed navigation; spacing was corrected and both browser flows rerun successfully. Evidence: `artifacts/day-25-desktop-entry.png`, `artifacts/day-25-mobile-entry.png`, and donor counterparts.
- The first wider integration run found a timing-sensitive assertion that expected an idle heartbeat after a fixed delay. It was corrected to await a successful batch with a bounded deadline; the full suite is rerun after that correction. Earlier test failures remain in their logs and are not counted as final passes.

## Boundaries and pending external checks

The public demo is shared, with no per-visitor data isolation. Text is visibly synthetic; visitors are instructed not to enter personal information. Public uploads and the existing multipart create/edit forms are unavailable. Use the seeded listing for the advertised journey. Pickup timing, transaction/ownership checks and normal non-demo registration/verification remain intact. No real NGO verification, physical transfer, beneficiary impact, inbox delivery or production scale is claimed.

LiveIDE's existing chat identifies Vercel. On October 13, the project owner delegated the hosting choice; persistent Node hosting was selected to retain CareCycle's tested server and continuous worker. The existing deployment package supports that approach. A Vercel adaptation is no longer in scope. Exact provider/account setup and hosted acceptance remain pending. No provider account, service, database, DNS, billing or secrets have been modified.

Docker is unavailable on this workstation, so the image has been reviewed but not built/run. Hosted HTTPS/proxy/cookies, database network/TLS/index permissions, public accessibility, restart/redeploy persistence, worker processing, monitoring/alerts, off-host backups/key recovery and compatible rollback must pass the [manual deployment checklist](staging-deployment.md). Local reconnect/shutdown/browser evidence is not a substitute for those checks.

The unrelated untracked `Readme1.md` is preserved. No remote push, PR, deployment or portfolio tag is part of this local preparation. Test servers/disposable databases are stopped by their harnesses; the existing development MongoDB service and project data are preserved.
