# Day 19 verification: account recovery and verified email

Date: October 13, 2026. Branch: `codex/day-19-account-recovery`. Commit: the commit containing this record, `feat(auth): add verified email and secure account recovery`.

## Delivered behavior

Registration attempts an email verification message. Participants and administrators can review ownership status and request resends. Email-link GETs only render forms; CSRF-protected POSTs consume them. New donor listings and NGO requests require verified account email. Existing commitments and onboarding retain their previous role, organization and ownership checks. Organization approval never implies email ownership or equipment inspection.

Forgot-password responses do not reveal account existence, eligibility or delivery results. Reset credentials expire after 30 minutes; verification credentials expire after 24 hours. Only hashed, account/purpose/address-bound credentials are stored. Atomic updates handle replacement, expiry, replay and concurrent consumption. Successful reset changes the password and increments the account authentication version. Middleware rejects previous JWT cookies; subsequent participant/admin sign-in issues the current version. The resetting browser session is destroyed.

Mail uses the current account address and configured application origin. A durable per-account/per-purpose one-minute cooldown complements bounded process-local IP limits. Provider failure/missing configuration does not falsely verify an account or expose usable links. Retry/support and best-effort delivery limits are documented in [account recovery](account-recovery.md).

## Verification evidence

- `npm test`: 90 unit/model/template tests passed.
- Final `npm run check`: 153 JavaScript files passed syntax checks.
- Full `npm run test:integration`: 134 checks passed on owned disposable MongoDB 8.2.5 replica sets.
- Final focused recovery integration run: 7 checks passed, including an additional registration/ineligible-account scenario and real donor, NGO and administrator login after reset. This focused count is not added to the full-suite count.
- Full `npm run test:browser`: 44 Chromium desktop/mobile tests passed, including the new recovery journey and existing collection, receipts, discovery, authorization and accessibility flows.
- Final focused desktop/mobile recovery browser rerun: 2 tests passed, verifying the account email display and external stylesheet after visual refinements. Ten new recovery-page observations passed accessibility and horizontal-overflow checks; they are not added to full-suite totals.
- Git whitespace checks and representative desktop/mobile screenshot review completed. Synthetic fixtures explicitly mark previously verified lifecycle actors; dedicated recovery fixtures remain unverified until tested confirmation.

The recovery integration scenarios cover hashed storage and JSON exclusion, wrong account/purpose, malformed input, expiration, token replacement/cooldown, concurrent reset consumption, version revocation, CSRF, neutral responses, rate limits, failed/disabled mail, suspended accounts, changed email and new-action gates. Browser checks exercise confirmation, gate recovery, reset, stale-cookie rejection from another context, replay and new-password sign-in.

Suite logs are in ignored `artifacts/logs`. Recovery screenshots are in ignored `artifacts/day-19`; final focused browser output is `artifacts/logs/day19-browser-final.log`. Initial sandboxed runs could not use local network/fixture operations; the isolated suites passed with the required local-network access.

## Data and operational limits

No backfill silently verifies existing addresses. Existing records/tokens default to authentication version zero; reset increments the version atomically. Original application data, `.env`, uploads and unrelated `Readme1.md` are preserved. No remote push, PR or deployment is part of this stage.

The reviewed `.local-data` runtime's `views` and `public` files were refreshed. Application port 4000 and development database port 27018 remain stopped. The review helper continues to disable real mail; ordinary `npm start` does not select that isolated runtime.

Real mail/provider delivery, hosted CI, production infrastructure/proxy logging, other browser engines and physical device/screen-reader testing remain unverified. Account mail is best-effort immediate delivery with user-initiated replacement links, not a durable outbox or scheduled retry worker. Requests already authenticated before reset can finish. Shared persistent session/IP stores and broader browser security remain Day 21. Earlier dependency, participant-research and asset-permission limitations remain open.
