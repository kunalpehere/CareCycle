# Day 5 quantity and lifecycle contracts

Date: October 12, 2026. Contract version: 1.

Day 6 update: accounting is now integrated into transactional acceptance, request creation and remaining-stock discovery. See [Day 6 implementation and verification](day-6-verification.md). The Day 5 boundary below records the state when these contracts were introduced. Pending-request edit/withdraw reconciliation and retry still await Day 7.

## Implementation boundary

Day 7 update: [request/listing policies](day-7-request-policies.md) now enforce pending-request resolution, retries, versioned quantity/edit/withdrawal changes and preserved attempt history. The original Day 5 boundary below remains historical; pickup/handover transitions are still future contracts.

Day 5 adds tested pure accounting/policy helpers, document validation and a guarded backfill tool. These helpers define the behavior that later routes must enforce with transactional predicates and resource authorization. They do not authorize a caller by role alone. Existing matching, discovery, edit and withdrawal controllers retain their earlier behavior. The Day 6 atomicity/discovery defect and Day 7 retry/withdrawal defects remain open. Pickup records, handover and acknowledgement routes do not yet exist.

## Quantity contract

| Value | Meaning |
|---|---|
| `quantity` | Total units offered in this listing, integer 1 through 100 |
| `allocatedQuantity` | All committed units, including units already handed over; retained for existing writer compatibility |
| `handedOverQuantity` | Physically handed-over units, including transfers awaiting acknowledgement |
| Reserved | `allocatedQuantity - handedOverQuantity`, outstanding commitments |
| Available | `quantity - allocatedQuantity`, units that can receive a new commitment |
| Released | Units removed from an outstanding reservation by a specific release event; not a cumulative counter subtracted from availability |

Require `0 <= handedOverQuantity <= allocatedQuantity <= quantity`. Every quantity is a whole number. Reserved + handed over + available equals total. Pending requests do not reserve stock. Several pending requests may collectively exceed availability; acceptance must check live capacity.

For five units, accepting two gives three available and two reserved. Handing over one changes the reserved count to one and the handed-over count to one; availability stays three. Releasing the remaining reservation makes availability four; the handed-over unit stays committed. Acknowledgement changes fulfillment state, not quantity. Fully handed-over units cannot be released through cancellation.

`changeQuantityCommitment` computes a candidate change; it does not persist it or identify repeated events. Day 6 and subsequent fulfillment work must guard each event by its current request/pickup state in the same transaction as its quantity write. Replaying an already-applied event must do nothing. Document validation rejects invalid saves, but raw updates and Mongoose update operators require their own cross-field predicates.

## Lifecycle and actor contract

An actor is the authenticated owner or authorized participant of the specific record. Verified organization and active-account gates continue to apply. An administrator cannot impersonate a participant or bypass accounting. System actions require an authorized workflow context. `counterparty` means the participant other than the pickup proposer, determined from stored proposer identity.

The canonical listing lifecycle is `available -> withdrawn` or `available -> completed`. Availability is derived from quantities, even when a listing has zero remaining units. A listing completes only when all offered units have been handed over and all request handovers acknowledged. A partially fulfilled listing can close by withdrawal of the uncommitted remainder once outstanding reservations are resolved. Terminal listings expose zero requestable units.

Legacy `requested`, `matched` and `pickup_scheduled` listing enum values remain readable. They describe request progress rather than remaining stock. They must not be the canonical lifecycle for new transactional matching. Day 6 will reconcile their discovery behavior; this backfill deliberately preserves their statuses and historical timestamps.

| Record | Transition | Actor and prerequisite |
|---|---|---|
| Request | pending to accepted/rejected | Listing donor; acceptance needs sufficient live availability |
| Request | pending to cancelled | Owning organization, or system resolving withdrawal/stale availability |
| Request | accepted to cancelled | Matched donor/organization before any physical handover; release outstanding commitment exactly once |
| Request | accepted to completed | Owning organization after acknowledged handover of the fulfilled commitment |
| Pickup | unarranged to proposed | Donor or matched organization |
| Pickup | proposed to confirmed | Other participant, never the proposer confirming their own proposal |
| Pickup | confirmed/missed to proposed | Participant reschedules; a new proposal needs confirmation |
| Pickup | confirmed to missed | Participant reports missed collection; reservation remains until resolution |
| Pickup | proposed/confirmed/missed to cancelled | Participant, before handover |
| Pickup | confirmed to handed_over | Donor records actual transfer within accepted commitment |
| Pickup | handed_over to acknowledged/disputed | Receiving organization |
| Pickup | disputed to acknowledged | Organization after documented resolution |

