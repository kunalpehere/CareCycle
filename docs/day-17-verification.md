# Day 17 equipment-specific listing experience

Date: October 12, 2026. Branch: `codex/day-17-equipment-details`.
Commit: the commit containing this document, `feat(listings): add practical equipment details and guided validation`.

## Scope and implemented behavior

The project owner explicitly requested Day 17 after reviewing its scope. Day 16 has not been implemented and remains planned. This stage retains Node.js, Express, MongoDB/Mongoose and EJS; version remains `0.6.0-alpha.2`.

Create/edit listings now include optional brand/model, reported functional condition, known defects and missing accessories. Operation can be reported working, partly working, not working, or not checked/unknown. Blank defect/accessory text means not provided, not an assertion that nothing is missing. Appearance labels explain wear separately from operation. Copy states that these are participant declarations, not medical inspection or fitness certification.

Selected provisional category specifications:

| Category | Optional details |
|---|---|
| Wheelchair | Seat width in centimetres (1 to 100, at most one decimal place), folding frame |
| Walker | Height adjustment, folding frame |
| Cane | Height adjustment |
| Stethoscope | Chestpiece description, reported tubing condition |

The width range is an input bound, not a clinical recommendation. Selection fields allow unknown/not checked or not provided. New fields are optional and do not require donors to perform inspections or supply unavailable measurements. Choices follow Day 2 provisional assumptions, not completed participant research. No asset permissions or interview findings have been invented.

An optional `details` subdocument stores validated fields. Old listings have no inferred detail values and display `Not provided`; no database backfill ran. Details appear in the donor listing disclosure and authorized NGO listing detail view. Receipt content, accounting and existing request snapshots remain unchanged. New details describe the current listing; they are not added retrospectively to historical snapshots.

JavaScript shows the selected specification section, disables others, clears specifications on category changes and prompts the donor to review common fields. Category-prefixed input names avoid collisions when JavaScript is disabled. Without JavaScript, sections remain visible and server validation still saves only the selected category. Inapplicable specifications are discarded. Model validation and transactional edit guards reject mismatched stored specifications. Existing pending/accepted commitment locks, quantity rules, ownership, CSRF and version checks remain in place.

Server errors render an accessible linked summary and messages beside the affected fields, with `aria-invalid` and descriptions. Safe scalar draft text is escaped and kept after errors, bounded to 1,000 characters per field. Oversized entries may be shortened, as stated on the form. Persisted images and version values come from the owned record, not submitted data. Removal selections remain selected after errors but take effect only after a successful save. Browser security prevents restoring newly selected files after a response; the form explains that files must be selected again.

Image previews retain the existing implementation and clarify that a preview is not a saved upload. The three-file/5 MB-per-file limits and signature checks remain. Multipart field count increases from 20 to a bounded 40 for the expanded form, with a 20 KB individual-field cap. Upload/type/size/signature failures render the listing form instead of discarding text. CSRF is still checked before controller processing; a missing or invalid token is not treated as an upload-recovery submission. Rejected files are never saved.

## Verification

- `npm test`: 86 unit/model/template tests passed; 140 JavaScript files syntax checked. New coverage exercises applicable specifications, category changes, malformed scalar/category inputs, optional old records, model invariants, escaped drafts and honest detail displays.
- `npm run test:integration`: all 123 checks passed against disposable MongoDB 8.2.5 replica sets. New scenarios cover real creation/edit persistence, no writes on invalid input, ownership, CSRF, stale versions, old records, multipart signature/type/size/count rejection, retained image removal choices, successful removal and pending-request edit locks. Existing lifecycle, rollback, concurrency and privacy suites passed.
- `npm run test:browser`: all 34 desktop/mobile checks passed. New checks cover reported details, image previews/removal, category switching, NGO detail rendering, focused server summaries, retained text, invalid file formats and JavaScript-disabled submissions. Existing donor/public/matching/pickup/handover/receipt/notification flows remain covered.
- Final focused listing browser checks passed all six desktop/mobile checks after detail-row readability and category-change guidance refinements. These are repeated checks, not additional full-suite tests.
- `git diff --check` passed; queries, schemas, validation, upload middleware, templates, scripts, CSS and tests reviewed. Synthetic desktop/mobile form, error and detail screenshots inspected for layout/readability and truthful labels.

Suite logs are in ignored `artifacts/logs`. Screenshots are `artifacts/day-17-{form,errors,detail}-{desktop,mobile}.png`. The full browser report corresponds to the full suite; focused reruns use the list reporter.

Initial browser tests needed narrower selectors because the UI now has two distinct disclosures/definition lists. The new role-switch test now signs out before signing in as an NGO. Multipart fixtures were corrected to put CSRF before files, matching the actual form, and use separate synthetic client addresses for independent upload scenarios. After these corrections, the full suites passed. These test-fixture changes do not weaken application protections.

## Remaining limits and preserved state

Day 16 and Day 18 remain planned. This stage is not a full accessibility audit, clinical assessment, measured performance review or production release. Participant research, hosted CI, production deployment and real mailbox delivery remain unverified. Existing image signature checks are preserved; image normalization/durable storage remains later roadmap work.

Original `.env`, uploads, original database on 27017, stopped reviewed development runtime and unrelated `Readme1.md` are preserved. Tests used isolated temporary databases/storage and disabled or mocked mail. No remote push, PR or deployment occurred. The reviewed development application and database were not started.
