# Day 10 cancellation and missed collections

Date: October 12, 2026. Version: `0.6.0-alpha.2`.
Branch: `codex/day-10-cancellation-missed-pickups`.
Commit: the commit containing this document, `feat(pickup): handle cancellations and missed collections`.

## Participant policies

- Either matched participant can cancel an accepted request before any equipment handover, including before arranging a pickup or after an undisputed missed collection. A 10–500 character reason and explicit declaration of no handover are required. Pending-request cancellation keeps its existing separate behavior.
- Cancellation closes the request, releases its entire outstanding commitment once, and records authenticated actor, role, timestamp, reason and released quantity. It preserves the acceptance note/actor/time, pickup snapshots, previous events and original request quantity. Cancelled records do not reopen; permitted retry creates a new request.
- A confirmed pickup can be reported missed only after its window ends. Either participant can report it with a reason and no-handover declaration. The request remains accepted and its units remain reserved. No automatic missed status or release is inferred from time alone.
- The other participant can dispute the missed report, with a reason. While disputed, cancellation, confirmation and rescheduling are blocked. Only the participant who recorded the disagreement can withdraw it, with a reason and no-handover declaration. The original reporter cannot erase the disagreement. Both report and disagreement remain in history after withdrawal or rescheduling.
- When participants cannot agree, the page directs them to their matched contacts and the existing Contact page with the request reference, without beneficiary details. This is manual escalation, not an administrator queue, automatic adjudication, guaranteed response, or durable notification. No administrator may impersonate a participant to release stock.
- An undisputed missed pickup can be rescheduled by either participant. The replacement needs fresh counterparty confirmation. Cancellation retains private collection history with no action forms; request cards link to that history.

## Transaction and handover boundaries

`cancelAcceptedRequest` rereads the current request and listing within a MongoDB transaction, verifies participant scope, accepted status, pickup version, quantity bounds and handover/disagreement guards, then writes request cancellation/history and decrements allocated quantity in the same transaction. Listing version increments to invalidate stale listing forms. Listing status becomes canonical `available`; remaining availability continues to derive from quantities. A failed write aborts both records. A competing pickup action changes version/state and prevents release; replay cannot release twice.

Cancellation, missed reporting and ordinary pickup updates reject request handover evidence. A new per-request `handedOverQuantity` defaults to zero; legacy missing fields are treated as no recorded handover. Document validation bounds it to integer units within the request quantity. Cancellation additionally refuses listings with any aggregate handed-over quantity. This conservative legacy safeguard can also block an untouched sibling request on a partially fulfilled listing; Day 11 must implement per-request transfer reconciliation before relaxing it. Existing schema and listing guards do not establish physical facts; participant declarations and later handover evidence are distinct records.

The cancellation-versus-handover test uses a test-only transaction that writes both request fulfillment and listing handover quantities. It proves the shared transaction contract, not a delivered handover feature. Day 11's real handover writer must guard accepted state and current pickup version, write request transfer evidence and listing quantities transactionally, and preserve history. Raw unguarded future writes would violate the contract.

Pickup states now include `missed` and `cancelled`. Event types add missed, disputed, resolved and cancelled; reasons and released quantities are stored in history. Cancelling before any proposal creates a cancelled plan with a null proposal. Other pickup states require a proposal. No new index or data migration is required. Missing cancellation/missed-report fields remain readable.

## Verification

Environment: Windows, Node 22.14.0, installed MongoDB 8.2.5 explicitly selected for disposable test instances through `CARECYCLE_TEST_MONGOD`. Developer database, secrets, mail and upload locations were isolated by the existing harness.

| Check | Result |
|---|---|
| `npm test` | 65 unit/model/template/configuration tests passed. |
| Source syntax | 104 JavaScript files passed checks. |
| `npm run test:integration` | 63 tests passed. The new suite adds 12 named scenarios and its parent test to the previous 50 tests. |
| `npm run test:browser` | 12 desktop/mobile checks passed. New flows cover missed reports, disputes, blocked actions, withdrawal, rescheduling, fresh confirmation, cancellation, replay, history and restored availability. |
| Visual review | Desktop/mobile disagreement and cancelled-history screenshots inspected, with no horizontal overflow in the verified browser flows. Green/neutral surfaces, explicit field labels and rectangular controls retained. |

Database checks include guest/wrong-role/foreign access, CSRF, forged identity/release fields, reason/declaration/version validation, legacy unarranged cancellation, concurrent participant cancellations, fully exhausted listing rediscovery, missed/proposed cancellations, future/unconfirmed missed-report rejection, disputed-plan blocking and authorized withdrawal, cancellation versus rescheduling, injected listing-write failure with rollback/retry, handover evidence and the synthetic transfer race, sibling acceptance and preserved retry history, protected caching, suspension and NGO verification.

Diagnostics: `artifacts/logs/unit.log`, `integration.log`, `browser.log`. Screenshots: `artifacts/day-10-desktop-disagreement.png`, `day-10-mobile-disagreement.png`, `day-10-desktop-cancelled.png`, `day-10-mobile-cancelled.png`. Artifacts are local and ignored by Git. Existing CI commands automatically discover the new tests; hosted CI was not run.

During verification, an older rendering fixture needed an explicit accepted status. Stricter conditional proposal validation initially mishandled Mongoose update-query context when cancelling an unarranged acceptance; the final validator supports document and query contexts. The legacy cancellation, replay and failure/retry tests verify that case.

## Runtime and remaining stages

Original application databases, uploads, `.env` and unrelated `Readme1.md` were preserved. The previously reviewed application/development database remain stopped. No real mail, migration, remote push, PR or deployment. Day 11 provides physical handover, NGO acknowledgement and partial/discrepancy rules; Days 12–13 provide receipts and durable lifecycle notifications. Concurrent account-moderation ordering remains the existing application limitation.
