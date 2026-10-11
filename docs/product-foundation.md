# CareCycle product foundation

Day 1 source-reviewed baseline: October 11, 2026, version `0.6.0-alpha.2`.

## Problem and audience

CareCycle connects individual donors offering medical equipment with NGOs seeking equipment for their work. Donors need to describe what they have, choose an organization, and coordinate collection. NGOs need usable equipment information, a way to explain their need, and a record of what was received. Administrators review organization evidence and moderate participant access.

These needs are product assumptions, not findings from interviews. Day 2 will prepare research questions and record only feedback actually received. CareCycle is currently a development prototype, not an operational service with demonstrated beneficiary outcomes.

## Portfolio release outcome

The release should demonstrate one reliable, traceable equipment journey using explicitly labelled synthetic data:

1. A donor creates an equipment listing with quantity, condition, location, and optional images.
2. An NGO submits its profile and private verification evidence; an administrator reviews it.
3. A verified NGO discovers equipment and submits a bounded request.
4. The donor accepts or rejects the request. Acceptance reserves quantity atomically and reveals participant contact details to the matched parties.
5. Both parties arrange collection for that accepted request, including any rescheduling or cancellation.
6. The donor records actual handover quantity and an equipment checklist.
7. The NGO acknowledges receipt or reports a discrepancy. Completion requires both parties' participation.
8. Authorized participants obtain a traceable receipt based on acknowledged quantities.

Steps 1 through 4 have existing interfaces, but acceptance still needs correctness fixes. Steps 5 through 8 are proposed behavior. Schema status names do not demonstrate working pickup, completion, or receipt features. See [architecture](architecture.md) for the current implementation and [baseline verification](day-1-baseline.md) for evidence and limits.

Release acceptance also requires tested partial allocation, duplicate submissions, cancellation, failure recovery, ownership, and contact/document privacy. The later roadmap defines integration, browser, staging, and operational gates. Finishing the roadmap alone does not establish production readiness or a `1.0` release.

## Primary users and permissions today

Permissions below describe active accounts and actual route/controller enforcement, rather than every permission string declared in a service. NGO verification refers to organization review, not inspection or medical fitness of equipment.

| Action | Guest | Donor | NGO account | Administrator |
|---|---|---|---|---|
| Participant registration and login | Yes, donor/NGO only | Existing accounts use participant login | Existing accounts use participant login | Separate admin login; no public admin registration |
| Home, about, contact page and contact submission | No | Yes | Yes, verification not required | Yes |
| Create listing; dashboard and listing JSON | No | Own listings | No | No donor-route access |
| Edit or withdraw listing | No | Own listing, only while `available` | No | No implemented listing moderation route |
| View donor-uploaded images | No | Own images | Verified NGO, for an `available` listing through discovery | No donor/discovery-route access |
| Create or update organization profile | No | No | Own profile; verified details locked | Review only through admin routes |
| Read verification document | No | No | Own organization's document | Any organization's document for review |
| Discover equipment and view details | No | No | Verified organization required | No |
| Submit and view NGO requests | No | No | Verified organization, own requests | No request-route access |
| Cancel request | No | No | Own pending request; verification required | No |
| Review and decide requests | No | Own listing's pending requests | No | No |
| See matched participant contact in request pages | No | For own accepted/completed requests | For own accepted/completed requests, verification required | No request-page access |
| Review organizations; approve/reject | No | No | No | Pending applications only for decisions |
| Suspend/reactivate participant accounts | No | No | No | Donor/NGO accounts only |
| View operational counts, recent audit and access requests | No | No | No | Admin dashboard |
| Pickup, handover acknowledgement and receipt | No implemented flow | Planned | Planned | Exception review planned |

Suspended/deleted accounts cannot use authenticated routes. Authentication also permits legacy records without a status field. Pending/rejected NGOs can manage their profile and see their dashboard but cannot discover equipment or use request routes. The current model gives one organization one owner, not multiple members. Route details and source references are in [architecture](architecture.md).

Contact privacy has an existing exception: donation email includes the donor's email address and is sent to configured mail recipients, not just matched NGOs. Organization applications and admin participant review also expose appropriate contact information to reviewers. No broader claim that all contact is hidden until matching should be made.

## Release boundaries

Included: donor listings, NGO onboarding/review, reliable quantity allocation, request history, pickup coordination, cancellation, two-party handover acknowledgement, receipts, lifecycle notifications, usable role workspaces, and infrastructure/testing necessary for an isolated portfolio demo.

Explicit non-goals for this release:

- Government or departmental portal.
- Payments, fundraising, tax receipts, or tax eligibility claims.
- Full hospital inventory, equipment maintenance, or post-receipt asset assignment.
- Multi-member organizations and member-level organization permissions.

Expenses, automatic recommendations, geographic search, and new categories remain later work unless demonstrated needs justify a separate scope decision. Existing categories are wheelchair, walker, cane, and stethoscope. Verification is not equipment certification; a receipt should document a transfer without claiming medical fitness or tax status.

## Product and content constraints

Keep the Express, MongoDB, and EJS stack. Apply the [roadmap's required design/content rules](development-roadmap.md#required-design-and-content-rules) to future changes: plain service/action copy, green/neutral surfaces, rectangular controls, restrained motion, accessible text or consistent SVG icons, and documented image permissions. Do not invent testimonials, metrics, research findings, or real-world impact. Synthetic records must be labelled. Avoid decorative gradients, pill treatments, emoji decoration, cursor effects, generated filler artwork, and authored em dashes.

Day 1 establishes these boundaries; the existing UI cleanup remains Day 2 work. Real-user feedback, medical-equipment safety procedures, privacy review, infrastructure validation, and external service checks remain outstanding before any real-organization pilot.
