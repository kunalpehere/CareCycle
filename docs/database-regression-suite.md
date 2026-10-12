# Database workflow regression suite

Date: October 12, 2026. Day 8 completes the local Phase 2 matching regression gate.

## Running the checks

Use Node 22.x and npm 10.x as documented in the README. Run `npm test`, `npm run test:integration` and `npm run test:browser` from the repository root. The integration runner discovers every `tests/integration/*.test.js` file, injects an isolated environment and preserves its unsuccessful exit status when any assertion fails. Diagnostics are in `artifacts/logs/integration.log`.

The default integration harness downloads the pinned MongoDB 8.0.16 test binary with checksum validation and starts owned disposable instances. For the explicitly verified local Windows alternative, set `CARECYCLE_TEST_MONGOD` to the absolute installed MongoDB 8.x executable before running the suite. The helper checks its reported version. This override selects a binary, never an external database or production URI.

The workflow in `.github/workflows/verify.yml` runs this same integration command and uploads diagnostics even on failure. Its job is now named “Isolated database workflow regressions” to reflect the actual scope. No hosted GitHub Actions run was performed during this stage; the configured Linux job and default downloaded-binary path remain external verification.

## Coverage map

| Boundary | Database/HTTP evidence |
|---|---|
| Persistence/topology | `database-smoke.test.js`: isolated replica persistence/abort and rejection of a standalone when replica readiness is required |
| Quantity backfill | `quantity-backfill.test.js`: default dry run, maintenance refusal, invalid/orphan refusal, aborted writes and idempotent repeat |
| Matching/accounting | `transactional-matching.test.js`: partial/full allocation, persisted quantities, competing/repeated acceptance, pending cancellation, stale edits, write abort, creation versus exhaustion, discovery/form limits and matched contacts |
| Retry/index/listing policies | `request-policies.test.js`: dry-run/resumable index migration, actual startup refusal/readiness, preserved attempts, duplicate current requests, quantity/withdrawal resolution and races, rollback and invalid legacy duplicates |
| HTTP authentication and roles | `workflow-boundaries.test.js`: guests, malformed/expired tokens, foreign donors, wrong participant roles, pending/rejected/missing verification, and existing credentials after suspension |
| Tenant and contact privacy | The HTTP suite checks organization/donor history scope despite query tampering, guessed cancellation IDs, pending/rejected/cancelled contact suppression, and authorized accepted/completed contact visibility |
| File privacy | The HTTP suite writes synthetic evidence/images only into its owned runtime, reads bytes through real routes, verifies owner/admin/verified-NGO permissions, denies guessed public paths and rejects unauthorized conditional reads with a known ETag |
| Forged input and CSRF | Real form/session tokens pass through the HTTP stack; wrong CSRF cannot mutate data, and body fields cannot replace the authenticated organization, requester or request state |
| HTTP concurrency and recovery | Simultaneous duplicate submissions create one request; accept-versus-cancel gives one decision; replay preserves metadata; deliberate insertion/sibling-resolution failures roll back all touched records and then recover on retry |

The completed-request fixtures exercise legacy read/privacy behavior only. They do not implement pickup, physical handover or NGO acknowledgement. Existing rate limits, CSRF, authorization and verification middleware remain active in the HTTP suite. Access tokens are generated from isolated test secrets; no real accounts or contact details are used. Invalid/missing authorization assertions check the actual response and persisted data, not just query shapes.

## Isolation and cleanup

- `scripts/run-tests.js` supplies a test-prefixed random database name, independent synthetic secrets, disabled mail and an unreachable initial URI; it does not inherit the developer's database or credentials.
- The new HTTP fixture refuses startup outside the isolated test environment. It accepts no URI/path argument and replaces the initial URI only with the newly owned replica-set URI.
- Each integration file runs in its own test process. The HTTP fixture creates one `artifacts/runtime/workflow-*` directory, copies repository views/static assets there, changes its working directory before importing upload services, and resolves every runtime upload path inside that directory.
- Real user upload directories and application records are excluded. The fixture stops only the instance it created; it never issues cleanup against an externally supplied database.
- Teardown closes the HTTP server and Mongoose connection, stops its owned instance, restores the working directory, verifies the canonical runtime path is inside the workspace and has the owned parent/prefix, then removes that directory. The test asserts runtime removal and connection closure.
- Synthetic client addresses behind an explicitly trusted loopback test proxy isolate scenarios while retaining the real rate limiter. This setting is local to the fixture; no application `.env` or production proxy setting changes.

MongoDB collection validators deliberately reject selected writes. Tests restore those temporary validators in `finally` blocks. Expected HTTP 500 error logs in the integration diagnostic identify those injected failures; successful recovery and complete raw-record rollback are asserted afterward.

## Defect found and corrected

Protected verification/image routes previously emitted `Cache-Control: public, max-age=0`, and matched-contact HTML lacked an explicit cache policy. Authentication now sets `Cache-Control: private, no-store` and `Vary: Cookie` before checking credentials. Authorized file responses retain those headers; denied or conditional requests still pass through authorization. Public static assets remain outside this authenticated middleware.

The first test run also exposed a fixture assertion that treated an unrelated organization's legitimately owned synthetic request as leaked history. The fixture was corrected to keep ownership expectations unambiguous; the permission assertions were retained. No application access rules were weakened to make tests pass.

## Limits

Passing tests demonstrate these boundaries under the owned local replica-set/HTTP conditions. They do not prove all possible race schedules, physical equipment safety, production TLS/proxy/storage behavior, email delivery or hosted CI. Concurrent administrative revocation/suspension resolution remains later moderation work; tests here verify already-suspended actors and current verification gates. Existing dependency findings remain open.

Before restarting against existing application records, use the Day 4 replica-set setup and Day 7 request-index migration procedure. This stage performs neither migration nor a dry run against that dataset. Pickup work starts in Day 9.
