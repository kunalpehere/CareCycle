# Day 7 request, listing and index policies

Date: October 12, 2026. Implemented on `codex/day-7-request-policies`.

## Request attempts and retry

A verified active NGO can submit a new request after a previous attempt was rejected or cancelled, provided current stock supports its quantity. Each submission creates a new ID with its own quantity, need statement and timestamps. Prior requests, decisions, reasons and actor/timestamp fields remain intact. Existing rate limits still apply; repeated rejected/cancelled attempts have no additional cooldown in this prototype.

Pending, accepted and completed requests block another attempt for the same donation/organization pair. Pending/accepted are active workflow states. Completed is terminal, but blocks further requests because the selected retry policy permits only rejection/cancellation retries. The partial unique `request_current_attempt_v1` index covers these three blocking states; rejected/cancelled history is excluded. The service also checks existing blocking attempts. Concurrent submissions either create one current attempt or return a recoverable duplicate explanation.

Discovery detail gives priority to a blocking attempt, otherwise shows the latest historical attempt and a new request form. Request history retains every attempt and links to current equipment when remaining stock permits a retry. New requests capture equipment type, condition, location and offered total from the trusted listing as a snapshot. History uses that snapshot if the listing is later edited. Older records without snapshots show the current linked listing metadata; original metadata cannot be reconstructed honestly and is not fabricated by migration.

## Quantity, edits and withdrawal

All request creation, acceptance, listing quantity edits, full edits and withdrawal serialize through a write to the listing document in a snapshot/majority transaction. Browser listing forms carry the version they displayed. Transactions reread ownership and current state; stale versions return a 409 recovery page without overwriting later activity.

- Full equipment edits require an open listing, zero allocated units and no pending requests. Identity, condition, location, description and images stay frozen while a live request or commitment exists.
- A separate total-quantity form is available for open listings, including legacy open statuses. A whole-number total from 1 through 100 may increase or decrease, but cannot fall below allocated units, including any future handed-over units. This preserves accepted commitments.
- After a quantity reduction or acceptance changes availability, pending requests exceeding the remaining stock become cancelled with `availability_changed`, a readable note, actor and timestamp in the same transaction. Smaller pending requests remain pending. There is no automatic reduction of someone else's requested quantity; an NGO may submit a new smaller attempt.
- Withdrawal requires zero outstanding reservations. It sets the listing to withdrawn and cancels all pending requests with `listing_withdrawn` in the same transaction. It does not delete history, cancel accepted commitments or release committed stock. Once physically handed-over units exist, withdrawal may close only uncommitted stock when no reservation remains; physical handover is still a later feature.
- NGO cancellation remains restricted to its own pending request. It records `organization_cancelled`, actor, timestamp and a note. Repeated cancellation/rejection/acceptance does not rewrite a previous terminal decision or its timestamps.

If pending-request resolution fails, the listing change or acceptance rolls back too. Acceptance racing withdrawal/quantity reduction yields one consistent winner. Uploaded files staged for a failed full edit are cleaned up; a post-commit cleanup failure does not delete newly referenced images. Durable file/event handling remains later operational work.

## Stale action recovery

Authenticated stale/duplicate request actions and listing mutations return HTTP 409 with an explanation, current requestable quantity and links to current listing, history and discovery/dashboard as appropriate. Donor lookup remains constrained by ownership. NGO responses contain no donor contact details. Invalid IDs and foreign resource access retain 404/403 handling. This recovery page does not automatically resubmit a form or claim that a failed action succeeded.

## Index migration procedure

The existing application's broad unique donation/organization index must be migrated before this version starts against that database. Startup inspects existing request indexes through a read-only preflight connection before model initialization and refuses a legacy or incompatible pair constraint with an actionable message. A fresh development database initializes the new index; production requires explicit migration/index preparation.

The CLI uses validated runtime configuration, requires a writable replica set, and does not import models or initialize indexes automatically. It reads a snapshot of request identifiers, references and statuses. Dry-run output contains IDs and index names, not contact or beneficiary text. Keep reports restricted. This initial scan holds the prototype dataset in memory; large datasets require a separately planned bounded migration.

1. Stop the application and all other database writers. Back up the selected database and verify a restore on isolated infrastructure. Privately review the selected URI and database name; retain the intended existing name and use the documented replica-set configuration.
2. Run `npm run migrate:requests`. Default mode is read-only. Save and inspect its report: proposed replacement, broad indexes to remove, invalid records, conflicting blocking attempts and incompatible index definitions. A nonzero exit or listed blocker needs investigation.
3. Reconcile invalid/conflicting records from real decision evidence. Do not delete history or invent rejection/cancellation just to make a unique index build. The migration never resolves conflicts automatically.
4. With writers still stopped, run `npm run migrate:requests -- --apply --maintenance-confirmed`. The flag attests maintenance; it does not kill processes or enforce a lock. Apply rescans, creates the replacement unique partial index first, then removes only recognized broad unique pair indexes. Other indexes and all request documents remain untouched.
5. Rerun dry-run/apply. A clear repeat reports no creation, no drops and no applied change. Confirm startup readiness, inspect history/current attempts and run appropriate matching checks before resuming writers.

Index DDL is ordered and resumable, not an all-or-nothing transaction. If replacement creation fails, the old broad index remains. If interruption occurs after replacement creation, both constraints may remain and startup still refuses; keep writers stopped, inspect the report and rerun apply to finish removing the old constraint. If a recognized drop fails, investigate privileges/index state and rerun under maintenance. An incompatible target name/spec blocks apply rather than being dropped automatically.

Recovery after successful migration: prefer rolling forward. Restoring the old broad unique index may be impossible once retry history contains multiple attempts per pair. Do not discard attempts to recreate it. To revert to older code, stop writers and restore the verified pre-migration database snapshot, accounting for every subsequent activity before resuming. Older application code must not run against new retry data as though the old one-record assumption still holds.

No index migration, dry run or backfill was performed against your existing application database during implementation. Its index preparation remains an explicit operator step before restart.
