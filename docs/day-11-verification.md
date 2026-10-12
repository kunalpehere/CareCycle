# Day 11 handover and NGO acknowledgement

Date: October 12, 2026. Version: `0.6.0-alpha.2`.
Branch: `codex/day-11-handover-acknowledgement`.
Commit: the commit containing this document, `feat(handover): add two-party receipt acknowledgement`.

## Participant journey and policies

The matched donor can record a physical transfer once the confirmed pickup window starts. The donor enters actual quantity within the remaining reservation, confirms an equipment-type/condition-review/accessories checklist and optionally records notes. Future, proposed, missed or disputed plans cannot record a transfer. A transfer changes physical accounting, but does not declare receipt or complete the request.

The matched verified NGO must enter the exact received quantity and explicitly confirm quantity and condition before acknowledging the transfer. Only the NGO can acknowledge; the donor cannot act on its behalf. Quantity or condition differences use a separate discrepancy report with received quantity and a required explanation. Reports do not automatically release stock, alter physical totals or claim mutual completion.

Disputed receipt blocks further pickup arrangements and remaining-unit release. The donor proposes an agreed actual quantity and explanation; the NGO enters that exact quantity with a receipt/condition-resolution declaration and confirmation note. Original donor quantity, NGO claim, both actors/timestamps and all proposal/confirmation events remain in history. The agreed quantity can increase or decrease the original claim, including zero, but cumulative actual transfers cannot exceed the accepted commitment. Corrections change handed-over totals only after NGO confirmation; allocation stays committed until fulfillment or an explicit release. Unresolved claims use matched contact details and manual Contact escalation with the request reference and no beneficiary details. There is no independent equipment inspection or automatic adjudication.

After acknowledging a partial transfer, the request remains accepted with its remaining reservation visible. Either participant can arrange another pickup, which needs fresh counterparty confirmation, or propose releasing all remaining units. A release proposal pauses pickup changes. Only the other participant can confirm release; either side's confirmation requires a reason and declaration that no additional equipment was handed over. Only the proposer can withdraw a release proposal to resume collection. Transferred/acknowledged units remain allocated. Before any actual handover, ordinary Day 10 cancellation remains available. A mutually corrected zero transfer can also be cancelled; its original claim is preserved.

Request completion requires all transfer records acknowledged and `handedOverQuantity + releasedQuantity = original quantity`. The request's original quantity never changes. A partially fulfilled request can complete with a smaller actual quantity only after the remainder is released by agreement. The completed request remains a blocking historical attempt under Day 7 policy, so it does not create a new request for the same NGO/listing. Remaining stock can serve other organizations. Completion screens explicitly show actual acknowledged quantity, not the original quantity as an impact count.

A listing completes only when every offered unit has been physically transferred and every committed request is completed with settled transfer records. Full handover alone does not close the listing. A partially fulfilled listing remains available for uncommitted stock and can be withdrawn after all outstanding reservations and acknowledgements are resolved.

## Storage, transactions and compatibility

- `DonationRequest` adds acknowledged/released quantity totals and optional fulfillment containing individual transfer records, resolution proposals, a remainder-release proposal and completion time. Each transfer has its own ID, original declared quantity, current agreed quantity, donor checklist/notes, receipt status, NGO claim and acknowledgement actor/time.
- Pickup states add handed over, acknowledged and disputed. Existing version checks now serialize pickup, cancellation, transfer, receipt, correction and remainder actions. The activity history contains transfer references, quantity/checklist evidence, reasons and released-unit events.
- Every fulfillment write rereads the accepted request and listing inside one transaction, verifies ownership/version/state, reconciles commitments and physical totals against the listing, saves request/transfer/history and updates listing quantities/version/status together. A failed write rolls back both records. Listing writes serialize sibling fulfillment, matching and quantity/withdrawal updates. Replays cannot add another transfer, acknowledgement, correction or release.
- A transfer increases request/listing handed-over quantities, reduces reserved units and leaves availability unchanged. NGO acknowledgement changes receipt accounting, without releasing stock. Agreed quantity corrections adjust physical totals with corresponding reserved changes; agreed remainder release decreases allocated units and increases availability.
- Ordinary cancellation still refuses any request with actual handover. An untouched sibling can now be cancelled on a partly transferred listing when all physical totals reconcile to known request transfer records. The Day 10 conservative listing-wide restriction remains for ambiguous legacy data.
- Pending acknowledgement prevents listing withdrawal. The shared lifecycle contract now supports partial completion with agreed release evidence and continuing acknowledged partial pickups. Document validation bounds quantity totals and reconciles new transfer records; transactional services enforce update invariants.
- New fields are additive and default to zero/null. No migration or new index is needed for records without old physical evidence. Legacy handover totals without matching transfer/acknowledgement records are never automatically promoted into NGO-confirmed receipt; the interface directs participants to review them through Contact. Existing data was not changed by this stage.

## Verification evidence

Windows, Node 22.14.0; installed MongoDB 8.2.5 explicitly selected for disposable test instances using `CARECYCLE_TEST_MONGOD`. Existing isolation prevents developer database, secrets, email or upload selections from entering test fixtures.

| Check | Result |
|---|---|
| `npm test` | 69 unit/model/template/configuration tests passed. |
| Source syntax | 110 JavaScript files passed checks. |
| `npm run test:integration` | 80 tests passed; 16 new handover scenarios plus their parent test extend the previous 63. |
| `npm run test:browser` | 14 desktop/mobile checks passed, including donor handover, NGO discrepancy, resolution, partial remainder release and full receipt acknowledgement. |
| Visual inspection | Desktop/mobile discrepancy and completion layouts inspected; no horizontal overflow in the browser flows. Human-readable activity actions, green/neutral surfaces and rectangular controls retained. |

Database coverage includes role/ownership/CSRF/forged-field boundaries, window/checklist/quantity validation, duplicate/concurrent handovers and receipts, donor-only completion rejection, partial continuation with a newly confirmed pickup, acknowledgements racing receipt disputes, upward/downward/zero corrections, fresh correction confirmation, counterparty-only remainder release and proposer-only withdrawal, real cancellation-versus-handover transactions, injected handover/acknowledgement write failures with rollback/retry, independent sibling cancellation, multi-NGO listing completion, ambiguous legacy totals, pending-receipt withdrawal blocking, protected caching, suspension and NGO verification.

Diagnostics: `artifacts/logs/unit.log`, `integration.log`, `browser.log`. Visual evidence: `artifacts/day-11-desktop-discrepancy.png`, `day-11-mobile-discrepancy.png`, `day-11-desktop-completed.png`, `day-11-mobile-completed.png`. Artifacts are local and ignored by Git. Existing CI commands automatically discover new tests; hosted CI was not run. An initial unit check exposed a changed integer-validation error message; the final message preserves the existing whole-number validation contract.

## Remaining work and runtime

Day 12 provides printable/downloadable donation receipts, stable references and outcome records. Day 13 provides durable lifecycle notifications. Manual escalation is not a staffed-response guarantee. Concurrent account-moderation ordering remains the existing application limitation. Original databases, uploads, `.env` and unrelated `Readme1.md` were preserved. The previously reviewed application and development database remain stopped; no migration, real email, remote push, PR or deployment was performed.
