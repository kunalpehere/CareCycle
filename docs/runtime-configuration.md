# Runtime configuration and MongoDB topology

Day 4 implementation, October 12, 2026. Validation and local topology checks do not establish production readiness.

## Loading and checking settings

When `NODE_ENV` is unset or explicitly `development`, the loader reads the repository-root `.env` and fills only missing process variables. Existing process variables win. Explicit `test` and `production` modes ignore `.env`; supply settings through the test harness or deployment environment. Unknown or blank environment names fail.

```powershell
npm run config:check
```

Run in the repository root. This checks configuration without connecting MongoDB, starting HTTP, sending mail, or printing supplied URLs, database names or secrets. Errors name settings and rules without echoing values. It is an offline grammar/policy check; the driver, certificate files, network, authentication and live topology still need connection-time verification.

`.env.example` now uses `MONGO_DB_NAME=CareCycle`. Your existing `.env` was not edited. Keep `Medonor` or another explicit name when it identifies your existing data. The application continues to pass `MONGO_DB_NAME` to Mongoose, overriding any database path in `MONGO_URI`; development defaults to `CareCycle` when absent. No database is renamed, copied or migrated. Production requires the name to be explicit.

## Setting contracts

| Setting | Contract |
|---|---|
| `NODE_ENV` | `development`, `test`, `production`; absent defaults to development. |
| `PORT` | Decimal integer 1 through 65535; absent defaults to 4000. Empty/malformed/out-of-range values fail. |
| `APP_URL` | HTTP(S) origin without credentials, path, query or fragment. Development defaults to `http://localhost:<PORT>`. Tests require loopback; production requires explicit HTTPS without loopback/unspecified hosts. |
| `MONGO_URI` | Standard or SRV MongoDB URI with valid hosts/ports. Use `&` separators. Guarded security options cannot be duplicated/ambiguous and boolean flags use `true`/`false`. Other driver/provider options may still fail at connection time. |
| `MONGO_DB_NAME` | Nonempty, under 64 UTF-8 bytes, no whitespace/reserved characters. Existing explicit names are retained; test requires `carecycle_test_...`. |
| `JWT_SECRET`, `SESSION_SECRET` | Required independent values, at least 32 characters; no whitespace, obvious placeholders or single-character repeats. Validation cannot measure entropy; generate random values. |
| `MONGO_REQUIRE_REPLICA_SET` | Exact `true`/`false`. Defaults false in development/test and true in production; production cannot disable it. The test harness explicitly enables it for its replica-set app. |
| `TRUST_PROXY` | Blank/`false` disables trust outside production. Otherwise explicit proxy IPs/CIDRs with nonzero prefixes. Trust-all booleans, hop counts, hostnames and `/0` networks are rejected. Production requires the actual proxy addresses. |
| `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM`, `MAIL_RECIPIENTS` | Optional complete group; all blank disables mail. With enabled mail, user/password/recipients are required; from defaults to user. From/recipients use bare email addresses. Partial settings fail. |
| `MAIL_SERVICE` | Defaults to `gmail`; enabled mail requires a letters/digits/underscore/hyphen service name. Actual provider support, credentials and delivery are not proven by syntax. |

Generate two independent values locally, then place them in the appropriate environment. Do not commit or share their output:

```powershell
node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(48).toString('hex')); console.log(randomBytes(48).toString('hex'));"
```

Example placeholder secrets are deliberately rejected. Existing weak/shared values need replacement before startup succeeds. Rotating secrets invalidates existing tokens/sessions; this task did not rotate runtime credentials.

## Production boundary

Use HTTPS through a TLS-terminating proxy whose actual addresses are listed in `TRUST_PROXY`. Express applies that list to forwarded protocol/client-address handling, and existing secure cookie settings remain. Do not guess ranges or trust all clients. Local HTTP tests verify secure session cookies through an allowed proxy and refusal to trust a spoofed HTTPS header from an unrelated address.

MongoDB production settings must enable TLS (including SRV defaults), retain certificate validation, provide username/password or X.509 client-certificate authentication, retain write acknowledgement and permit replica discovery. Disabled TLS/certificate checks, `w=0` and `directConnection=true` fail validation. X.509 certificate-path presence is checked offline; the driver must load/verify the actual certificate. Other authentication mechanisms are outside this configuration contract.

