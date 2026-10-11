# Day 1 baseline and acceptance evidence

Date: October 11, 2026. Application version: `0.6.0-alpha.2`.
Status: implemented and locally verified for the Day 1 documentation scope.
Branch: `codex/day-1-foundation`.
Commit: the commit containing this record, titled `docs: define CareCycle product scope and architecture`.

## Delivered scope

- [Product foundation](product-foundation.md): problem, users, enforced permissions, portfolio journey, assumptions, release boundaries and non-goals.
- [Architecture](architecture.md): runtime diagram, route inventory, data references, current lifecycle, privacy boundaries and proposed work.
- README links to those documents and this baseline record.
- [Roadmap](development-roadmap.md#day-1---scope-architecture-and-baseline) records Day 1 completion; later stages remain planned.

No application logic, database records, migrations, runtime configuration, or interface assets were changed. Existing README roadmap-link work was preserved and incorporated as related documentation. The pre-existing untracked `Readme1.md` was not modified or included in the Day 1 commit.

## Checks and results

| Check | Evidence and result |
|---|---|
| Local toolchain observation | Node `v22.14.0`, npm `10.9.2`. These are observed versions, not a newly established supported-version policy. |
| `npm test` | Exit code 0; `npm run check` syntax-checked 50 JavaScript files, then Node's test runner passed 33 tests with 0 failures, cancellations, skips, or TODOs. |
| Source-to-document review | All eight route files, six model files, app/server setup, authentication/ownership/verification middleware, relevant controllers and matching/mail/upload services reviewed. Permission and diagram claims are bounded to these implementations. |
| Documentation links and content | Repository-relative Markdown file links checked for existence. New documents checked for authored em dashes, machine-specific paths and obvious credential assignments. No runtime secrets, uploads or real beneficiary records were read or included. |
| Diff review | Day 1 documentation and README/roadmap changes reviewed for scope, whitespace and implemented/proposed distinctions before committing. |

Existing tests exercise validators, role/realm helpers, middleware using test doubles, model/index contracts, a capacity-query shape, and EJS rendering using fixtures. They do not prove atomic MongoDB behavior, full HTTP/browser workflows, private storage deployment, or email-provider delivery. EJS rendering tests are not visual browser inspection.

No new tests were added for this documentation-only stage. No fresh clean-checkout installation, real-database integration run, browser inspection, staging verification or deployment was performed. Day 1 introduces no changed application screens; UI cleanup and rendered desktop/mobile checks remain Day 2 work. Reproducible CI and isolated test commands remain Day 3 work.

## Current limitations and next stages

| Limitation evidenced in source | Follow-up |
|---|---|
| Partial acceptance changes the listing to `matched`; discovery only queries `available`, hiding remaining units. Request creation validates total quantity rather than remaining quantity. | Days 5 to 6: quantity contracts and atomic acceptance/discovery fixes. |
| Reservation and acceptance are separate writes. Rollback decrements allocation without restoring status; process failure can leave inconsistent state. | Days 6 and 8: transactions and real isolated replica-set failure/race tests. |
| Unique donation/organization index prevents a new request after cancellation or rejection. Editing/withdrawal does not resolve pending requests. | Day 7: explicit retry/withdrawal policy and index migration. |
| Pickup/completion enum values exist without complete pickup, handover or acknowledgement routes. | Days 9 to 12: collection, cancellation, two-party receipt and traceable records. |
| Optional mail is immediate and has no durable retries. New-listing mail includes donor email for configured recipients. | Day 13: durable lifecycle notifications and explicit recipient/privacy review. |
| Home/about/contact require authentication; existing mobile navigation and decorative content need cleanup. Promotional asset permissions remain unestablished. | Days 2 and 14 to 18: audited cleanup, public pages, mobile/accessibility checks. |
| Sessions/rate limits are in memory and private uploads are local files. | Days 21 to 22: persistent/shared infrastructure and durable private storage. |
| Admin mutations and audit creation are separate writes. Admin access applications are listed but lack a review-decision endpoint. | Day 20: accountable administrative behavior and exception handling. |
| Email verification timestamp exists without verification or password-reset workflows. | Day 19: account recovery and verified email. |

Real user research, external privacy/security/safety review, provider selection, recovery drills, staging/browser verification, and performance measurements remain pending at their roadmap gates. No operational impact or production readiness is claimed.

## Day 1 acceptance conclusion

The product problem, primary roles, existing architecture and limitations are documented. The release outcome and four required non-goals are explicit. README links make the foundation accessible. Diagrams and permissions reflect actual routes/models, and planned features are labelled. Day 1 can be closed after the documentation review and commit; Day 2 may begin immediately when requested without waiting for a calendar day.
