# Administrative review and moderation

Day 20 extends the existing administrator role. Organization verification remains separate from email ownership, equipment inspection and medical fitness.

## Review queues and evidence

The administrator overview filters pending, verified and rejected organization applications. Applications and participant accounts are paginated in groups of 20 with actual filtered counts. Organization review shows the current application, owner status, private document and the most recent 20 audit entries. Older audit entries remain stored. Administration access requests are a bounded preview explicitly labelled as records shown; web review does not provision accounts.

Both organization approval and rejection require a reason, an explicit evidence-review declaration and the version of the application displayed. Approval requires an active NGO owner and document metadata. Organization edits/resubmission increment the version; a stale administrator form cannot approve a replacement application. Decision, actor, reason, reviewed version, organization identity, submission date and document metadata are recorded atomically with the outcome and existing notification event. Document metadata records which submission was reviewed; it is not an immutable archived copy of the file. Existing resubmission/file-retention behavior is unchanged.

## Account decisions and suspension effects

Suspension and reactivation require reasons between 10 and 500 characters and the current moderation version. Target account changes, donor discovery gates and audit entries share one MongoDB transaction. Concurrent or repeated decisions return a conflict rather than writing duplicate decisions. No web action moderates an administrator or deletes an account.

Both decisions increment the account authentication version. Suspension immediately rejects subsequent authentication; reactivation requires a fresh sign-in and cannot resurrect an old cookie. Actor writes inside core matching, listing, organization, pickup, cancellation, handover and receipt transactions serialize those operations with suspension. An operation that commits before suspension remains recorded. Authentication alone does not cancel an already-started read, mail attempt or non-workflow preference operation.

Suspension never automatically cancels accepted requests, releases inventory or deletes evidence. Donor listings receive a separate suspension gate; discovery also joins the donor's current account state to handle older suspended accounts without a backfill. A suspended NGO member cannot create requests or receive a new acceptance. Existing accepted commitments appear in the administrator's suspended-participant exceptions filter. An active counterparty retains its existing permissions, including guarded cancellation where the lifecycle permits it. Administrators can record follow-up and reactivate after review; they cannot impersonate participants, certify receipt or force quantity release.

## Listing visibility

`/admin/listings` provides a paginated inventory review with filtered counts. The administrator can inspect declared equipment details and privately served listing images. Visibility changes require reasons and a current listing version. Moderation affects discovery, discovery images, new equipment requests and new acceptance. Lifecycle status, offered units, allocations, transfers and accepted commitments remain unchanged. Existing pending requests retain their history; donors may reject them or await review before acceptance.

The donor dashboard explains hidden listings and reports zero units currently requestable while retaining the actual quantity breakdown. Donor edits cannot clear administrative moderation. Restoring a hidden listing does not reactivate a suspended donor or reopen a withdrawn/completed listing. A stale decision after a participant edits or allocates the listing requires reloading.

## Commitment exceptions and follow-up

`/admin/exceptions` filters accepted commitments with a suspended participant, disputed handover or missed pickup. Flags derive from current account and workflow state and disappear when the underlying condition is resolved. A note does not clear a flag or claim resolution.

Case pages show account status, equipment and recorded quantity/status summaries. Beneficiary text, need statements, pickup addresses/instructions and transfer notes are omitted. Administrative follow-up notes are private audit entries. A version and update-timestamp guard makes replay/stale submissions safe; note/audit writes are atomic. Notes never change request status, reservations, transfer quantities or participant discrepancy evidence. A general participant report-submission system and administrative override of donation accounting are outside this stage.

## Operational boundaries

Private documents remain accessible only to the owning NGO and authorized administrators. Listing review images require administrator authorization and a matching stored filename. All web mutations preserve CSRF and rate-limit checks. Missing new moderation/version fields are treated conservatively; this stage does not rewrite existing application data or run a production migration.

Use these actions rather than manually editing MongoDB statuses. Audit history contains operational reasons and must remain restricted to administrators. Production deployment, hosted CI, real mailbox delivery, other browser engines and physical-device/screen-reader testing remain external checks. Persistent sessions, shared rate limits and broader browser security remain Day 21.