Rejected, cancelled and completed requests are terminal history records. A permitted re-request will create a new record, not rewrite a prior decision; duplicate-active rules and index migration are Day 7. Pickup acknowledgement/cancellation are terminal. Partial handover and dispute resolution need explicit quantities and events in Days 10–11; an accepted request cannot be declared complete while an unfulfilled commitment remains. The current contract helper checks the transition and basic completion evidence; later routes must verify that evidence from trusted records, not form input.

## Edit and withdrawal policy

- Before any pending request or commitment, the donor may edit equipment details and total quantity.
- Once a pending request exists, freeze equipment identity, condition, location, description and images to preserve what was requested. Quantity may change, but the subsequent transaction must resolve requests that exceed new availability and record why. Editing against a stale version must return a conflict.
- Once a commitment exists, keep those equipment details frozen. Total quantity cannot fall below all allocated units, including fulfilled units. Adding stock is allowed within the listing limit; decreasing only uncommitted stock requires current request reconciliation.
- Withdrawal is allowed only with zero outstanding reservations. Resolve pending requests with explicit cancellation reasons in the same workflow. An accepted commitment must be cancelled/resolved separately before withdrawal, preserving its history.
- Withdrawn/completed listings cannot be edited or reopened silently. Never delete requests or rewrite a previous decision to achieve an edit, retry or withdrawal.

These policies are exposed by `listingPolicy`; their route integration and concurrent enforcement are later-stage work.

## Backfill procedure

`npm run migrate:quantities` defaults to a read-only dry run against the database selected by validated runtime configuration. It requires a replica set for a consistent snapshot. It does not import models, create indexes, send mail, change `.env`, or run the older embedded-products migration. Output contains record IDs, issue codes and proposed accounting fields, without user/contact text. Treat IDs and reports as restricted operational data.

1. Back up the selected database and test recovery against isolated infrastructure. Stop the application and every external writer; keep writers stopped during inspection, apply and verification. The maintenance flag is an operator attestation, not an automatic process lock.
2. Run `npm run migrate:quantities` and save the report in restricted storage. Review the selected database configuration privately. Nonzero exit means records need review or infrastructure failed.
3. Reconcile accepted/completed request quantities with stored allocations. Missing allocation can be derived from accepted commitments. Existing allocation mismatches, invalid quantities/statuses, orphan requests, withdrawn reservations and legacy completion/handover claims block apply. Never infer physical transfer evidence from a status label. Correct discrepancies only with documented evidence; rerun the dry run.
4. Once the report is clear, run `npm run migrate:quantities -- --apply --maintenance-confirmed`. Apply rescans within one snapshot transaction and refuses all changes if any record or orphan is blocked. Missing fields receive supported allocations, zero handover and accounting version 1. Existing values, IDs, status, requests and timestamps remain unchanged.
5. Rerun the dry run and apply against the same unchanged dataset: no new proposals or writes should occur. Verify the report and quantities before resuming writers.

This initial tool loads listings and request accounting into memory and applies one transaction. For a database too large for memory or MongoDB transaction limits, stop and design a checkpointed migration instead of assuming this tool scales indefinitely. It is intended for the current prototype dataset. Do not run it after introducing partial handover/cancellation accounting in later stages without reviewing its reconciliation rules.

Recovery: a failed transaction commits no partial backfill. A successful backfill is additive and retains `allocatedQuantity` semantics compatible with the older application. Prefer reverting application code while retaining these fields. If data restoration is required, stop all writers and restore the verified pre-migration snapshot; do not unset fields broadly or overwrite subsequent activity. Dry-run reports plus the backup identify exactly which records were changed. No existing application database was migrated as part of Day 5 implementation.
