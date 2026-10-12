# CareCycle daily development roadmap

Planning baseline: October 11, 2026. Current application version: `0.6.0-alpha.2`.

## How to use this roadmap

Each development day has one coherent outcome, acceptance checks, and a suggested commit. These are ordered development stages, not a promise to finish in 28 calendar days. Continue a stage until its checks pass; split larger stages into related commits when useful.

All days below are **planned**, unless their status is explicitly updated with implementation and verification evidence. Creating this roadmap alone does not complete a stage or implement any application feature.

For each day:

1. Inspect `git status`, preserve unrelated work, and review the day's scope and dependencies.
2. Implement on a focused feature branch; keep the existing Express, MongoDB, and EJS stack.
3. Run the relevant automated checks and inspect affected browser flows.
4. Review `git diff`, including migrations, error states, and privacy boundaries.
5. Stage related files and commit with an accurate message after checks pass.
6. Push or open a pull request when requested. Record external checks that remain outstanding.

Do not backdate commits, invent user feedback, manufacture test counts, or describe planned functionality as implemented. AI assistance can support the work; engineering ownership comes from understanding decisions and verifying results.

## Required design and content rules

User requirements recorded October 11, 2026. Apply these rules to every UI change, including authentication, administration, public pages, receipts, and demo content.

- No purple gradients. Use the existing green/neutral identity with restrained solid surfaces; remove decorative gradient/glow treatments from the current redesign scope.
- No pill-shaped buttons. Use rectangular controls with consistent modest corner radii. Replace the existing decorative pill badges and category chips with plain labels or modestly rounded rectangular labels for visual consistency.
- No fake reviews, testimonials, user avatars, partner endorsements, or metrics. Operational counts must come from actual records and explain what is counted. Demo data must be visibly labelled as synthetic.
- No vague hero or marketing copy. State the service, audience, and available action in plain language. Describe implemented behavior accurately.
- No emoji icons. Prefer text labels; use a consistent SVG icon set only where icons help users, with accessible labels. Replace decorative heart/symbol clusters and ad hoc Unicode icon substitutes.
- No em dashes in authored interface text, notifications, receipt templates, or this roadmap. Use normal sentence punctuation. Do not rewrite user-entered content solely to enforce a copy rule.
- No exaggerated scroll animations, parallax, continuous floating decorations, page-entry theatrics, or navigation delays added for animation. Preserve normal browser navigation and scrolling. Brief focus/state feedback is acceptable when it serves an interaction and respects reduced motion.
- No custom cursor, pointer trails, cursor-following decorations, or animated cursor effects. Standard native pointer/focus affordances stay usable.
- No generated filler photos or generic AI-style artwork. Prefer relevant, verifiably sourced equipment photography, permitted participant uploads, or plain text/layout. If a promotional asset's origin or permission cannot be established, replace it or omit it. Visual appearance alone does not prove AI origin.
- Remove any user-facing "Made with AI" badge if introduced. None was found in the current source audit. Keep required third-party credits/licences and accurate engineering documentation.
- Avoid inflated visual claims: a promotional photo must not impersonate an available listing, a verified NGO badge must not imply equipment inspection, and synthetic handovers must not become real impact claims.

Quality expectations: inspect the actual rendered result, verify affected behavior, and review the diff before marking a stage complete. A requirement to avoid mistakes is handled through explicit checks and correction of defects, not a promise that untested work is error-free.

## UI audit and required cleanup

Source audit performed October 11, 2026. These findings describe code and previously inspected screenshots, not a fresh live-browser verification. Cleanup is **planned**, not already applied to the website.

| Requirement | Current evidence | Roadmap action |
|---|---|---|
| Clear copy | `views/home.ejs` uses "Pass care forward", "From unused to invaluable", and "next useful chapter"; login, registration, about, and donor-request pages also need a plain-language pass | Day 2 defines replacements; Days 14–17 apply specific copy to each journey |
| No invented social proof | Home contains decorative `CC`, plus, and heart avatar circles, but no actual testimonial content was found | Remove the avatar cluster in Day 2; replace it only with a factual process/privacy explanation |
| No misleading listing imagery | Home labels a static wheelchair photo with "Available" and "Equipment in good condition" | Remove the unverified availability/condition presentation in Day 2; Day 14 supplies an honest product explanation |
| No pill controls | Main buttons use roughly 8–11px corners; `999px` radii appear on status, verification, condition, and category labels in home, donor, discovery, organization, requests, and role-dashboard CSS | Keep controls rectangular; standardize the pill labels in Day 2 and verify throughout Day 18 |
| Restrained color | Active home/auth/shared/contact styles contain green or neutral gradients; legacy `public/contact.css` contains purple colors, but current templates do not reference it | Replace decorative gradient treatments; confirm references before retiring legacy purple styles in Day 2 |
| Restrained motion | `public/home.css` continuously floats hero cards; `public/transitions.js` fades pages and intercepts links with a delay | Remove decorative looping motion and animation-only navigation interception in Day 2; preserve accessibility behavior |
| No emoji/ad hoc decoration | Home uses a heart, circular-arrow, plus, search, and check glyphs as decoration; other templates use Unicode symbols | Audit role and meaning; remove decorative clusters and use text or accessible consistent SVGs where needed |
| Normal punctuation | `views/donor-dashboard.ejs` contains an em dash in legacy history | Replace the authored separator during Day 2; check rendered text again in Day 18 |
| No AI badge or cursor effects | No "Made with AI" tag or custom cursor animation was found in scanned `views`, `public`, and `src` | Preserve absence through review and release checks; normal CSS `cursor: pointer` is not an animated cursor |
| Honest metrics | Admin metrics use `countDocuments` in `src/controllers/adminController.js`; no hard-coded promotional metric claims were found | Retain useful real counts; label synthetic demo context and do not equate records with proven real-world impact |
| Verified image sources | Home/about/auth reference `wheelchair.jpg`, `walker.jpg`, and `medical-equipment.png`; asset provenance is not established by the source scan | Record source, permission/licence, and intended use; replace or omit uncertain promotional assets in Day 2 |

