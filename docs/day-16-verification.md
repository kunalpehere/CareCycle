# Day 16: NGO workspace and discovery

Date: October 12, 2026. Version remains `0.6.0-alpha.2`.
Branch: `codex/day-16-ngo-workspace`.
Commit: the commit containing this record, `feat(ngo): improve equipment discovery and request tracking`.

## Delivered behavior

The NGO dashboard keeps organization submission, pending review and rejection remediation explicit. Verified NGOs see their active request and collection steps before profile information. The dashboard shows up to 12 pending/accepted records, prioritizing accepted commitments and then oldest requests, with the actual matching record count and a link to all history. Empty verified workspaces link to discovery.

NGO next steps distinguish donor decisions, proposals awaiting the counterparty, confirmed collections, missed pickups, handover acknowledgement, discrepancy correction and remaining-unit release. Older unreconciled handovers direct participants to support instead of implying receipt evidence. Collection links use the existing participant-authorized lifecycle pages. Dashboard summaries omit donor contacts and collection addresses/instructions.

Request history is organization-scoped, sorted deterministically, and bounded to 12 records per page. Status filters and pagination preserve each other; excessive page numbers clamp to the last page. Empty filtered results offer filter recovery. Previous rejected/cancelled attempts remain separate records. Recent recorded lifecycle events and distinct remaining, transferred, acknowledged and released quantities help explain progress. Donor contact exchange retains the existing accepted/completed boundary; pending, rejected and cancelled records do not expose it.

Equipment discovery retains equipment, condition, collection-area and page context when opening a detail page and returning. Only normalized local query fields are carried; arbitrary return URLs are not accepted. Filtered pagination and last-page recovery use current matching counts. No-results pages link directly to all available equipment. Remaining availability continues to use the established quantity contract. Discovery and NGO workspace copy clarify that organization verification checks identity and does not constitute medical inspection of equipment. Request-form guidance discourages identifying beneficiary details.

Shared controls retain the Day 18 focus, contrast, responsive and reduced-motion behavior. The request-status filter has an explicit label/control association. No schema migration, lifecycle mutation, new deployment dependency or operational infrastructure change is required.

## Verification

- `npm test`: 90 unit/model/template checks passed and 147 JavaScript files syntax checked.
- `npm run test:integration`: all 128 database/HTTP checks passed, using disposable MongoDB 8.2.5 replicas.
- `npm run test:browser`: all 42 desktop/mobile checks passed in the final complete run. The four new NGO scenarios also passed in a focused run; repeated checks are not added to totals.
- The unchanged accessibility matrix exercised 132 page-state/viewport observations across desktop, tablet and phone widths. It reported zero detected axe violations, horizontal overflow, decorative effects or tested control-border failures. The new NGO workspace and history are included.
- Representative desktop/tablet/mobile NGO workspace screenshots were visually inspected. Keyboard rejection remediation and existing keyboard/focus/confirmation checks passed. Git whitespace and staged diff checks passed.

Generated evidence remains in ignored `artifacts/day-16-workspace-{desktop,mobile}.png`, `artifacts/day-18/audit-{desktop,mobile}.json`, the browser report and `artifacts/logs`.

The new integration fixture checks absent/pending/rejected onboarding, organization isolation including a second verified NGO, guessed collection IDs, pending contact privacy, accepted contact exchange, 12-record pages, status-filter preservation, clamped pages, no-results recovery, retained discovery context and partial-allocation availability. Unit checks cover counterparty-specific next actions, legacy completion evidence, all-released commitments and query normalization. Desktop/mobile browser checks exercise next-step navigation, request status recovery, discovery/detail return context and keyboard rejection remediation. Existing lifecycle and accessibility suites remain enabled.

The first sandboxed unit run could not connect to its localhost cookie fixture; the same full suite passed with normal local process access. The initial integration run exceeded a test startup timeout while downloading the default MongoDB binary. That owned runner was stopped and the suite rerun using the explicitly selected installed MongoDB 8.2.5 executable against disposable data. No timeout was relaxed. The first browser pass exposed an ambiguous implicit label on the new status filter; it was replaced by an explicit association and the final full browser suite restarted. Focused runs also exposed a discovery test depending on a listing withdrawn by the earlier keyboard test; it now uses another available fixture. The full return-navigation check found that listing-title and View listing links initially omitted context while image links retained it. All three entry links were corrected, and integration coverage now checks every rendered detail link. Focused NGO browser checks then passed in both projects. No check was disabled.

## Boundaries and remaining external checks

Counts describe requests/listings, not beneficiaries reached or independently proven impact. The dashboard is a bounded entry point, not a complete task queue; all older records remain accessible through paginated history. Counts and lists are separate read queries, so concurrent changes can require a refresh. Existing transactional mutation and availability enforcement remain authoritative when a participant acts.

Browser checks use Chromium, synthetic accounts and disposable databases. Hosted CI, production, other engines, real devices/screen readers, participant research and real email delivery remain unverified. Previously recorded dependency and promotional asset findings remain pending. This stage does not certify equipment condition or medical fitness.

The original `.env`, uploads, database on 27017, reviewed development runtime and unrelated `Readme1.md` are preserved. Test mail is disabled/mocked. No push, PR or deployment is performed. The reviewed application on 4000 and development database on 27018 remain stopped.

Day 16 closes the remaining Phase 4 implementation stage. Days 1 through 18 are now implemented and locally verified; Phase 5 starts with Day 19. External verification limits above remain open.
