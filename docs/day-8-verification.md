# Day 8 implementation and verification

Date: October 12, 2026. Status: implemented and locally verified.
Branch: `codex/day-8-database-regressions`.
Commit: the commit containing this record, `test(matching): cover database races and privacy boundaries`.

## Delivered

- Reviewed Days 6–7 coverage and added 14 named real-HTTP/database scenarios for authentication, roles, verification, suspension, tenant/contact/file privacy, CSRF/forged identity, concurrent submissions/decisions and failure recovery.
- Added a reusable owned-database/HTTP/runtime fixture with synthetic files, real session/CSRF tokens, active rate limits, canonical-path cleanup guards and post-teardown assertions.
- Fixed the protected-response cache-policy defect identified by the new tests: authenticated responses now use `private, no-store` and vary by cookie, including protected files and failures.
- Retained and exercised existing partial/full allocation, abort, duplicate acceptance, withdrawal and quantity races, retry/history and index/backfill regressions.
- Renamed the existing CI integration job to reflect workflow regressions; its automatic file discovery and diagnostics cover the new suite. Added a [coverage and isolation guide](database-regression-suite.md).

## Checks and actual evidence

Environment: Windows, Node 22.14.0, npm 10.9.2; explicitly selected installed MongoDB 8.2.5 for disposable test processes.

| Check | Actual result |
|---|---|
| `npm test` | 59 unit/model/template/configuration tests passed, zero failures/skips. |
| Source syntax | 95 JavaScript files passed checks after the new fixture/suite were added. |
| `npm run test:integration` | 39 tests passed, zero failures/skips. The Day 8 suite contributes 14 named scenarios and its parent test; earlier suites contribute 24 tests. |
| Authorization mutations | Foreign/wrong-role actors, unverified profiles, suspended actors, incorrect CSRF and guessed cancellation IDs cannot alter the target records. Credential checks use the actual User/Organization records. |
| Privacy | Only matched participants receive contact details. Request history ignores forged query scope. Verification bytes are available only to the owner/admin; permitted image reads and denied public paths follow existing policy. A known ETag does not bypass an unauthorized file read. |
| Deliberate failure recovery | Failed request insertion restores listing/version state; failed sibling cancellation restores acceptance, reservation and response metadata. Temporary validators are removed and subsequent valid requests succeed. Raw before/after records are compared. |
| HTTP race and replay | Duplicate submissions result in one 302 and one 409, with one request. Accept-versus-cancel results in one decision; replay preserves recorded metadata and quantities agree with accepted/completed requests. |
| Cleanup | The owned runtime is absent and the Mongoose connection closed after teardown; application database/files are not cleanup targets. |
| `npm run test:browser` | Eight existing desktop/mobile login, matching, retry, quantity, stale-action and withdrawal workflows passed with the cache fix. No UI template/style change was needed. |
| Final review | Fixture ownership, secrets/mail isolation, response/file privacy, record rollback, middleware boundaries, workflow discovery and Git whitespace checks reviewed. |

Generated local evidence is in `artifacts/logs/unit.log`, `artifacts/logs/integration.log` and `artifacts/logs/browser.log`. Deliberate failure logs are expected evidence, not unresolved test failures. Initial cache-policy failures drove the middleware fix; the final assertions remain enabled.

## Preserved state and outstanding work

- Existing `.env`, application database/indexes, uploads and unrelated `Readme1.md` were preserved. The normal application remains stopped. No push, PR, deployment, existing-dataset migration or real mail delivery occurred.
- Hosted GitHub Actions and the default downloaded MongoDB binary path remain unverified. Local tests use the explicitly selected installed binary; configured CI uses its default pinned binary. Production infrastructure and dependency findings remain open.
- Already-suspended/unverified actors are covered; administrative changes racing with commitments still require later moderation policies. Completed legacy fixtures test privacy only; pickup/handover/acknowledgement are not implemented by this stage.
- Replica-set configuration and the Day 7 request-index migration remain prerequisites before restarting against existing records.

Phase 2, Days 5–8, is implemented and locally verified for its scoped matching work. Day 9 starts pickup arrangement.