Completion gate for the cleanup: check all loaded stylesheets and templates, inspect affected desktop/mobile screens, and confirm no forbidden feature remains in the rendered UI. A search hit alone cannot distinguish a badge from a button, a native cursor from an effect, or a test fixture from a real claim.

## Starting point

Already implemented:

- Donor, NGO, and administrator roles, separate sign-in portals, and server-side authorization.
- Donor listings with location, quantity, images, editing, and withdrawal.
- NGO profiles, private verification evidence, administrator review, and resubmission.
- Verified-NGO discovery, filters, requests, donor decisions, and controlled contact exchange.
- Conditional quantity reservation, account moderation, and administrative audit records.
- Shared navigation, responsive styles, and accessibility helpers.
- Node test runner coverage for validation, roles, middleware, model contracts, and EJS rendering.

The earlier review ran 33 passing tests and syntax checks for 50 JavaScript files. Re-run checks for the implementation baseline; these numbers are historical evidence, not future targets. Database concurrency and complete browser workflows need separate verification.

Known gaps that drive this roadmap:

- Acceptance marks a whole listing `matched`; discovery only shows `available` listings, hiding remaining units after partial allocation.
- Reservation and acceptance use separate writes. Compensating rollback does not restore listing status and cannot guarantee recovery from a process failure.
- A unique donation/organization index blocks another request after cancellation or rejection; retry policy needs an explicit decision.
- Pickup and completion names exist in schemas, but there is no complete pickup/handover workflow.
- Home, about, and contact require login; mobile navigation hides logout without a menu replacement.
- Sessions and rate limits are stored in process memory; uploaded files use local disk.
- Notification support is limited to donation/contact email, rather than the complete request lifecycle.

## Delivery milestones

| Milestone | Stages | Evidence required |
|---|---|---|
| Trustworthy foundation | Days 1–4 | Scope, research notes, repeatable checks, safe configuration |
| Reliable matching | Days 5–8 | Partial allocation, race handling, retry policy, real database tests |
| Complete donation cycle | Days 9–13 | Pickup, cancellation, handover, receipt, durable notifications |
| Distinctive product experience | Days 14–18 | Public explanation, useful dashboards, equipment details, browser checks |
| Operational readiness | Days 19–24 | Recovery, moderation, durable infrastructure, monitoring, restore drill |
| Portfolio release | Days 25–28 | Deployed demo, end-to-end checks, measurements, honest case study |

These milestones refine the README's release intentions. Assign release versions when scope is delivered; do not automatically equate Day 28 with a production `1.0` release.

## Phase 1: product foundation and reproducible quality

### Day 1 - Scope, architecture, and baseline

Status: implemented and locally verified for documentation scope.
Date: October 11, 2026.
Commit: the commit containing this update, `docs: define CareCycle product scope and architecture`, on `codex/day-1-foundation`.
Checks and results: `npm test` passed 33 tests and syntax checks for 50 JavaScript files; routes/models, documentation links and the documentation diff reviewed.
Evidence: [product foundation](product-foundation.md), [architecture](architecture.md), and [baseline verification record](day-1-baseline.md), linked from the README.
Known limitations and external checks: no application feature changes; real-database races, live-browser flows, staging, mail delivery and operational infrastructure remain unverified. Later stages remain planned.

Outcome:

- Document the donor-to-NGO problem, primary users, role permissions, architecture, and current limitations.
- Define the portfolio release: one reliable equipment journey from listing through acknowledged handover.
- Record non-goals: government portal, payments, full hospital inventory, and multi-member organizations for this release.
- Link foundation and architecture documents from the README.

Acceptance checks:

- Diagrams and permission tables match current routes and models.
- Implemented behavior is separated from proposed behavior.
- Documents contain no credentials, real beneficiary records, or machine-specific setup requirements.

Suggested commit: `docs: define CareCycle product scope and architecture`

### Day 2 - Design cleanup and user needs

Status: implemented and locally verified; participant research and image-permission evidence pending.
Date: October 12, 2026 (work began October 11).
Commits: `fix(ui): remove decorative and misleading interface elements` and `docs(product): record user needs and design decisions`, on `codex/day-2-design-cleanup`.
Checks and results: 33 tests and syntax checks for 50 JavaScript files passed; final template rendering checks passed. Forty desktop/mobile template observations found no horizontal overflow, computed gradients, or active CSS animations. Navigation, keyboard menus, focus/error recovery, image/document previews and confirmation cancellation checked with synthetic fixtures.
Evidence: [research and provisional decisions](user-needs-and-design.md), [screen sketches](day-2-screen-sketches.md), [asset inventory](promotional-assets.md), and [verification record](day-2-verification.md).
Known limitations and external checks: no donor/NGO interviews or asset licence evidence available, as confirmed by the project owner. Uncertain promotional images are omitted. Real authenticated database workflows, staging, delivery and a complete accessibility review remain later checks.

