# Day 15 donor workspace

Date: October 12, 2026. Branch: `codex/day-15-donor-workspace`.
Commit: the commit containing this document, `feat(donor): organize the workspace around pending actions`.

## Implemented behavior

The donor dashboard now identifies requests needing a decision, pickup commitments, steps waiting on an NGO and exceptions needing review. Each request belongs to one next-step group. Counts describe actual requests across the signed-in donor's listings, not equipment units or claimed impact. Group links select the corresponding workspace filter.

Pending decisions link to an individual request using `/donor/requests?request=...`. Server-side ownership remains required even when a request ID is supplied. Accepted collection tasks link to the existing pickup/handover page. Tasks distinguish an NGO proposal awaiting donor confirmation from a donor proposal awaiting NGO agreement, future confirmed collections from started windows, and unacknowledged handovers from receipt discrepancies. Disputed receipts, proposed corrections, missed/disputed pickups and counterparty release proposals retain explicit review/waiting states. Recorded windows show their time zone without exposing pickup addresses or instructions on the dashboard.

Each listing separates total offered, currently requestable, reserved but not handed over, handed-over and NGO-acknowledged units. Acknowledgements are derived from reconciled recorded requests, never inferred from a donor declaration or a completed status alone. Closed listings show zero requestable units. Partial request completion can leave an active listing with remaining stock. Older inconsistent evidence displays `Needs review` instead of an invented acknowledged total.

Listings show per-request progress with up to four recent recorded events for up to five recent requests. Times are labelled UTC. Requests retain cancellation, handover, resolution and completion events. A cancellation without an explicit event timestamp is described as the cancelled record's last update. Eligible completed handovers link to their receipt page; zero acknowledged transfers do not advertise a receipt.

Status/work filters and equipment filters combine and survive pagination. Responses contain at most 12 listing cards and eight task cards, with separate pages for each. Page/query inputs are normalized and pages clamp to existing results. Empty results offer recovery. Older embedded donations remain read-only and excluded from current counts, with a support link instead of donor-facing database migration instructions. Listing creation confirms the saved listing and directs the donor to requests without exposing mail configuration.

Dashboard reads use the existing snapshot transaction helper so quantities and request progress reflect one database snapshot during concurrent changes. Read-only visits do not mutate lifecycle records. Existing quantity changes, withdrawal confirmation, request decisions, collection and receipt actions retain their server-side protections. The page includes a focusable skip target, labelled filters, native keyboard-operable progress disclosures, modest rectangular controls and responsive cards.

## Verification

- `npm test`: 82 unit/template tests passed; 135 JavaScript files syntax checked. New unit coverage exercises participant responsibility, outstanding vs acknowledged quantities, legacy evidence, combined filters, separate pagination, query normalization and recorded timeline limits.
- `npm run test:integration`: 115 database/HTTP checks passed on disposable MongoDB 8.2.5 replica sets. Workspace checks cover owner-scoped individual requests, private-data omission, acceptance, pickup confirmation, partial handover, counterparty acknowledgement/release, legacy and empty states, and refresh racing acceptance. Existing rollback, concurrency and privacy regressions passed.
- `npm run test:browser`: all 28 desktop/mobile checks passed, including six new donor-workspace checks and existing public, request, pickup, cancellation, handover, receipt and notification flows.
- Focused final checks passed all six desktop/mobile workspace checks and eight database/HTTP checks after projection/copy refinements. The workflow explicitly exercises a reported receipt discrepancy, donor resolution proposal and NGO confirmation, then agreed release of the remaining reservation. These repeat existing suite checks and are not added to the full-suite totals.
- `git diff --check` passed. Changed queries, state derivation, templates, CSS, tests and documentation reviewed. Synthetic desktop/mobile workspace, waiting and history screenshots inspected. Browser checks verify overflow, keyboard skip/disclosure navigation, filter recovery, pagination, direct review links and first-listing feedback.

Suite logs are in ignored `artifacts/logs`. Workspace screenshots are in `artifacts/day-15-{workspace,workspace-top,waiting,history}-{desktop,mobile}.png`. Focused reruns use the list reporter so the full browser report continues to describe the full suite. Screenshot capture resets scroll/focus to avoid placing a fixed header in the middle of a full-page capture.

Initial tests caught incomplete synthetic NGO evidence and a pickup proposal in the past. Fixtures were corrected; subsequent suites passed. The HTTP test proposes and confirms a valid future window, then explicitly makes that disposable fixture's window elapsed to exercise handover without waiting for real time. Synthetic browser dates are chronological. No production or reviewed development data was used as a test target; no real email was sent.

## Scope and limits

Version remains `0.6.0-alpha.2`. Days 16 through 18 remain planned. This stage adds no new equipment fields, NGO workspace redesign, deployment or remote push. The existing replica-set requirement applies to workspace snapshot reads.

Response pagination bounds rendered cards; computing truthful global counts still reads the donor's owned listing/request history. This is not a measured large-inventory performance claim. Representative-data query measurement remains Day 27. The dashboard is a snapshot and must be refreshed after subsequent changes; existing mutation pages still check current state and versions. Legacy history is not migrated or certified by displaying it.

Hosted CI, production, real mailbox delivery, participant research and full accessibility review remain unverified. Keyboard/viewport checks and screenshots are focused evidence, not a complete accessibility audit.

Original `.env`, uploads, database on 27017, stopped reviewed development runtime and unrelated `Readme1.md` are preserved. Only disposable test infrastructure ran, with email disabled or mocked. No push, PR or deployment is included.
