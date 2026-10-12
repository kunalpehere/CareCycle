# Day 7 implementation and verification

Date: October 12, 2026. Status: implemented and locally verified.
Branch: `codex/day-7-request-policies`.
Commit: the commit containing this record, `fix(requests): support explicit retry and withdrawal policies`.

## Delivered

- New request attempts after rejection/cancellation; prior history retained. Blocking-state partial unique index and transactional service duplicate guard. Completed attempts remain blocking under the chosen retry policy.
- Guarded default-dry-run index migration, snapshot legacy-data inspection, blocker reports, replacement-before-drop ordering, repeat application and interruption recovery instructions.
- Read-only startup index preflight that refuses legacy/incompatible constraints before model initialization; explicit migration is required for an existing database.
- Transactional listing quantity edits and withdrawal; pending-request resolution also runs after acceptance. Accepted commitments remain protected. Full equipment edits are locked during pending requests/allocations.
- Versioned listing forms, specific stale/conflict recovery pages with current availability and navigation, cancellation metadata, and equipment snapshots for new request history.
- [Detailed policies, migration and recovery procedure](day-7-request-policies.md), linked from the README.

## Verification

Local environment: Windows, Node 22.14.0, npm 10.9.2 and explicitly selected installed MongoDB 8.2.5 for disposable replica sets.

| Check | Actual result |
|---|---|
| `npm test` | 59 unit/model/template/configuration tests passed, zero failures/skips. Four new focused tests cover form versions, index contract, retry form eligibility and historical snapshot rendering. |
| Source syntax | 93 JavaScript files passed syntax checks after the final startup fixture was added. |
| `npm run test:integration` | 24 tests passed, including nine new migration/policy scenarios and their parent, plus the earlier database/matching checks. |
| Index scenarios | CLI dry-run and maintenance refusal leave legacy data/indexes unchanged; replacement-first interruption is resumable; repeat apply performs no changes; duplicate legacy blocking attempts refuse migration without deleting records; actual runtime startup refuses a remaining broad index and succeeds after migration. |
| Workflow scenarios | Concurrent duplicates permit one attempt; rejected/cancelled retry preserves prior records; new attempts capture trusted snapshots; quantity reduction resolves only oversized pending requests; positive totals below allocations and committed withdrawal fail; repeated/stale actions retain timestamps; deliberately failed resolution rolls back listing changes; withdrawal/reduction races preserve acceptance/accounting. |
| `npm run test:browser` | Eight desktop/mobile tests passed, including new end-to-end retry, cancellation, quantity reduction, stale form and withdrawal flows, plus the existing matching/login checks. |
| Rendered inspection | Recovery pages show current stock and useful links at desktop/mobile widths with no horizontal overflow. Cancelled Day 7 attempts expose no donor contact; legitimate accepted Day 6 history retains authorized contact. |
| Review | Transaction predicates/session use, version tokens, privacy, image cleanup, index scope, legacy handling and the final diff reviewed. Git whitespace checks passed. |

Generated local evidence: `artifacts/logs/unit.log`, `artifacts/logs/integration.log`, `artifacts/logs/browser.log`, `artifacts/day-7-desktop-stale-action.png` and `artifacts/day-7-mobile-stale-action.png`. Fixtures are synthetic and existing application records are excluded.

Startup inspection runs through a separate read-only preflight before automatic model initialization. Startup fixtures use asynchronous subprocesses to keep owned MongoDB log pipes draining during ordinary index creation; the earlier synchronous fixture timed out. Both legacy refusal and successful startup after migration are verified. The older race test was updated to assert the new explicit cancellation outcome after exhaustion. Browser fixtures now use distinct synthetic forwarded client addresses through an explicitly trusted loopback test proxy so each scenario exercises the unchanged real rate limiter independently. Confirmation and multi-attempt privacy assertions were corrected to match the actual UI and authorized contact scope.

## Preserved state and limits

- Existing `.env`, application database/indexes, uploads and unrelated `Readme1.md` were preserved. The normal application remains stopped. No remote push, PR, deployment or real mail delivery was performed.
- Before restarting against existing data, configure the replica set and execute the documented request-index migration under maintenance. Startup intentionally refuses the old broad index. No production or existing-application migration was run as part of this verification.
- Old request history without snapshots cannot prove original equipment metadata; current linked metadata remains the fallback. Complete fulfillment event timelines are later work.
- Accepted-request cancellation, pickup, handover and acknowledgement remain later stages. Concurrent administrative account/verification changes still use the existing middleware boundaries; comprehensive Day 8 regression coverage and later moderation policy remain pending.
- The index migration is resumable DDL under stopped writers; it is not an atomic DDL transaction or an automatic backup/restore system. Hosted CI, production infrastructure and existing dependency findings remain unresolved.

Day 7's local acceptance checks are complete. Day 8 is next.