Outcome:

- Prepare short donor and NGO interview questions about equipment details, collection, trust, and receipt evidence.
- Seek feedback from a few potential users when available; record only feedback actually received.
- Document assumptions separately and choose a visual direction using specific equipment information and clear next actions.
- Apply the audited baseline cleanup: vague existing copy, avatar clusters, misleading hero availability, floating decorations, animation-only navigation delays, authored em dashes, and decorative gradient/pill treatments.
- Inventory promotional images with source/permission notes. Omit or replace uncertain assets without inventing their origin.
- Confirm stylesheet references before removing legacy styles; keep useful accessibility and native interaction behavior.

Acceptance checks:

- Every claimed research finding has a dated note; missing feedback remains an open assumption.
- Record how feedback affects scope, or document provisional decisions if participants are unavailable.
- Sketch donor, NGO, and handover screens without fictional impact statistics or testimonials.
- Run existing checks and inspect changed screens at desktop/mobile widths. Verify navigation, role-specific links, focus, and file previews still work.
- Review the cleanup against every required design/content rule and record unresolved asset provenance or browser checks explicitly.

Suggested commits: `fix(ui): remove decorative and misleading interface elements`, followed by `docs(product): record user needs and design decisions` when feedback notes are ready.

### Day 3 - Reproducible checks and CI

Status: implemented and locally verified; hosted CI execution pending.
Date: October 12, 2026.
Commit: the commit containing this update, `ci: add reproducible CareCycle verification`, on `codex/day-3-reproducible-checks`.
Checks and results: clean-checkout `npm ci` and `npm test` passed; 34 unit tests and syntax checks for 66 JavaScript files. One isolated database smoke and four desktop/mobile browser checks passed. Deliberate unit/browser failures returned exit 1 and useful diagnostics; temporary probes removed. Workflow YAML and diff reviewed.
Evidence: [reproducible testing instructions](testing.md) and [Day 3 verification record](day-3-verification.md).
Known limitations and external checks: no hosted GitHub run; local MongoDB smoke used an explicitly selected installed 8.2.5 executable. CI's default binary download/Linux path and uploads remain unverified. Current dependency audit findings are recorded; full lifecycle/race/browser coverage remains later work.

Outcome:

- Define the supported Node environment and clean-checkout installation instructions.
- Add CI for the existing source check and tests, plus linting if introduced.
- Prepare isolated integration/browser test commands and useful failure artifacts; expand their scenarios in later stages.
- Keep tests and development-only code out of normal production startup.

Acceptance checks:

- `npm ci` and `npm test` pass in a clean checkout with documented test configuration.
- CI needs no developer `.env` or production database.
- A deliberately failing test fails the pipeline and exposes a useful diagnostic.
- Document new commands only after they exist; there is no frontend build or typecheck requirement in the current stack.

Suggested commit: `ci: add reproducible CareCycle verification`

### Day 4 - Runtime configuration

Status: implemented and locally verified; external production/deployment checks pending.
Date: October 12, 2026.
Commit: the commit containing this update, `feat(config): validate runtime and database requirements`, on `codex/day-4-runtime-config`.
Checks and results: 49 tests and syntax checks for 73 JavaScript files passed; 15 final focused config checks, two real database/topology checks and four browser checks passed. Secret-free CLI/connection errors, exact proxy cookie behavior, fresh-directory refusal, replica initialization/repeat/restart and actual runtime connection verified. Owned servers stopped.
Evidence: [runtime configuration and replica-set instructions](runtime-configuration.md) and [Day 4 verification](day-4-verification.md).
Known limitations and external checks: existing `.env`/database names preserved; new unsafe settings fail early. Real production TLS/proxy/mail, managed database, hosted CI/Linux and later lifecycle/security gates remain unverified. Existing dependency audit findings remain recorded.

Outcome:

- Validate environment names, port, URLs, independent secrets, and production invariants.
- Align `.env.example` database naming with the documented CareCycle configuration without silently renaming existing databases.
- Define the MongoDB replica-set requirement for the transactional matching work in Day 6.

Acceptance checks:

- Missing or unsafe production settings fail with useful messages that expose no secrets.
- Development, test, and production configuration paths are covered by focused tests.
- Local replica-set setup and isolated test database instructions are reproducible.

Suggested commit: `feat(config): validate runtime and database requirements`

## Phase 2: matching correctness

### Day 5 - Quantity and lifecycle contracts

