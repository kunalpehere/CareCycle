# Day 20 verification: administrative review and moderation

Date: October 13, 2026. Branch: `codex/day-20-admin-moderation`. Commit: the commit containing this record, `feat(admin): improve accountable review and exception handling`.

## Delivered behavior

Organization applications and participant accounts have filtered, paginated queues and explicit counts. Organization decisions require a current application version, a reason and an evidence-review declaration. Decision history includes actor, reason and reviewed submission/document metadata. Approval requires an active NGO owner and document metadata. Concurrent, repeated or stale decisions cannot replace an already-recorded outcome.

Suspension/reactivation, donor listing gates and audit records are transactional. Both decisions revoke earlier authentication. Core participant workflow transactions guard their actor's current account state with a write, serializing matching, listing, organization, collection, handover and receipt changes with suspension. Accepted commitments and stock are preserved and flagged for administrative follow-up. Discovery also checks current donor account status for older records.

Listing review separates administrative visibility from the lifecycle status and quantity contract. Hide/restore requires a reason and current version. Hidden listings cannot be discovered, newly requested or accepted; owners retain records and see an explanation. Accepted collection and receipt history remain intact. Private listing images are administrator scoped.

Commitment exceptions identify suspended participants, disputed handovers and missed pickups. Case summaries omit beneficiary text, need statements, addresses/instructions and transfer notes. Private review notes use version/timestamp guards and atomic audits; they do not release quantities, alter request status or settle participant disagreements. See [administrative review policy](admin-review.md).

## Verification evidence

- `npm test`: 90 unit/model/template tests passed. Unit file workers now run serially to avoid Windows startup contention starving bounded configuration probes; the checks and timeouts remain intact.
- Final `npm run check`: 160 JavaScript files passed syntax checks. The final browser-test synchronization edit also passed its focused syntax check.
- Full `npm run test:integration`: 143 checks passed on owned disposable MongoDB 8.2.5 replica sets.
- Final focused administration/notification integration run: 22 checks passed, including an additional listing/note audit-rollback scenario. This focused count is not added to full-suite totals.
- Full Chromium desktop/mobile browser run: 45 tests passed; the mobile administration test navigated away before its approval POST completed. Trace inspection showed that POST aborted with status -1. The test now waits for the decision redirect before opening history.
- Final focused administration browser rerun: 2 tests passed, verifying desktop and mobile workflows, final review layouts and private decision history. Twelve page observations passed accessibility and horizontal-overflow checks. Across full and focused runs, all 46 distinct browser scenarios have passing evidence; reruns are not added to full-suite totals.
- Git whitespace checks and representative desktop/mobile visual review completed.

Database scenarios cover atomic suspension/reactivation, audit-failure rollback, old-cookie rejection after reactivation, visibility/acceptance races, suspension/acceptance races, unchanged commitments, stale organization evidence, competing organization decisions, private notes/documents, CSRF, legacy suspended donors and filtered queues. The new browser scenario exercises approval evidence, listing hiding, suspension, exceptions, account history and follow-up notes.

Logs are in ignored `artifacts/logs`; final targeted logs are `day20-final-integration.log` and `day20-final-browser.log`. New screenshots are in ignored `artifacts/day-20`. Synthetic-only fixtures and isolated runtime/database infrastructure were used. No real mail was sent.

## Preserved data and remaining limits

Existing application data, `.env`, uploads and unrelated `Readme1.md` are preserved. No production migration, remote push, PR or deployment is part of this stage. New moderation fields have defaults; older suspended donors are checked through their actual account state. Existing quantity/reservation contracts remain authoritative.

Organization audit metadata identifies reviewed submissions but does not archive old document contents. General participant report submission, administrator impersonation, forced handover/receipt certification and administrative quantity release are outside this stage. Active counterparties retain existing permitted lifecycle actions; administrative notes do not resolve or clear exceptions.

Hosted CI, production infrastructure, real mailbox delivery, other browser engines, physical devices/screen readers, participant research and earlier dependency/asset-permission findings remain unverified or pending. Persistent sessions, shared rate limits and broader browser security remain Day 21.
