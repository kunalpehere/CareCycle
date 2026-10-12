# Day 3 implementation and verification

Date: October 12, 2026. Status: implemented and locally verified; hosted GitHub Actions execution pending.
Branch: `codex/day-3-reproducible-checks`.
Commit: the commit containing this record, `ci: add reproducible CareCycle verification`.

## Delivered

- Supported Node 22.x (minimum 22.14.0) and npm 10.x ranges, `.nvmrc`, engine enforcement and lockfile installation instructions.
- [CI workflow](../.github/workflows/verify.yml) for source/unit checks on Windows/Ubuntu and separate Ubuntu database/browser jobs. Read-only repository permission, no application secrets, bounded jobs and retained diagnostics.
- Explicit suite selection and log capture, isolated test settings, a disposable replica-set helper, database smoke, actual Express browser smoke and a temporary-failure propagation check.
- Syntax checks now include public JavaScript, tests and browser configuration. The new environment regression verifies inherited production database/secrets/mail/Node options cannot become the harness configuration.
- [Testing documentation](testing.md) and README instructions. Normal startup/dev commands and application behavior were not changed. Development-only test packages are locked as exact versions.

## Local evidence

Local toolchain: Windows, Node `v22.14.0`, npm `10.9.2`, Playwright Test `1.64.0`, MongoDB memory-server core `11.3.0`. Integration/browser runs explicitly selected the installed MongoDB `8.2.5` executable to start new private test instances. They did not use its existing service or application database.

| Check | Actual result |
|---|---|
| Fresh source checkout | Exported staged tracked files through `git checkout-index` to ignored `artifacts/clean-checkout`; no `.env`, copied `node_modules`, or unrelated `Readme1.md`. The final harness regression was included in that checkout before final checks. |
| `npm ci` in fresh checkout | Exit 0; lockfile and supported local Node/npm accepted. No production secrets or database used. |
| Final `npm test` in fresh checkout | Exit 0; 34 unit/model-contract/EJS/harness tests passed, zero failures/skips; syntax checks passed for 66 JavaScript files. |
| `npm run test:integration` | Exit 0 in workspace and fresh checkout; one real replica-set persistence/transaction-abort smoke passed. |
| `npm run test:browser` | Exit 0; four smoke checks passed across desktop 1366 x 900 and mobile 390 x 844. Final version passed from fresh checkout with external browser requests blocked. |
| Failure propagation probe | Same unit runner exited 1 with the named deliberate assertion and saved TAP diagnostic. Wrapper correctly recognized expected failure and removed the temporary file. |
| Actual `npm test` failure | Injected a temporary top-level test only in the fresh checkout; the exact `npm test` command exited 1 and exposed `DAY3_EXPECTED_PIPELINE_DIAGNOSTIC`. Removed it; the normal command passed again. No permanent failing tests remain. |
| Browser failure artifacts | A temporary synthetic failing browser test in the fresh checkout exited 1 and produced a PNG screenshot, trace ZIP, HTML report and JUnit XML. Temporary spec removed. |
| Workflow and diff | Workflow YAML parsed locally and source-reviewed; staged whitespace/source/documentation links reviewed. Hosted semantics and artifact upload still need an actual GitHub run. |
| Shutdown | No listeners remained on 4000, 4173 or test port 4183; no owned browser-server/test-runner/database processes remained. Existing MongoDB service and unrelated processes were untouched. |

The increase from 33 to 34 unit tests is the harness-isolation regression. The syntax count includes more source locations and new tooling, not a claim of broader feature coverage. Database and browser smoke commands are separate from the unit count.

Logs/reports are generated under ignored `artifacts/`; the clean-checkout runs have their own nested `artifacts/`. The expected browser-failure report is diagnostic evidence, not an unresolved product defect. Temporary probes and all test servers were removed/stopped; reusable tooling remains in source.

## Limitations and outstanding checks

- The workflow was not pushed or run on GitHub. Hosted Ubuntu/Windows jobs, the default downloaded MongoDB 8.0.16 path, browser Linux dependencies and artifact uploads remain externally unverified. Do not describe local results as a passed hosted pipeline.
- The initial local default MongoDB download was interrupted because the Windows archive was approximately 756 MiB. Verification used the documented installed-binary option instead. Download unavailability is an infrastructure failure, not a skipped test.
- `npm audit` reported 11 current dependency-tree findings: 4 moderate, 6 high and 1 critical, including `proxy-addr`. These are not remediated by CI setup. Review dependency updates separately; passing tests is not a clean dependency-security assessment. No forced or unrelated runtime upgrades were applied.
- Browser smoke covers guest/auth-form recovery and role selection, not complete authenticated donor/NGO/admin journeys. Replica-set smoke proves basic persistence/rollback, not request-acceptance atomicity or race correctness. Expand those at Days 8 and 26.
- Production configuration validation, default database naming alignment and reproducible developer replica-set setup remain Day 4 work. Test harness isolation is not production configuration hardening.
- On forceful Windows teardown, ignored temporary test runtime copies can remain on disk. They contain only copied public/templates and synthetic test files, not developer `.env` or production uploads.

Day 3 implementation is ready for review and an eventual hosted run. No application server is left running, and no push, pull request, deployment or production migration was performed.