Status: implemented and locally verified for contracts and migration preparation.
Date: October 12, 2026.
Commit: the commit containing this update, `refactor(donations): define quantity and lifecycle invariants`, on `codex/day-5-quantity-contracts`.
Checks and results: 55 tests and syntax checks for 79 JavaScript files passed; three isolated database checks and four desktop/mobile browser smoke checks passed. Migration CLI dry-run, maintenance refusal, blocked-record/orphan refusal, failed-write rollback and repeat apply verified with synthetic records.
Evidence: [quantity/lifecycle contracts and migration procedure](quantity-and-lifecycle-contracts.md) and [Day 5 verification](day-5-verification.md).
Known limitations and external checks: existing application database was not migrated. Contract helpers are not yet integrated into matching/discovery/edit/withdrawal routes. Atomic acceptance/discovery remain Day 6; retry/index/withdrawal enforcement remain Day 7. Pickup and handover routes remain later work. Hosted CI and deployment remain unverified.

Outcome:

- Separate remaining availability from request fulfillment; define total, reserved, handed-over, and released quantity semantics.
- Specify permitted transitions and actors for listing, request, and pickup records.
- Define edit/withdraw rules when pending or accepted requests exist and preserve readable history.

Acceptance checks:

- Five units with two reserved expose three requestable units.
- Quantity accounting prevents negative availability and double-counting completed handovers.
- Existing records have a documented, repeatable migration/backfill plan with a dry-run report.

Suggested commit: `refactor(donations): define quantity and lifecycle invariants`

### Day 6 - Transactional acceptance and remaining availability

Status: implemented and locally verified.
Date: October 12, 2026.
Commit: the commit containing this update, `fix(matching): make acceptance atomic and retain remaining availability`, on `codex/day-6-transactional-matching`.
Checks and results: 55 unit/model/template tests, syntax checks for 83 JavaScript files, 14 isolated database tests and six desktop/mobile browser tests passed. Concurrent/repeated acceptance, cancellation races, stale edits, deliberate transaction abort, remaining-stock requests and authenticated privacy checks verified.
Evidence: [Day 6 implementation, setup and verification](day-6-verification.md).
Known limitations and external checks: existing application database and `.env` were preserved; replica-set configuration/backfill of that dataset remains an operator step. Retry/index migration and pending-request reconciliation remain Day 7; pickup/handover remain later work. Hosted CI, deployment and production infrastructure remain unverified.

Outcome:

- Apply quantity reservation and request acceptance atomically using the supported MongoDB replica-set topology.
- Make repeat decisions safe and update discovery, detail pages, and request limits to use remaining availability.
- Preserve existing privacy and ownership boundaries.

Acceptance checks:

- Concurrent acceptance cannot exceed listing quantity or accept the same request twice.
- Partial allocation remains discoverable; exhausted listings cannot receive new requests.
- A failure between writes leaves neither an orphan reservation nor a misleading listing state.
- Verify with a real isolated replica set, not only query-shape assertions.

Suggested commit: `fix(matching): make acceptance atomic and retain remaining availability`

### Day 7 - Request retry, withdrawal, and stale actions

Status: implemented and locally verified.
Date: October 12, 2026.
Commit: the commit containing this update, `fix(requests): support explicit retry and withdrawal policies`, on `codex/day-7-request-policies`.
Checks and results: 59 unit/model/template tests, syntax checks for 93 JavaScript files, 24 isolated database tests and eight desktop/mobile browser checks passed. Retry/history, duplicates, migration dry-run/resume/refusal, quantity/withdrawal resolution, stale forms and concurrent acceptance boundaries verified.
Evidence: [request/listing policies and migration procedure](day-7-request-policies.md) and [Day 7 verification](day-7-verification.md).
Known limitations and external checks: existing application database/indexes and `.env` were preserved. Replica-set and request-index preparation must be completed before restarting against existing data. Day 8 expands regression coverage; pickup/handover remain later stages. Hosted CI and deployment remain unverified.

Outcome:

- Implement the chosen re-request policy after cancellation/rejection, preserving previous decisions and limiting active duplicates.
- Migrate the existing unique index safely if the model changes.
- Resolve pending requests when a listing is withdrawn or its available quantity changes.

Acceptance checks:

- Duplicate active requests fail clearly; permitted resubmission retains history.
- Withdrawal cannot silently invalidate accepted commitments.
- Stale forms return a recoverable explanation and current availability.
- Index migration is verified against representative legacy data and has a recovery procedure.

Suggested commit: `fix(requests): support explicit retry and withdrawal policies`

### Day 8 - Database workflow regression suite

Status: implemented and locally verified.
Date: October 12, 2026.
Commit: the commit containing this update, `test(matching): cover database races and privacy boundaries`, on `codex/day-8-database-regressions`.
Checks and results: 59 unit/model/template tests, syntax checks for 95 JavaScript files, 39 isolated database tests and eight desktop/mobile browser checks passed. Fourteen new HTTP/database scenarios cover authorization, verification/suspension, contact/file privacy, conditional access, CSRF/forged identity, concurrent decisions, replay and deliberate write-failure recovery. Owned runtime cleanup verified.
Evidence: [database coverage/isolation guide](database-regression-suite.md) and [Day 8 verification](day-8-verification.md).
Known limitations and external checks: hosted CI and production infrastructure remain unverified; existing application records, indexes and `.env` were preserved. Replica-set and Day 7 index preparation are required before restarting against existing data. Concurrent administrative-state resolution and pickup/handover remain later work.

Outcome:

- Add integration tests for matching, ownership, verification, contact privacy, withdrawal, and concurrent decisions.
- Add deliberate failure cases and repeatable database fixtures without real user data.

Acceptance checks:

