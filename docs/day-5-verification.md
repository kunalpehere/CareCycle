# Day 5 implementation and verification

Date: October 12, 2026. Status: implemented and locally verified for accounting/lifecycle contracts and migration preparation.
Branch: `codex/day-5-quantity-contracts`.
Commit: the commit containing this record, `refactor(donations): define quantity and lifecycle invariants`.

## Delivered

- Explicit total, allocated, reserved, handed-over, available and release semantics. Retained existing allocation meaning; added handed-over quantity and accounting version 1 to new listing documents.
- Shared accounting calculations and candidate reservation/release/handover transformations, with integer and cross-field invariants. Mongoose document validation rejects invalid listing accounting and fractional request quantities.
- Listing/request/pickup transition and actor contracts, acknowledgement/full-fulfillment completion prerequisites, plus edit and withdrawal policy calculations. Pickup states are planned contracts, not a new persisted pickup feature.
- Conservative, default-dry-run migration CLI and planner. Apply requires maintenance attestation and a replica set, refuses any blocked record or orphan request, and commits supported changes in one transaction. Raw collection reads preserve evidence of missing fields; models/indexes are not initialized by the CLI.
- [Detailed contracts and migration/recovery procedure](quantity-and-lifecycle-contracts.md), including staged integration boundaries and limitations.

## Checks and actual results

Local environment: Windows, Node 22.14.0, npm 10.9.2; installed MongoDB 8.2.5 explicitly selected for disposable test instances.

| Check | Result |
|---|---|
| `npm test` | 55 tests passed, zero failures/skips; 79 JavaScript files passed syntax checks. Includes six new accounting/lifecycle/model/backfill tests. |
| `npm run test:integration` | Three tests passed, including the new migration scenario against a real disposable replica set. |
| Migration CLI and dry run | Synthetic five-unit listing with two accepted units reported one proposed backfill, zero blocked records and zero applied writes; raw record remained unchanged. Apply without maintenance attestation exited 1 without changing the fixture. Actual synthetic report is captured in `artifacts/logs/integration.log`. |
| Migration refusal and recovery | Invalid allocation and orphan requests each prevented all writes. A deliberately rejected second update rolled back the first update. After removing the synthetic database validation fault, apply updated two eligible records; repeating apply performed zero writes. Legacy `matched` status remained unchanged. |
| `npm run test:browser` | Four existing desktop/mobile login/navigation smoke checks passed. No UI assets/templates changed. |
| Final review | Accounting, lifecycle guards, legacy ambiguity, migration rollback/privacy and staged boundaries reviewed. Git whitespace checks passed. |

Initial sandboxed checks failed for local network access: the existing cookie fixture timed out and MongoDB processes reported loopback `EACCES`. The same suites passed with the permissions needed for owned local test servers; test expectations were not weakened.

## Limits and preserved state

- Day 5 contracts are not yet wired into matching/discovery/edit/withdrawal routes. Existing separate acceptance/reservation writes and partial-allocation discovery remain Day 6 defects. Retry/index migration and pending-request resolution remain Day 7; broader concurrency/privacy coverage remains Day 8.
- No pickup/handover/acknowledgement workflow or append-only fulfillment event store was introduced. Later route implementations must verify resource ownership, trusted evidence, stale versions and exactly-once state changes transactionally.
- Mongoose document validation does not protect raw/update-operator writes by itself. The backfill tool is for the current prototype dataset under stopped writers; it does not enforce a process lock or support arbitrarily large datasets. Later partial fulfillment requires revisiting its reconciliation rules.
- No dry run or migration was performed against the existing application database. No `.env`, existing application records, uploads or unrelated `Readme1.md` were changed. The normal application remains stopped.
- No remote push, pull request, hosted CI, deployment or real-mail check was performed. Existing dependency and production-readiness limitations remain open.

Day 5's scoped acceptance checks are complete. Day 6 is the next development stage.