Connection attempts have a ten-second server-selection timeout. With replica validation enabled, startup sends `hello` and requires a named writable replica-set primary with sessions before listening for HTTP. Standalone or secondary-only connections fail. Connection failures omit original URI/driver error text. This gate does not verify production redundancy, backup, storage permissions, WiredTiger configuration or every transaction behavior.

Persistent sessions/rate limits, complete proxy/deployment security review, CSP and durable uploads remain later work. Actual production HTTPS, TLS certificates, mail and managed database deployment remain unverified.

## Local development replica set

For Day 6, use a replica set with WiredTiger, a writable primary and sessions. A single member supports local transaction development but provides no production redundancy. Standalone remains available for current development with the flag false. Sharded topology is outside the current release setup.

Prerequisites: supported Node/npm, `npm ci`, and MongoDB 8.x `mongod` on PATH. These commands use a new project directory and port 27018, independent of any service on 27017. Do not copy existing/production data into the prepared directory.

Prepare once:

```powershell
npm run db:replica:prepare
```

This exclusively creates ignored `.local-data/carecycle-dev-replica` and records empty preparation. It refuses existing directories rather than erasing them. An existing initialized set uses the restart procedure; do not delete data to make preparation succeed.

In terminal A:

```powershell
mongod --dbpath .local-data/carecycle-dev-replica --port 27018 --bind_ip localhost --ipv6 --replSet carecycle-dev --oplogSize 128 --logpath .local-data/carecycle-dev-replica/mongod.log --logappend
```

In terminal B:

```powershell
npm run db:replica:init
```

The initializer accepts only localhost:27018, replica name `carecycle-dev`, and this project's canonical prepared path. An uninitialized set requires its fresh preparation record. It does not read application `.env`, accept a production URI, reconfigure another set, or convert service data. Repeated calls verify an already initialized matching set. Uninitialized replicas cannot enumerate databases, so the preparation record is essential and does not authorize importing old data.

For this new local environment:

```env
NODE_ENV=development
MONGO_URI=mongodb://localhost:27018/?replicaSet=carecycle-dev
MONGO_DB_NAME=CareCycle
MONGO_REQUIRE_REPLICA_SET=true
TRUST_PROXY=false
APP_URL=http://localhost:4000
```

Also supply the independent secrets and desired port. Preserve an existing database name when appropriate; pointing at this new instance does not transfer records from an old service. Validate with `npm run config:check`; run `npm start` only when you want the application running.

Stop the development `mongod` with Ctrl+C in terminal A. Restart using the same `mongod` command and `npm run db:replica:init`, without repeating preparation. The commands do not stop unrelated services or delete database files. The application connection code verified this exact development topology locally; see [evidence](day-4-verification.md).

## Isolated tests

`npm test` needs no MongoDB service. Its cookie/configuration check briefly starts localhost HTTP on an ephemeral port without database access, then closes it. Integration tests create owned synthetic replica/standalone processes; browser tests create their own replica and disposable app/runtime directory.

Test mode rejects remote/SRV MongoDB targets, non-loopback application origins, and names outside `carecycle_test_...`. The harness overrides inherited settings, generates secrets, blanks mail and skips `.env`. This does not approve arbitrary existing local databases as test targets; use owned harness instances.

```powershell
$env:CARECYCLE_TEST_MONGOD = (Get-Command mongod).Source
npm run test:integration
npm run test:browser
Remove-Item Env:CARECYCLE_TEST_MONGOD
```

Without an explicitly selected installed executable, the harness downloads its pinned binary. See [testing instructions](testing.md) for Chromium installation and diagnostics.

Primary references: [MongoDB connection strings](https://www.mongodb.com/docs/manual/reference/connection-string/), [TLS/discovery options](https://www.mongodb.com/docs/manual/reference/connection-string-options/), [development replica sets](https://www.mongodb.com/docs/manual/tutorial/deploy-replica-set-for-testing/), [transaction requirements](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/), and [Express proxy trust](https://expressjs.com/en/guide/behind-proxies/).