- Tests cover partial/full allocation, accept-versus-cancel, duplicate acceptance, and aborted transactions.
- Unverified or suspended users cannot perform protected operations.
- The suite cleans up only its isolated test database and runs in CI.

Suggested commit: `test(matching): cover database races and privacy boundaries`

## Phase 3: complete donation cycle

### Day 9 - Pickup arrangement

Status: implemented and locally verified.
Date: October 12, 2026.
Commit: the commit containing this update, `feat(pickup): add confirmed collection arrangements`, on `codex/day-9-pickup-arrangements`.
Checks and results: 64 unit/model/template tests, syntax checks for 101 JavaScript files, 50 isolated database tests and 10 desktop/mobile browser checks passed. Pickup coverage includes counterparty confirmation, rescheduling snapshots, named time zones and clock changes, private access, separate NGO plans, duplicate/concurrent writes and stale-form recovery.
Evidence: [Day 9 implementation and verification](day-9-verification.md).
Known limitations and external checks: hosted CI and production remain unverified. Day 10 cancellation/missed pickups and Days 11–13 handover, acknowledgement, receipts and durable notifications remain planned. Existing application databases, uploads and `.env` were preserved.

Outcome:

- Attach pickup arrangements to each accepted request, including proposed window, confirmation, time zone, and private coordination details.
- Identify who proposes and who confirms; add rescheduling and an activity timeline.

Acceptance checks:

- Only the matched donor and organization can read or change arrangements.
- Two NGOs receiving units from one listing can have independent pickup plans.
- Invalid/past windows and conflicting repeated updates are handled clearly.

Suggested commit: `feat(pickup): add confirmed collection arrangements`

### Day 10 - Cancellation and missed pickup

Status: implemented and locally verified.
Date: October 12, 2026.
Commit: the commit containing this update, `feat(pickup): handle cancellations and missed collections`, on `codex/day-10-cancellation-missed-pickups`.
Checks and results: 65 unit/model/template tests, 104 JavaScript syntax checks, 63 isolated database tests and 12 desktop/mobile browser checks passed. New checks cover exactly-once release, exhausted-listing rediscovery, deliberate transaction failure/retry, cancellation/rescheduling/sibling-acceptance races, a test-only handover race, missed-window validation, disagreement recovery, authorization and private history.
Evidence: [Day 10 policies and verification](day-10-verification.md).
Known limitations and external checks: actual handover/acknowledgement remain Day 11. Cancellation conservatively blocks any listing with aggregate handover evidence until per-request fulfillment reconciliation exists. Conflicting missed reports use participant withdrawal and manual Contact escalation; no automatic adjudication or notification is claimed. Hosted CI and production remain unverified. Existing application data, uploads and `.env` were preserved.

Outcome:

- Add cancellation after acceptance, missed-pickup reporting, and explicit rescheduling rules.
- Release reservations exactly once when a commitment is cancelled before handover.
- Retain reasons and events; define escalation for conflicting claims.

Acceptance checks:

- Repeated cancellation does not release quantity twice.
- Cancellation racing with handover cannot produce contradictory quantity accounting.
- Cancelled units become discoverable again and participants see the current next action.

Suggested commit: `feat(pickup): handle cancellations and missed collections`

### Day 11 - Handover and NGO acknowledgement

Status: implemented and locally verified.
Date: October 12, 2026.
Commit: the commit containing this update, `feat(handover): add two-party receipt acknowledgement`, on `codex/day-11-handover-acknowledgement`.
Checks and results: 69 unit/model/template tests, syntax checks for 110 JavaScript files, 80 isolated database tests and 14 desktop/mobile browser checks passed. Coverage includes full/partial transfers, multi-NGO completion, receipt/cancellation races, two-party corrections, remainder-release agreement/withdrawal, failed-write rollback/retry, legacy reconciliation and privacy.
Evidence: [Day 11 implementation, policies and verification](day-11-verification.md).
Known limitations and external checks: printable receipts/outcomes remain Day 12 and durable notifications Day 13. Physical receipt and condition are participant declarations, not independent inspections. Ambiguous legacy handover evidence requires review rather than inferred acknowledgement. Contact escalation is manual. Hosted CI and production remain unverified; original application data, uploads and `.env` were preserved.

Outcome:

- Record donor handover with actual quantity and an equipment checklist.
- Require NGO receipt acknowledgement before declaring a match complete.
- Define partial handover, discrepancy, remaining commitment, and resolution rules.

Acceptance checks:

- One party cannot declare mutual completion alone.
- Actual quantity cannot exceed the accepted commitment.
- Duplicate submissions and acknowledgement/cancellation races preserve accounting.
- Disputed or partial transfers have an explicit next action and complete history.

Suggested commit: `feat(handover): add two-party receipt acknowledgement`

### Day 12 - Donation receipt and outcome record

Status: implemented and locally verified.
Date: October 12, 2026.
Commit: the commit containing this update, `feat(receipts): add traceable donation handover records`, on `codex/day-12-receipts-outcomes`.
Checks and results: 73 unit/model/template tests, syntax checks for 117 JavaScript files, 93 isolated database tests and 16 desktop/mobile browser checks passed. Archived HTML downloads are byte-identical; generated synthetic desktop/mobile PDFs each contain two A4 pages, all rendered and visually inspected. Receipt scope, access, revision races/failure recovery, outcome updates and agreed name corrections verified.
Evidence: [Day 12 receipt policies and verification](day-12-verification.md).
Known limitations and external checks: downloads are self-contained HTML with browser Print/Save as PDF, not direct server-generated PDFs. Quantities/dates cannot be amended through receipt forms; name corrections need counterparty confirmation. Outcome privacy relies on participant declarations, not automatic PII detection. Durable notifications remain Day 13. Hosted CI/production remain unverified; original application data, uploads and `.env` were preserved.

