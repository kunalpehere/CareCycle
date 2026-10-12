# Day 12 donation receipts and outcome records

Date: October 12, 2026. Version: `0.6.0-alpha.2`.
Branch: `codex/day-12-receipts-outcomes`.
Commit: the commit containing this document, `feat(receipts): add traceable donation handover records`.

## Receipt policy and participant workflow

Either matched participant can issue a receipt after a request completes with positive, reconciled NGO-acknowledged transfer records and no outstanding reservation. Unfinished partial requests, pending/disputed receipts and legacy totals without confirmation evidence do not qualify. A completed partial request with a jointly released remainder qualifies for its actual acknowledged quantity. Original accepted and released quantities are displayed separately; released units are never counted as received equipment.

The receipt has a stable `CC-` reference based on the request ID. It includes donor/organization display names, equipment, the recorded listing condition, actual NGO-acknowledged quantity, individual transfer/acknowledgement dates, original donor quantities, quantity correction/release events and receipt revision history. Dates are labelled UTC. Listing condition is explicitly a participant description, not an inspection certificate. No monetary valuation, tax-deduction eligibility, equipment certification or medical-fitness claim is made.

The download is a self-contained UTF-8 HTML file containing its recorded layout. It opens offline in a browser. The printable view uses A4 print CSS; native browser Print/Save as PDF produces PDF output without a server PDF dependency. The application does not offer a direct server-generated PDF download. Recorded HTML downloads of one revision are byte-identical; browser-generated PDF bytes are not claimed to be identical because browser print metadata can vary.

Only the receiving NGO can add/change/clear an optional aggregate use or outcome note, creating a new receipt revision. The form asks for no identifying beneficiary information or unsupported claims and requires an explicit declaration. This is a participant statement, not independently verified impact. There is no automatic PII detection. Donor/organization name corrections require a bounded reason, explicit privacy declaration and counterparty confirmation. A proposed correction does not change the published receipt; the proposer can withdraw it. Pending corrections pause outcome changes and cannot be overwritten. Both full proposal and confirmation reasons are preserved in confirmed revision evidence. Receipt quantities, equipment and handover dates are immutable here; discrepancies must be settled through the Day 11 process before issue.

## Authorization and storage

- Donor access is anchored to the stored donor identity after issue; NGO access requires the owning verified organization and an active authenticated account. Guessed IDs, role/query forgery and unrelated participants cannot read documents or change receipts. Existing suspension and verification gates apply to every download/revision.
- Active provisioned administrators may review issued receipts/revisions through a paginated index linked from the administration dashboard. Administration access is read-only and cannot issue, acknowledge or amend participant records.
- New optional embedded receipt data stores the reference, donor identity, current mutation version, an append-only revision array and receipt activity/proposal state. Each revision stores its snapshot, complete HTML, actor/time/reason and any jointly confirmed amendment evidence. Archived revisions are never rebuilt from current profile names, templates or outcome notes.
- Every mutation rereads the eligible request and checks the submitted receipt version in a transaction. Concurrent/repeated issue creates one revision; stale or duplicate updates cannot overwrite a proposal or append another revision. Failed persistence rolls back the new snapshot/activity. Receipt writes do not alter fulfillment, reservations or listing quantities.
- Stored receipt fields use an explicit allowlist. Beneficiary summaries, need statements, contact emails/phones, pickup addresses/instructions and raw handover/discrepancy notes are omitted. User-authored receipt/outcome/correction fields are escaped. Printable responses disable scripts/remote resources and use protected `private, no-store` caching. HTTP Content-Disposition names the reference and revision.
- No schema migration/new index is required. Existing completed Day 11 records can issue their first receipt deliberately; reads/downloads never auto-create records. Invalid revision selectors return 404 rather than silently substituting the newest revision.

## Verification

Environment: Windows, Node 22.14.0, installed MongoDB 8.2.5 selected for disposable databases. Existing fixtures isolate developer settings, secrets, mail and uploads.

| Check | Result |
|---|---|
| `npm test` | 73 unit/model/template/configuration tests passed. |
| Source syntax | 117 JavaScript files checked. |
| `npm run test:integration` | 93 tests passed; 12 new receipt scenarios plus their parent test extend the previous 80. |
| `npm run test:browser` | 16 desktop/mobile checks passed, including revision downloads, outcome edits, confirmed corrections, archived-byte checks and A4 PDF printing. |
| Print layout | Two A4 pages per synthetic desktop/mobile receipt; all four rendered pages inspected with no clipped/overlapping content. Maximum-length names and 500-character outcome/proposal/confirmation notes remain legible. PDF text extraction confirmed the acknowledged quantity. |

Database coverage includes receipt eligibility, concurrent issuance, immutable byte-identical historical downloads, later profile changes, privacy allowlisting, administrator read-only access, tenant/guest/role/CSRF boundaries, bounded fields/privacy declarations, NGO-only outcomes, forged quantity/identity fields, two-party name corrections with maximum-length reasons, proposer withdrawal, concurrent/stale revisions, injected persistence failure/retry, suspension/revoked verification and invalid revision selectors.

Initial expanded parallel database execution hit isolated replica startup timeouts. The integration runner now uses test concurrency 1, after which all 93 database checks passed. Browser checks found maximum-length names overflowing the management page and standalone document; wrapping was corrected in both layouts. The final print review includes long names and 500-character outcome/proposal/confirmation notes.

Diagnostics are recorded in `artifacts/logs/unit.log`, `integration.log`, `browser.log`. Browser screenshots and synthetic print PDFs are under `artifacts/day-12-*`; they contain labelled synthetic fixture data and are verification artifacts, not receipts for real donations. Test artifacts remain ignored by Git. Existing CI automatically discovers the new suites; hosted CI was not run.

## Runtime and next stage

Original databases, uploaded files, `.env` and unrelated `Readme1.md` were preserved. The reviewed application/development database remain stopped. No migration, real email, remote push, PR or deployment. Durable lifecycle notifications remain Day 13. Manual Contact escalation is not a response guarantee. Concurrent account-moderation ordering remains the existing application limitation.
