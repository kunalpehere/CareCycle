# Day 9 pickup arrangements

Date: October 12, 2026. Application version: `0.6.0-alpha.2`.
Branch: `codex/day-9-pickup-arrangements`.
Commit: the commit containing this document, `feat(pickup): add confirmed collection arrangements`.

## Delivered behavior

Accepted request cards link to private pickup pages. The matched donor or verified NGO can propose local start/end times, an IANA time zone, a private address and optional coordination instructions. The other participant must confirm. Either can replace a proposed or confirmed plan; replacement clears confirmation and needs fresh counterparty confirmation. Past windows can be replaced, but cannot be newly confirmed. A pickup schedule does not record a physical handover.

Current arrangements and chronological history show participant role, action, timestamp, window, zone and private coordination details. User-entered content is escaped. Invalid submissions preserve entered values. Stale/replayed forms return HTTP 409 with the latest plan; validation errors return 422. Unrelated participants receive 404, wrong roles/administrators receive 403, and account suspension or revoked NGO verification block access through existing gates. Protected responses remain `private, no-store` and vary by cookie.

## Storage and time contract

- Each `DonationRequest` has an optional embedded `pickup`. Missing/null means unarranged, including legacy accepted requests. No migration or new index is necessary.
- The embedded plan contains status, integer version, proposal, confirmation actor/time and event history. Proposals store UTC instants, local minute strings, IANA zone, address, instructions and authenticated proposer identity/role.
- Every mutation requires accepted request status and the submitted current pickup version. First proposal matches null/missing pickup and creates version 1. Later writes compare the version, increment it, update the plan and append an event atomically in the same document. A competing or repeated write cannot overwrite another plan or duplicate history.
- Events retain proposal snapshots. Rescheduling preserves earlier dates, addresses, instructions and confirmations in history. Forged form identity/status fields are ignored.
- Named-zone conversion uses Node's Intl time-zone data, independently of server time zone. Invalid calendar values, unknown zones, past starts, reversed/equal windows and clock-change gaps/overlaps are rejected. Ambiguous local times require another time rather than an implicit choice. Address is 5–500 characters; instructions at most 1000.
- Scheduling never writes listing quantities/status, request quantity or reservation accounting. Two accepted NGO requests for one listing retain independent plans.
- Future cancellation/handover code must preserve the request-state and version guards and append history rather than replacing it with user-supplied data.

## Verification

Windows, Node 22.14.0; installed MongoDB 8.2.5 explicitly selected for disposable databases through `CARECYCLE_TEST_MONGOD`. Test settings isolate database selection, secrets, mail and files from the developer runtime.

| Check | Result |
|---|---|
| `npm test` | 64 unit/model/template/configuration tests passed. |
| `npm run check` | 101 JavaScript files passed syntax checks. |
| `npm run test:integration` | 50 tests passed, including 10 new pickup scenarios and their parent test. |
| `npm run test:browser` | 10 checks passed across desktop and mobile, including proposal errors, preserved input, confirmation, rescheduling, stale-form recovery, history and request links. |
| Visual inspection | Desktop/mobile pickup screenshots inspected; no horizontal overflow, consistent green/neutral surfaces and rectangular controls. |

Diagnostics: `artifacts/logs/unit.log`, `integration.log`, `browser.log`; screenshots: `artifacts/day-9-desktop-pickup.png` and `artifacts/day-9-mobile-pickup.png`. Artifacts are locally generated and ignored by Git. Automatic test discovery includes the new suites in existing CI commands; hosted CI was not run.

Initial verification encountered sandbox local-network restrictions and an unavailable MongoDB download. Checks ran successfully with local networking permitted and the installed executable. Test development corrected missing synthetic NGO document metadata, an availability assertion and textarea label structure. Final results above describe the completed checks.

## Boundaries

No application database migration, original upload change, `.env` change, real email delivery, deployment, remote push or pull request. The previously reviewed runtime on ports 4000/27018 remains stopped. Unrelated `Readme1.md` is preserved. Accepted-request cancellation and missed pickups belong to Day 10; physical handover, acknowledgement, receipts and durable lifecycle notifications belong to Days 11–13. Time-zone rules come from the runtime's bundled data; update runtime data when legal clock rules change. Concurrent account-moderation ordering remains the existing application limitation.