Outcome:

- Generate a printable/downloadable receipt from confirmed handover data with a stable reference.
- Include equipment, actual quantity, participating organization, confirmation dates, and correction history.
- Add an optional aggregate use/outcome note, avoiding identifying beneficiary details.

Acceptance checks:

- Only authorized participants or permitted administrators can access receipts.
- Repeated downloads reproduce the recorded receipt; corrections create a traceable revision.
- Receipt totals match acknowledged quantities and print legibly.
- The receipt makes no unsupported tax, certification, or medical-fitness claims.

Suggested commit: `feat(receipts): add traceable donation handover records`

### Day 13 - Durable lifecycle notifications

Status: implemented and verified locally on October 12, 2026. See [Day 13 evidence](day-13-verification.md). Private participant/admin inboxes, atomic lifecycle events, idempotent processing and optional email with bounded retries are implemented. Real mailbox/provider delivery, hosted CI and production remain unverified. Provider duplicates are possible after a send succeeds but the worker loses its acknowledgement. Existing application data, uploads and `.env` were preserved.

Outcome:

- Add in-app notifications for verification, requests, decisions, pickup changes, and acknowledgements.
- Add optional email delivery through a durable event/outbox mechanism with bounded retries.
- Keep database outcomes independent of email-provider availability and avoid exposing private data in email.

Acceptance checks:

- Events survive application restart; repeated processing does not create duplicate in-app notifications.
- Failed email can retry without reversing acceptance or handover; document provider-level duplicate limitations.
- Recipient selection follows role/ownership rules, including suspended accounts.
- Verify email against a test mailbox when available and record any external delivery checks still pending.

Suggested commit: `feat(notifications): add durable donation lifecycle updates`

## Phase 4: specific and usable frontend

### Day 14 - Public homepage and honest content

Status: implemented and locally verified on October 12, 2026. See [Day 14 evidence](day-14-verification.md). Home, About and Contact are accessible before login, with guest-safe navigation, role-specific registration entry points and explanations of the implemented pickup, handover and receipt workflow. Protected records remain authenticated. Contact delivery is optional; real mailbox delivery, hosted CI and production remain unverified.
Commit: the commit containing this update, `feat(frontend): introduce a clear public CareCycle experience`, on `codex/day-14-public-experience`.

Outcome:

- Make the product explanation accessible before login, with clear donor and NGO entry points.
- Explain verification, approval, pickup, and handover using the implemented workflow.
- Replace decorative listing-like hero content with a labelled example or appropriate equipment illustration/photo.
- Apply the required content rules to public, login, registration, and about pages. Use sourced real photography or an informative text/layout preview, without generated filler artwork.
- Revise about/contact routes and templates for guest access without weakening protected routes.

Acceptance checks:

- Visitors understand the service without registering; protected listings/documents remain private.
- Guest and signed-in navigation render safely without assuming `currentUser` exists.
- Copy contains no fabricated availability, user counts, testimonials, or impact claims.
- Hero text names medical-equipment donation and verified NGOs, with direct action labels. No avatar social proof, AI badge, emoji icons, purple gradients, pill buttons, or decorative animation appears.

Suggested commit: `feat(frontend): introduce a clear public CareCycle experience`

### Day 15 - Donor workspace

Status: implemented and locally verified on October 12, 2026. See [Day 15 evidence](day-15-verification.md). The donor workspace groups pending decisions, pickup commitments, NGO waits and review items; shows distinct listing quantities and per-request progress; and supports equipment/status filters with separate listing/task pages. Owner-scoped snapshot reads preserve consistency during concurrent decisions. Hosted CI and production remain unverified.
Commit: the commit containing this update, `feat(donor): organize the workspace around pending actions`, on `codex/day-15-donor-workspace`.

Outcome:

- Surface requests awaiting decisions, pickup commitments, and handovers awaiting acknowledgement.
- Show total/remaining quantities, useful filters, and concise status timelines.
- Replace internal configuration messages with actionable user feedback.

Acceptance checks:

- A donor can identify and perform the next task from the dashboard.
- Empty, partial-allocation, cancelled, and completed states agree with backend rules.
- Workflows remain usable on narrow screens and with keyboard navigation.

Suggested commit: `feat(donor): organize the workspace around pending actions`

### Day 16 - NGO workspace and discovery

Outcome:

- Show onboarding tasks before verification and requests/pickups after verification.
- Improve filters, remaining-quantity display, request history, and discovery/detail navigation.
- Explain verification status precisely without implying that equipment has been medically inspected.

Acceptance checks:

- Pending/rejected NGOs see clear remediation; verified NGOs see operational next actions.
- Filters survive pagination and useful navigation; no-results states provide recovery options.
- Donor contact and collection details remain hidden until the appropriate stage.

Suggested commit: `feat(ngo): improve equipment discovery and request tracking`

