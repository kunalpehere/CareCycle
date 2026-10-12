# Day 6 implementation and verification

Date: October 12, 2026. Status: implemented and locally verified.
Branch: `codex/day-6-transactional-matching`.
Commit: the commit containing this record, `fix(matching): make acceptance atomic and retain remaining availability`.

## Delivered behavior

- Acceptance rereads the pending request and donor-owned listing inside a snapshot transaction. It uses the persisted request quantity, validates listing accounting, conditionally reserves capacity and marks the request accepted with the same session. Majority commit makes both writes succeed together. No compensating rollback or independently exported reservation/release write remains.
- Driver write-conflict retries reread current state. A repeated decision returns a conflict without changing quantity; competing acceptances cannot exceed total units. A request-state conflict or write failure aborts the reservation and status change. The service rechecks donor ownership; route role, active-account, CSRF and verified-organization guards remain in place.
- A shared availability predicate uses `quantity - allocatedQuantity`. Catalogue results/counts, detail access, image access and request creation use it. Legacy `requested`, `matched` and `pickup_scheduled` listings with remaining units are discoverable; withdrawn/completed and exhausted listings are excluded. Successful acceptance keeps the canonical listing lifecycle `available` independently of request fulfillment.
- Catalogue quantity, detail quantity and request form maximum now show remaining units. Five units with two accepted expose three requestable units. Exhausted detail URLs return 404; direct new-request posts return 409.
- Pending-request creation checks availability and touches the listing version in a transaction before inserting the request. This serializes creation with acceptance while leaving stock unreserved. Several pending requests can still compete for the same stock; live acceptance decides allocation.
- Partially allocated listings remaining `available` must not regain unsafe donor actions. Donor edit/withdraw UI and server guards now reject committed listings. Edit writes also compare the loaded version, so a stale form cannot overwrite a concurrent reservation. This intentionally retains conservative no-edit/no-withdraw behavior for any allocation; nuanced quantity editing and pending-request resolution remain Day 7.

## Setup and existing records

Matching and request creation require a writable MongoDB replica set with transactions. Use the [Day 4 development replica-set setup](runtime-configuration.md). The example now uses localhost port 27018, replica name `carecycle-dev` and `MONGO_REQUIRE_REPLICA_SET=true`. A standalone database has no matching fallback. Keep the existing database name; an empty replica instance is not automatically the existing database or a data migration.

For an existing `.env`, configure the replica-set URI and enable the readiness gate through the environment before starting the app. This implementation did not alter your `.env`, move existing records, initialize a replacement database, or run backfill against the application database. The existing application remains stopped. Review legacy records using the Day 5 dry-run/backfill procedure before moving any real dataset into matching; inconsistent allocations must be reconciled from evidence, not guessed.

## Checks and evidence

Local environment: Windows, Node 22.14.0, npm 10.9.2; installed MongoDB 8.2.5 explicitly selected for new disposable replica-set processes.

| Check | Actual result |
|---|---|
| `npm test` | 55 unit/model/template/configuration tests passed, zero failures/skips. Partial-stock EJS fixtures check catalogue quantities and form maximum. |
| Source syntax | 83 JavaScript files passed checks after the new integration/browser fixtures were added. |
| `npm run test:integration` | 14 tests passed, including 10 new matching scenarios plus their parent test and the three existing database/topology/backfill tests. |
| Matching integration scenarios | Partial/full allocation; stale caller quantities; competing acceptance; simultaneous and repeated decisions; acceptance versus cancellation; stale edit rejection; aborted acceptance write; bounded requests on remaining/closed/exhausted listings; creation versus exhaustion; authenticated catalogue/detail/form/contact flow; foreign donor, verification, suspension and committed-listing guards. Related assertions share named scenarios rather than each being counted as separate tests. |
| Deliberate failure | A temporary MongoDB collection validator rejected the request acceptance write after reservation. Both listing allocation/status and request state remained unchanged after abort. The validator was removed from the disposable fixture. |
| `npm run test:browser` | Six tests passed: the four prior login/navigation smoke checks and two authenticated matching workflows at desktop/mobile widths. |
| Rendered inspection | Screenshots show remaining quantity 3 and request maximum 3 on desktop and mobile; no horizontal overflow, private donor contact or design changes were observed. Both workflows then request/accept the remaining units and verify the empty catalogue. |
| Final review | Transaction session use, live quantities, retries, legacy statuses, closed listings, projection/privacy boundaries, edit guards and staged diff reviewed. Git whitespace checks passed. |

Generated local evidence: `artifacts/logs/unit.log`, `artifacts/logs/integration.log`, `artifacts/logs/browser.log`, `artifacts/day-6-desktop-remaining-stock.png` and `artifacts/day-6-mobile-remaining-stock.png`. All fixtures are synthetic and use disposable test infrastructure. Browser seeding is called only by the test server, with no application seed endpoint.

## Remaining limitations

- The existing unique donation/organization index still prevents re-requesting after cancellation or rejection. Withdrawal and edits do not yet resolve existing pending requests or provide the full Day 7 stale-action recovery UX.
- No pickup, accepted-request cancellation, physical handover or acknowledgement workflow was added. Those remain later stages; the quantity contract preserves future handed-over accounting.
- Active accounts and verification are checked by existing request middleware. Concurrent administrative suspension/revocation effects on commitments remain later moderation work, rather than an added cross-record lock in this stage.
- Hosted CI, production infrastructure/TLS, real mail delivery, deployment and existing dataset migration remain unverified. Existing dependency findings remain unresolved. No push, PR or deployment was performed.

Day 6's local acceptance checks are complete. Day 7 is next.
