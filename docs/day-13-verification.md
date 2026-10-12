# Day 13 durable lifecycle notifications

Date: October 12, 2026. Branch: `codex/day-13-durable-notifications`.
Commit: the commit containing this document, `feat(notifications): add durable donation lifecycle updates`.

## Implemented behavior

Authenticated donors, NGO members and administrators have a private `/notifications` inbox linked from shared navigation. It shows actual unread totals, chronological pages of 20 updates, owner-scoped review links and idempotent CSRF-protected Mark read controls. Email preferences default to disabled for new and existing accounts. Pending/rejected NGO members can read organization verification updates without passing the verified-organization gate; request review links still require current ownership and verification.

Covered events include organization submission/resubmission and verification decisions, request submission/acceptance/rejection/cancellation (including listing-policy cancellations), pickup proposal/confirmation/rescheduling, missed/disputed/resolved collections, accepted cancellation, donor handover, NGO acknowledgement/discrepancy, resolution and remaining-unit release actions, receipt issue/outcome changes and name-correction proposals/confirmation/withdrawal. Participants receive their own actions as well as their counterparty's updates. Active administrators receive submitted organization applications for review. No historical actions are backfilled.

Each successful mutation persists its lifecycle event in the same MongoDB transaction. A database failure to record the event aborts that mutation. Subsequent inbox processing and email-provider failures cannot reverse committed business data. Verification decisions and their existing audit entry now share a transaction. Organization file cleanup preserves committed evidence even if later cleanup fails.

Events store only an event kind, resource identity, trusted recipient identities/roles, local review paths and timestamps. Beneficiary summaries, contact details, pickup addresses, need statements, discrepancy notes and verification reasons are excluded. Inbox headings come from a fixed catalog; emails contain only a generic sign-in notice and the application inbox URL. The older new-listing email also omits donor contact and equipment details; its immediate delivery and the explicitly submitted contact form remain separate from this lifecycle outbox.

## Worker, retries and delivery limits

The application starts a non-overlapping worker after database connection. It processes bounded batches every two seconds. `npm run notifications:process` performs one bounded processing pass against the configured database for operational recovery. Do not run it against an unintended database. Workers create one inbox record per event/recipient using stable SHA-256 IDs. Event claims and inbox inserts share a transaction; competing workers or repeated processing cannot duplicate inbox entries. Undelivered events persist across application restarts. New collections are initialized on connection; development/test index creation follows the existing Mongoose configuration. Production administrators must provision the declared queue/inbox indexes when automatic indexing is disabled.

Optional email uses current `MAIL_SERVICE`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM` and `APP_URL` configuration and the opted-in recipient's current account email. It does not use `MAIL_RECIPIENTS`. Missing credentials leave pending jobs queued without consuming attempts. Preferences apply when inbox rows are created; enabling email does not replay disabled historical updates. Disabling it suppresses unlocked pending jobs. Eligibility/opt-in is checked again immediately before sending. Suspended accounts, changed roles, lost ownership and revoked NGO verification cannot receive newly processed request updates. Events skipped for ineligible recipients are marked processed and are not replayed on reactivation.

Email jobs use atomic claims, two-minute crash-recoverable leases and fenced result writes. They allow at most five claimed attempts with exponential delays starting at 30 seconds; the delay function caps at one hour. Provider errors are stored as generic codes, never raw provider responses. Final failed inbox rows remain readable. Stable Message-ID values help providers recognize retries but do not guarantee deduplication. An accepted provider send followed by process/database failure can be sent again after lease expiry. A preference or suspension change cannot recall mail already handed to the provider. UI wording says accepted by email provider rather than claiming mailbox delivery. These are documented limits, not exactly-once email guarantees.

## Verification

Automated checks use synthetic fixtures, owned disposable MongoDB replicas and fake email senders. The separate-process restart check runs two independent one-pass workers against the fixture-owned database. No real email was sent.

- Unit/template checks cover default opt-out, bounded retry delays, deterministic message identifiers, generic email content and escaped inbox rendering.
- Database/HTTP checks cover event-write rollback, committed acceptance surviving inbox-write failure, worker concurrency/idempotency, separate-process restarts, ownership/CSRF/read replay, current verification and suspension/role checks, pending NGO/admin verification updates, pickup changes, handover/acknowledgement/receipt events, absent sender, five failures, lease recovery, final crash exhaustion and opt-out suppression.
- Desktop/mobile browser checks exercise actual donor acceptance, automatic inbox processing for both participants, read controls, persisted email preferences, review navigation and horizontal-overflow checks. Existing collection/handover/receipt workflows are included in regression coverage.

Final results: `npm test` passed 76 unit/template tests and syntax checked 127 JavaScript files. `npm run test:integration` passed 106 checks. `npm run test:browser` passed all 18 desktop/mobile checks. `git diff --check` passed. Desktop/mobile screenshots were visually reviewed; browser overflow checks passed. Browser screenshots are generated under `artifacts/browser/day-13-notifications-desktop.png` and `artifacts/browser/day-13-notifications-mobile.png`; logs are under `artifacts/logs`.

Initial verification caught an undersized synthetic request message and an accessible-label defect caused by nesting select options inside the label. The test fixture was corrected and the label separated from the control, then all suites above passed. The first browser launch was stopped while attempting a MongoDB download; successful runs explicitly selected installed MongoDB 8.2.5 and used disposable replicas.

Real mailbox delivery, provider authentication, spam placement, mailbox duplicate handling, hosted CI and production deployment remain unverified. No test mailbox was configured. The reviewed development runtime on port 4000/27018 remains stopped. The original database on 27017, `.env`, uploaded files and unrelated `Readme1.md` were preserved.