### Day 17 - Equipment-specific listing UX

Status: implemented and locally verified on October 12, 2026, at the project owner's request before Day 16. See [Day 17 evidence](day-17-verification.md). Optional reported equipment details, category-specific specifications, field-level validation, escaped draft recovery and clearer image handling are implemented. Older listings remain readable without backfill. Field choices remain provisional because participant research is pending. Day 16 remains planned.
Commit: the commit containing this update, `feat(listings): add practical equipment details and guided validation`, on `codex/day-17-equipment-details`.

Outcome:

- Add selected fields supported by Day 2 findings: brand/model, functional condition, defects, missing accessories, and category-specific specifications.
- Use understandable condition labels and guidance rather than relying on a generic description box.
- Preserve existing file previews; improve their clarity and add field-level server errors and draft-value preservation.

Acceptance checks:

- Category changes validate applicable fields without submitting stale irrelevant data.
- Existing listings remain readable; absent new fields display honestly.
- Validation failures preserve safe entered values and explain the affected field.
- Required data stays proportionate to the listing task; no unsupported fitness guarantees are introduced.

Suggested commit: `feat(listings): add practical equipment details and guided validation`

### Day 18 - Mobile, accessibility, and visual consistency

Outcome:

- Restore visible mobile logout and ensure every important action has a mobile route.
- Consolidate shared colors, type, buttons, spacing, and statuses while reducing decoration that competes with tasks.
- Verify the Day 2 cleanup across every participant and administration template, including error, empty, legacy-history, and receipt states.
- Verify focus behavior, labels, errors, contrast, reduced motion, image sizing, and printable receipts.

Acceptance checks:

- Exercise donor, NGO, and admin flows at phone/tablet/desktop widths without horizontal overflow.
- Keyboard-only users can open/close menus, submit forms, recover from errors, and confirm destructive actions.
- Run automated accessibility checks and manual checks; save representative screenshots with synthetic identities.
- Inspect actual button/badge shapes, authored punctuation, image sources, native cursor behavior, and motion. Static searches supplement browser inspection; they do not replace it.

Suggested commit: `fix(ui): improve mobile actions and accessible workflow consistency`

## Phase 5: operational readiness

### Day 19 - Account recovery and verified email

Outcome:

- Add email verification and expiring, single-use password reset flows.
- Define which actions require a verified address and how password changes invalidate existing authentication.
- Add bounded request rates and neutral recovery responses.

Acceptance checks:

- Expired, replayed, and wrong-account tokens fail; stored tokens do not expose usable reset credentials.
- Reset responses do not reveal account existence.
- Old authentication cannot continue after successful password reset.
- Failed email delivery has a documented retry/support path.

Suggested commit: `feat(auth): add verified email and secure account recovery`

### Day 20 - Administrative review and moderation

Outcome:

- Make verification queues, decision evidence, discrepancies, and suspended-account effects clear.
- Add listing/report review only to the extent required for the demo/pilot scope.
- Ensure important administrative mutations and audit records are consistent, with reasons and actor identity.

Acceptance checks:

- Administrators cannot bypass workflow accounting with an untracked status edit.
- Repeated decisions are safe and failed audit writes do not create unexplained mutations.
- Suspension restricts protected actions and flags existing commitments for resolution.
- Private documents remain limited to their authorized viewers.

Suggested commit: `feat(admin): improve accountable review and exception handling`

### Day 21 - Persistent sessions, rate limits, and browser security

Outcome:

- Replace process-memory sessions and rate limiting with appropriate shared persistent stores for the intended deployment.
- Configure exact trusted proxy behavior, secure cookies, session expiry, and browser security headers including a tested CSP.
- Preserve CSRF protection for forms and uploads.

Acceptance checks:

- Restart and, if supported, multiple instances preserve valid sessions and enforce limits consistently.
- HTTPS/proxy configuration does not permit spoofed client IPs or disable secure cookie behavior.
- Fonts, scripts, images, uploads, and forms work under the policy without overly broad exceptions.

Suggested commit: `security: persist sessions and harden deployment boundaries`

### Day 22 - Durable private uploads

Outcome:

- Introduce a storage abstraction backed by durable private storage suited to deployment.
- Preserve authorization, file limits, and signature checks; define image normalization/metadata handling.
- Provide a manifest-driven migration from local uploads and an orphan-file cleanup policy.

Acceptance checks:

- Private documents and donation images are inaccessible through guessed public storage URLs.
- Files survive restart/redeployment; rejected uploads leave no unexpected artifacts.
- Migration verifies file counts and integrity before changing references; original files remain recoverable.
- Access after match acceptance follows the intended history/privacy rules.

Suggested commit: `feat(storage): add durable private media persistence`

### Day 23 - Health, logs, and support diagnostics

Outcome:

- Add correlation IDs, structured error logging, dependency readiness, and notification-worker health.
- Distinguish client input conflicts from infrastructure failures and provide useful browser recovery paths.
- Define minimal operational metrics without logging contact details, credentials, or beneficiary text.

Acceptance checks:

- A deliberate failure can be traced from response to logs using its reference.
- Readiness reflects unavailable database/storage dependencies without revealing internals publicly.
- Email failure is observable while successful core workflows remain usable.

Suggested commit: `feat(observability): add health checks and correlated failures`

