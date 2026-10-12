# Day 14 public homepage and honest content

Date: October 12, 2026. Branch: `codex/day-14-public-experience`.
Commit: the commit containing this document, `feat(frontend): introduce a clear public CareCycle experience`.

## Implemented behavior

Guests can open `/`, `/home`, `/about` and `/contact` without an account. Optional authentication resolves active signed-in participants for role-specific navigation and workspace actions. Missing, invalid, expired or suspended-account credentials render public pages as a guest and cannot unlock protected routes. Personalized responses retain `Cache-Control: private, no-store` and `Vary: Cookie`.

Guest navigation offers Home, About, Contact, donor registration, NGO registration and participant sign-in. It omits private inbox, workspace and logout controls. Registration entry links preselect only the supported donor/NGO roles; registration authorization still comes from existing server-side validation. Public page skip links now have focusable main-content targets. Login and registration provide a return link to the public explanation.

Home and About describe the implemented workflow: organization evidence review, equipment listing, quantity requests, donor decisions, mutually confirmed pickup, donor handover, NGO acknowledgement, discrepancies and private receipts. References to implemented features as planned have been removed. Verification does not certify equipment condition or medical fitness. Receipts are transfer records, not tax certificates. The hero preserves a clearly labelled information guide without fabricated stock, statistics, endorsements or uncertain promotional photos.

Guests can submit Contact with existing CSRF, input validation and action rate limiting. Invalid entries return 400. Absent mail configuration or provider failure returns 503, keeps bounded escaped values for recovery and avoids claiming delivery. Provider success clears entries and confirms sending without guaranteeing reply time. Contact does not create a support-ticket record. No real email was sent during checks.

Public typography has explicit sans-serif fallbacks when external fonts are unavailable. The homepage footer brand and About section label remain readable against dark surfaces. Green/neutral colors, rectangular actions and static layouts are retained.

## Verification

- `npm test`: 77 unit/template tests passed; 130 JavaScript files syntax checked. The new contact test uses a mocked transporter to exercise provider success and failure without network delivery.
- `npm run test:integration`: 107 checks passed against disposable MongoDB 8.2.5 replica sets. New HTTP coverage checks guest pages, all signed-in roles, expired/invalid/suspended credentials, cache policy, protected discovery/dashboard/media/document/receipt/inbox access, contact CSRF, validation, escaping, disabled delivery and rate-limit recovery.
- `npm run test:browser`: 22 desktop/mobile tests passed, including existing matching, pickup, cancellation, handover, receipt and notification regressions.
- Final focused public-page browser pass: 4 desktop/mobile checks passed after typography/contrast changes. Includes guest role selection, keyboard skip navigation/menu, contact failure recovery, overflow checks, no computed gradients/animations and screenshots of Home, About, Login and Registration.
- `git diff --check` passed. Changed routes, authentication, templates, styles and tests reviewed. Public screenshots inspected for readability, layout and truthful labels.

Screenshots are generated in ignored `artifacts/day-14-{home,about,contact,login,register}-{desktop,mobile}.png`. Suite logs are in `artifacts/logs`. These use guest or synthetic test identities. The full-browser report corresponds to the full suite; the focused rerun used the list reporter.

Initial sandboxed verification could not run local MongoDB/HTTP fixtures (EACCES/EPERM). Successful suites ran with permission for local child processes and localhost connections. No runtime database or `.env` was used as a test target.

## Scope and limits

Days 15 through 18 remain planned. No new listing fields, workspace redesign, deployment, remote push or PR is included. Version remains `0.6.0-alpha.2`. Hosted CI, production, real mailbox delivery, research and promotional-asset permissions remain unverified. General accessibility review remains Day 18; focused keyboard, viewport and visual checks do not constitute a complete accessibility audit.

Original `.env`, uploads, database on port 27017, reviewed development runtime and unrelated `Readme1.md` are preserved. The reviewed development application/database were not started. Disposable test infrastructure is stopped by its harness.
