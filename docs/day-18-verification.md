# Day 18 mobile, accessibility and visual consistency

Date: October 12, 2026. Branch: `codex/day-18-accessible-consistency`.
Commit: the commit containing this document, `fix(ui): improve mobile actions and accessible workflow consistency`.

## Implemented changes

A shared `ui-consistency.css` layer supplies green/neutral color tokens, readable secondary text, control borders, modest rectangular controls, focus outlines, minimum control heights, wrapping and mobile recovery rules. Existing component styles retain their layout responsibilities. Remaining Manrope declarations now have sans-serif fallbacks. About process numbers have sufficient text contrast. Native inputs, radios, checkboxes and pointer behavior remain; no decorative gradient, continuous animation, pill control, emoji decoration, generated photography or invented social proof was introduced.

The donor menu exposes Create listing when the header action is hidden at narrow widths. Sign out remains visible for every authenticated role, including narrow administrator headers. Menus close correctly on Escape and viewport changes. Without JavaScript, mobile navigation links remain visible in a normal-flow header instead of being inaccessible behind an inert menu button. Shared links/control targets and pickup checkbox labels have useful minimum heights.

Confirmation dialogs have accessible names/descriptions and initially focus Cancel. Escape/Cancel restores the activating control. Dialog return values reset before each use, and confirmation preserves the original submitter without leaving a permanent bypass flag. Native form validation keeps server error summaries and generates a separate client summary. Error links focus and scroll to their fields below the fixed header. Label extraction avoids reading select option lists as the field name.

Authentication pages now retain a primary heading when their story panel is hidden on mobile. Story headings are subordinate, and brand links rely on their visible name. Equipment detail headings use the correct hierarchy in NGO detail pages and donor disclosures. All full-page templates load the shared consistency layer, except self-contained receipt documents, which retain their own print CSS.

Interactive generic errors, CSRF failures and rate-limit responses use an escaped, styled page with landmarks and recovery links. HTTP status codes and Retry-After behavior remain intact. JSON-preferring clients retain the existing plain response body. Interactive error responses are private and non-cacheable. Existing authorization, ownership and lifecycle accounting remain unchanged.

New receipt HTML gives print-help text a banner landmark. Stored receipt revisions are not rewritten. Newly issued synthetic receipts printed to A4, with the help banner omitted in print. The two-page samples were rendered with bundled Poppler and inspected for readable text, page transitions and absence of clipping. Receipt content remains a participant-confirmed transfer record, with no new tax or medical-fitness claims.

## Automated and manual evidence

- `npm test`: 88 unit/template/model tests passed; 143 JavaScript files syntax checked. New tests cover interactive error status/cache preservation, unchanged API bodies and escaping.
- `npm run test:integration`: all 123 real database/HTTP checks passed. Existing concurrency, rollback, ownership, CSRF, receipt, notification and privacy boundaries remain covered.
- `npm run test:browser`: all 38 desktop/mobile tests passed, including existing public and donation lifecycle regressions plus four accessibility audit/keyboard checks.
- Final focused audit: all four accessibility checks passed after final control-border, font and no-JavaScript refinements. A subsequent two-check keyboard pass verifies final dialog reset/submitter behavior. Repeated checks are not added to full-suite totals.
- Rendered matrix: 44 page-state observations at each of 1366 x 900, 768 x 1024 and 320 x 740, totaling 132. Coverage includes all 28 full-page EJS templates and rendered partials: public/auth pages, populated/empty/legacy donor workspaces, listing forms and errors, request and discrepancy states, completed pickups, receipts, NGO onboarding/verification states, discovery/detail/no results, administration/review/accounts, notifications, access denial, workflow conflicts and not-found recovery. Donor disclosures are opened during the audit.
- Axe-core 4.14.0, pinned as a development-only dependency, runs WCAG 2 A/AA, WCAG 2.1 A/AA and best-practice tags. The final matrix reports zero detected violations and zero incomplete checks. It also reports zero horizontal overflow, computed gradient backgrounds, active CSS animations or failed measured border contrasts among visible enabled opaque form controls with borders.
- Keyboard checks cover menu open/Escape, mobile Create listing, validation-summary focus and field recovery, cancellation focus, confirmation of a synthetic withdrawal, reduced motion, forced colors and mobile navigation without JavaScript. Browser A4 printing checks preserve acknowledged quantity and avoid horizontal overflow.
- Representative phone/tablet/desktop screenshots and rendered A4 pages visually inspected. Source searches supplement rendered inspection for forbidden decoration, authored punctuation and custom cursor behavior. `git diff --check` passed; styles, templates, scripts, middleware and test fixtures reviewed.

The border check supplements axe by measuring computed border/background contrast of eligible visible controls; it does not claim pixel-perfect measurement of every native control or transparent composite. Manual keyboard/visual checks supplement automation. No claim of complete WCAG certification or assistive-technology compatibility is made.

Artifacts are generated under ignored `artifacts/day-18`: audit JSON per project, representative page PNGs, synthetic A4 PDFs and Poppler-rendered print pages. Suite logs remain under `artifacts/logs`; the full browser report describes the full suite. Focused runs use the list reporter. Test instrumentation bypasses CSP only in the audit's synthetic browser context so axe can inspect self-contained receipt pages; application response policies are not weakened.

Initial findings included faint About labels, brand accessible-name mismatch, missing mobile primary headings and equipment heading order. These were fixed and the matrix repeated. The first audit's administrator sign-in helper used incorrect form labels; it was stopped and corrected. New fixtures use independent synthetic client addresses so repeated role sign-ins do not accidentally exhaust authentication limits. No check was disabled to obtain a passing result.

The HTTPS-cookie unit fixture hit its existing 15-second startup timeout during a concurrent verification run. The unchanged fixture passed when the full unit suite was rerun alone; its timeout was not relaxed.

## Scope and remaining checks

Version remains `0.6.0-alpha.2`. Day 16 remains planned, so Phase 4 is not complete. NGO workspace/discovery redesign is not silently included in this stage. Account recovery and other operational readiness work retain their later roadmap stages.

Tests use Chromium with synthetic identities and local disposable MongoDB replicas. Real devices, screen readers, other browser engines, hosted CI, production deployment and real mailbox delivery remain unverified. Participant research, promotional-asset permissions and previously recorded dependency findings remain pending. This work does not certify equipment or participant statements.

Original `.env`, uploads, database on 27017, reviewed development runtime and unrelated `Readme1.md` were preserved. Only owned disposable test infrastructure ran; mail was disabled or mocked. No remote push, PR or deployment occurred. Ports 4000 and 27018 remain stopped; the harness shuts down its server/database after verification.