### Day 24 - Backup, privacy, and restore drill

Outcome:

- Document coordinated backup/restore for database records and stored files.
- Define retention, deletion/anonymization, verification-document access, and synthetic-demo data rules.
- Run a recovery drill against isolated infrastructure; record measured recovery time and expected data-loss window.

Acceptance checks:

- Restored users, requests, allocations, receipts, audit records, and private file references are consistent.
- Backups include file manifests/integrity checks and have restricted access.
- Restoring cannot accidentally deliver old notifications to real users.
- Document operational ownership and unresolved external privacy/safety review before any real-organization pilot.

Suggested commit: `docs(operations): verify backup recovery and data handling`

## Phase 6: deployed portfolio release

### Day 25 - Staging deployment and isolated demo

Outcome:

- Deploy the Express application and notification worker with the tested database topology and durable storage.
- Configure secrets, HTTPS, startup/shutdown behavior, health checks, and rollback.
- Provide labelled synthetic donor/NGO demo data with restricted actions, quotas, and a controlled reset process.
- Keep public demo users out of unrestricted administrative accounts and real email delivery.

Acceptance checks:

- A fresh visitor can understand the service and exercise the advertised demo journey.
- Restart/redeploy preserves records/files and worker processing; no development secret is deployed.
- Demo reset is bounded to demo data; deployment rollback has a compatible database strategy.

Suggested commit: `chore(deploy): prepare a reliable isolated CareCycle demo`

### Day 26 - End-to-end release gate

Outcome:

- Automate browser coverage of registration, verification, listing, requesting, matching, pickup, handover, and receipt.
- Exercise rejection/resubmission, cancellation, partial quantity, privacy, and mobile recovery.
- Record which checks ran locally and which passed against staging.

Acceptance checks:

- The complete donor/NGO/admin journey passes against synthetic staging data.
- Private contact/documents cannot be accessed by unrelated accounts or guests.
- Reloads, double submissions, expired sessions, and worker failures have tested outcomes.
- No known release-blocking allocation, authorization, or data-loss defect remains.
- Run the design/content audit against deployed pages: no banned decorations, fabricated claims, unverified promotional assets, or animation-only navigation delays. Distinguish demo counts from real operational outcomes.

Suggested commit: `test(e2e): verify the complete donation lifecycle`

### Day 27 - Performance and user feedback

Outcome:

- Measure discovery, dashboards, and request operations using documented representative synthetic datasets.
- Inspect query plans and payloads; optimize only demonstrated bottlenecks.
- Revisit available user feedback and resolve the most consequential usability issues.

Acceptance checks:

- Record dataset size, environment, concurrency, and response-time distribution rather than unsupported scale claims.
- Verify bounded pagination, upload limits, and notifications under the intended demo workload.
- Any optimization preserves authorization/accounting and has a before/after measurement.
- Unavailable pilot feedback stays explicitly pending.

Suggested commit: `perf: measure and improve CareCycle operational workflows`

### Day 28 - Portfolio release and engineering case study

Outcome:

- Update README, screenshots, demo instructions, architecture, release notes, and known limitations.
- Record a short complete-workflow demo, including partial allocation and one recoverable failure.
- Write a case study covering the problem, user input, matching tradeoffs, handover design, tests, and measured results.
- Prepare truthful resume bullets and interview explanations; distinguish an isolated demo from a live operational service.

Acceptance checks:

- Every claim is supported by working behavior, test evidence, or a documented measurement.
- Screenshots/video contain synthetic data and no exposed credentials.
- Refresh screenshots and showcase media after cleanup so repository previews do not continue advertising the old visual treatments. Final copy and media pass the required design/content rules.
- Explain the original allocation defect, transactional fix, authorization decisions, and deployment limitations without relying on generated text.
- Publish a tagged portfolio release only after its checks pass; do not label it production-ready solely because the roadmap is finished.

Suggested commit: `release: prepare CareCycle portfolio demo and case study`

## Daily verification and Git workflow

Commands available at the planning baseline:

```powershell
git status --short
npm test
git diff
```

Add integration/browser checks as those scripts are implemented. A passing `npm test` alone does not prove MongoDB transactions, email delivery, deployed storage, or browser workflows.

For a focused implementation branch, use a descriptive name such as:

```powershell
git switch -c codex/matching-correctness
```

Stage explicit related paths, review `git diff --staged`, and commit only after the relevant checks pass. Do not include unrelated `Readme1.md` changes or private runtime data. Push/open a PR when requested; never use force-push or discard local changes merely to meet a daily target.

Record completed stages in this format:

```text
Status: implemented / locally verified / staging verified / blocked
Date:
Commit or PR:
Checks and results:
Known limitations and external checks:
```

## Later roadmap, after demonstrated need

- Multi-member NGO accounts with scoped organization permissions.
- Inventory assignment and maintenance history after receipt.
- Expense records and operational report exports.
- Additional equipment categories with validated data requirements.
- Geographic search once structured location data and usage justify it.
- Government/department oversight only with a defined stakeholder and access model.
- Payment, tax receipt, or automated recommendation features only after their product and operational requirements are established.

Keep these outside the initial portfolio release. CareCycle's distinguishing feature should be a reliable, traceable donation cycle supported by specific equipment information and real design decisions.
