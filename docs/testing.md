# Reproducible CareCycle verification

Day 3 setup, October 12, 2026. Keep the existing Express, MongoDB and EJS application. No frontend build, typecheck, or new linting command is required.

## Supported environment and clean checkout

Use Node.js 22.x, version 22.14.0 or later, and npm 10.x. `.nvmrc` selects the 22 release line; `package.json` records the supported ranges and `.npmrc` rejects unsupported engines. Use the maintained patch release within that line. Local verification used Node 22.14.0 and npm 10.9.2; CI selects Node 22 through `.nvmrc` rather than hard-coding a developer installation path.

From a fresh clone or checkout, run in the repository root:

```powershell
npm ci
npm test
```

`npm ci` installs from the committed lockfile. Do not copy `node_modules`, `.env`, runtime uploads, or production records into the checkout. The unit command needs no MongoDB service, developer `.env`, mail credentials, or browser installation. Day 4's configuration/cookie regression briefly uses a localhost HTTP fixture on an ephemeral port, then closes it. Installing packages requires access to the npm registry; native bcrypt uses its normal package installation path.

## Available commands

| Command | Purpose | Prerequisites and diagnostics |
|---|---|---|
| `npm run check` | Node syntax checks for application, scripts, public JS, tests and browser configuration. | Supported Node; syntax errors appear in command/CI output. |
| `npm test` | Syntax checks followed by existing top-level Node unit/model-contract/EJS tests. | `npm ci`; TAP output saved to `artifacts/logs/unit.log` after syntax checks succeed. |
| `npm run test:integration` | Real, disposable replica-set smoke: persist a synthetic listing, abort a transaction, verify stored quantity is unchanged. | MongoDB test binary available/downloadable; output in `artifacts/logs/integration.log`. |
| `npm run test:browser` | Actual Express auth shell, validation focus, guest recovery and role-selection smoke in desktop/mobile Chromium. | Playwright Chromium plus MongoDB test binary; reports, failure screenshot/trace and output under `artifacts/`. |
| `npm run test:failure-probe` | Temporarily add a deliberately failing test to the same unit runner, verify nonzero exit and a useful diagnostic, remove the probe. | `npm ci`; expected child failure saved to `artifacts/logs/failure-probe.log`. The probe command itself succeeds only when failure propagation is correct. |

The unit runner lists only top-level `tests/*.test.js` explicitly, avoiding shell-glob differences and accidental discovery of database/browser suites. Integration and browser tests must be requested separately. Integration files run sequentially because each owns a MongoDB process/replica set; this avoids startup resource contention as the suite grows. Test dependencies are `devDependencies` and are not imported by `index.js`, `src/app.js`, or production startup.

## Disposable database and browser setup

The harness creates its own localhost MongoDB process, a unique `carecycle_test_...` database and temporary storage. It never accepts your runtime `MONGO_URI` as a test target, drops an external database, or stops a MongoDB service. The default test binary is MongoDB 8.0.16, downloaded from MongoDB's official server with the library's checksum check into ignored `artifacts/mongodb-binaries`. The first download can be large, particularly on Windows. Startup has a bounded timeout; unavailable downloads fail rather than silently skipping tests.

If MongoDB 8.x is already installed, explicitly select that executable to avoid the download. For a `mongod` available on PowerShell's PATH:

```powershell
$env:CARECYCLE_TEST_MONGOD = (Get-Command mongod).Source
npm run test:integration
npm run test:browser
Remove-Item Env:CARECYCLE_TEST_MONGOD
```

The harness requires an absolute executable path, checks its reported 8.x version, and launches a separate replica set with it. It does not connect to the installed service. Local verification used this option with MongoDB 8.2.5; the default downloaded 8.0.16 path is configured for hosted CI and was not successfully exercised locally.

Install the pinned Playwright package's Chromium build before browser checks:

```powershell
npx playwright install chromium
npm run test:browser
```

On Linux CI, `npx playwright install --with-deps chromium` also installs browser OS dependencies. Browser checks run a temporary test app on `127.0.0.1:4183` and refuse to reuse an existing listener. Keep that port free; the normal CareCycle server on 4000 can remain stopped. Only localhost requests are allowed by the smoke tests; external fonts/services are not required.

The browser server copies only views/public assets to an ignored disposable runtime directory, changes its working directory there before importing application configuration, and supplies fresh independent secrets, a test database and blank mail settings. There is no `.env` in that runtime, and uploaded files would stay in its temporary directory. Test credentials are generated at runtime and never committed or logged. Day 4 also validates the runtime database/URL boundaries and verifies the browser app's replica-set primary. See [runtime configuration](runtime-configuration.md).

Normal teardown stops only owned test processes. On Windows Playwright force-stops its web-server process tree because POSIX graceful-shutdown signals are unavailable; disposable runtime directories can remain after forceful shutdown or interruption. `artifacts/runtime` contains test-only files and is ignored. No verification worker is part of `npm start` or `npm run dev`.

## CI and failure evidence

[`.github/workflows/verify.yml`](../.github/workflows/verify.yml) runs on push, pull request and manual dispatch:

- Source/unit checks and failure propagation on Ubuntu and Windows.
- Isolated database smoke on Ubuntu.
- Isolated desktop/mobile Chromium smoke on Ubuntu.

Jobs use `npm ci`, read-only repository permissions, no application secrets and no production database. A test command's nonzero exit fails its step; there is no `continue-on-error`. Diagnostics upload with `if: always()` and seven-day retention. Only logs, browser reports/results and JUnit XML are uploaded, excluding binary caches, runtime copies and secret files.

Browser failures retain screenshots and trace ZIPs in `artifacts/browser-results`; the HTML report is in `artifacts/browser-report` and JUnit XML in `artifacts/browser-results.xml`. Inspect traces with the installed Playwright CLI and a report locally:

```powershell
npx playwright show-report artifacts/browser-report
# Supply the actual trace path printed by a failed run:
npx playwright show-trace path/to/trace.zip
```

Trace files describe only the synthetic test context. Do not point this harness at real account data or upload production traces to public bug reports. Syntax-check failures remain visible in job output even when no unit-log artifact has been created.

The failure probe verifies the underlying runner locally and in CI. Its expected failure is not a broken normal suite. A hosted pipeline failure/run is not claimed until the workflow has actually run on GitHub. See [Day 3 evidence and limits](day-3-verification.md).

## Scope of today's tests

The database smoke verifies infrastructure and basic transaction rollback, not transactional request acceptance. The browser smoke verifies entry forms and guest recovery, not a complete authenticated donation cycle. Expand allocation/privacy races in Day 8 and full browser journeys in Day 26. Runtime production validation, migration/backfill, provider delivery, deployment storage, complete accessibility and restore/performance checks retain their later roadmap gates.

Sources for the tooling behavior: [Node release lines](https://nodejs.org/en/about/previous-releases), [Playwright web-server lifecycle](https://playwright.dev/docs/test-webserver), [Playwright reporters](https://playwright.dev/docs/test-reporters), and [MongoDB memory-server replica sets](https://typegoose.github.io/mongodb-memory-server/docs/guides/quick-start-guide/).
