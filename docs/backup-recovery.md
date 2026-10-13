# Coordinated backup and recovery (Day 24)

## Ownership and scope

The deployment operator owns backup capture, encryption-key custody, verified restore evidence and recovery execution. A separate operational reviewer owns release approval; the privacy/safety owner reviews retained data, recipients and pilot readiness before release. Record the named people and their deputies in the private deployment register before using real organization data. These roles are responsibilities, not new application permissions.

The repository provides a versioned encrypted BSON package for the current small, single-application replica-set database, using the installed Node/Mongoose MongoDB driver. No Database Tools installation is required. It captures all non-system application collections, their creation options and index metadata, private GridFS records/chunks/upload leases, and every referenced legacy local upload. Each archive has SHA-256, size, AES-256-GCM authentication and a random nonce. The manifest has a keyed authentication signature and includes unique private-file sizes/hashes. Restore verifies byte integrity, record counts, business relationships and index contracts.

Security sessions, rate-limit buckets, old worker heartbeats and recovery markers are excluded intentionally. Sessions and recovery credentials must not survive rollback. Source configuration, `.env`, encryption keys, MongoDB administrative users/roles, replica-set infrastructure, TLS certificates and deployment secrets are not included. Store their recovery procedures and secret-manager records separately with restricted access. Unreferenced local originals remain covered by a separately encrypted filesystem backup; do not delete them because the referenced-file package is complete. GridFS orphan data is included in its archived collections.

Capture requires **all writers stopped**: web processes, continuous/one-shot notification workers, maintenance scripts and administrative database changes. The tool hashes records before and after capture and rejects detected changes, but these checks do not replace the maintenance window or provide point-in-time recovery. Use a new directory each time; existing paths are never overwritten. On Windows the directory removes inherited access and grants the current operator full control; on POSIX it uses owner-only permissions. Encryption remains required. Keep packages outside public assets, source control and shared folders. Operating-system administrators and key holders can still access them.

For hosted larger deployments, establish a provider-supported coordinated backup strategy before a pilot. MongoDB's [backup guidance](https://www.mongodb.com/docs/manual/tutorial/backup-and-restore-tools/) requires consistent capture and recommends validating recovery on a test deployment. This repository drill verifies its own package format; it does not prove a provider snapshot, sharded-cluster restore or hosted disaster recovery.

## Capture and verify

Validate the intended source configuration with `npm run config:check`. Use the intended `MONGO_URI`/`MONGO_DB_NAME`; do not accidentally select a developer's existing `.env` database. Stop every writer and record the maintenance start time. Set `CARECYCLE_BACKUP_KEY` through the private secret manager to an independent randomly generated 32-byte key encoded as 64 hexadecimal characters. Do not reuse JWT/session secrets or place the key in a command argument, manifest, log, repository or backup directory. Keep key recovery material separately; losing it makes the package unrecoverable.

With the parent directory already provisioned and the output directory absent:

```powershell
npm run recovery -- backup --directory artifacts/private-backup-001 --maintenance-confirmed
npm run recovery -- verify-package --directory artifacts/private-backup-001
```

The package verifier performs no database connection and can run with only the key and package available. Check the reported backup ID, counts and capture timestamp against the private operational register. A complete authenticated `manifest.json` is required. A failed capture may leave a partial directory for investigation; it must not be treated as a backup or reused. No automatic deletion is performed.

Copy the verified encrypted package to the approved off-host backup location, retain its key reference separately, and verify the copied package again. A same-disk package is insufficient for a host/disk-loss recovery. Resume writers only after capture verification. Record failures and the age of the latest successful verified backup.

## Restore into quarantine

Use isolated infrastructure with SMTP/network egress disabled, fresh JWT/session secrets, blank mail settings and a separately named empty database. Configure `MONGO_URI` for the intended recovery replica set. Restore target names must begin `CareCycle_restore_` (or the guarded `carecycle_test_restore_` test prefix), must differ from the source name in the manifest, and must contain no existing collections. No existing database is dropped, merged or overwritten.

If local-upload references remain, provide an absent uploads directory inside a fresh application runtime; the application resolves legacy files from its working directory's `uploads` folder. The parent runtime must already exist. Preserve source originals separately.

```powershell
npm run recovery -- restore --directory artifacts/private-backup-001 --target CareCycle_restore_001 --legacy-dir artifacts/recovery-runtime/uploads
npm run recovery -- restore --directory artifacts/private-backup-001 --target CareCycle_restore_001 --legacy-dir artifacts/recovery-runtime/uploads --apply --maintenance-confirmed
npm run recovery -- verify-restore --directory artifacts/private-backup-001 --target CareCycle_restore_001 --legacy-dir artifacts/recovery-runtime/uploads
```

The first command is a dry run. Authenticate the entire package before applying. Restore writes a durable quarantine marker first, then recreates collections, encrypted BSON records and indexes and restores referenced legacy files. It verifies expected content including these explicit safety transformations:

- Increment every account's authentication version; remove password-reset/email-verification credentials and turn notification email preferences off. Password hashes and business identities remain recoverable.
- Do not restore any session/rate/worker state. Startup recreates their required indexes after release.
- Suppress historical pending notification mail, clear old email leases, and mark unprocessed historical lifecycle events as consumed. Existing in-app history and sent/failed/suppressed records remain; a pending event not yet materialized in the inbox is intentionally not replayed. Keep the encrypted original package for incident review.

Startup rejects quarantined databases before normal model initialization. Direct mail and notification senders also check the marker. A failed/partial restore remains quarantined and is not automatically dropped or released. Fix the cause and use another fresh target; investigate/dispose of the partial target only through a separately reviewed, explicitly scoped operational action.

Verification checks record counts/hashes after the known safety changes, user/organization/request ownership, listing allocations and handover totals, receipt identities/revisions/unchanged HTML, audit references, required index definitions and all referenced private-file sizes/hashes. Older inconsistent records require reconciliation and review; the tool does not infer missing handover evidence or silently repair accounting.

## Review and release

Review the verification report, restored private-file access plan, safe SMTP configuration, changed authentication secrets, historical notification suppression, data-handling obligations and the selected target. Keep all writers stopped. Record the backup ID and reviewer in the private deployment register. A preview is available before release:

```powershell
npm run recovery -- release --directory artifacts/private-backup-001 --target CareCycle_restore_001 --legacy-dir artifacts/recovery-runtime/uploads
npm run recovery -- release --directory artifacts/private-backup-001 --target CareCycle_restore_001 --legacy-dir artifacts/recovery-runtime/uploads --apply --maintenance-confirmed --review-confirmed
```

Release reruns verification and changes only the quarantine marker after both attestations. It does not re-enable old emails or preferences, restore credentials or select production traffic. Keep the recovered infrastructure offline after marker release if newer approved privacy/minimization decisions must be reapplied. The original-package verifier intentionally rejects content edits; apply those separately reviewed decisions with every web/worker process and SMTP egress still disabled, run current-state verification, and capture a fresh reviewed backup baseline before starting services:

```powershell
npm run recovery -- verify-current --target CareCycle_restore_001
```

Run this command from the recovered runtime containing its restored `uploads` directory when legacy files remain. It checks ownership/accounting/receipt/audit consistency and reads current private files through the configured target connection. It does not perform anonymization or erasure itself. Record the approved edits and new baseline ID outside the rollback-prone application database. After all reviews, start the application from that runtime with the selected restored database, validate readiness and participant/private-file behavior, then perform the reviewed traffic cutover. Users must sign in again and explicitly opt in to future email. Do not manually remove the marker to bypass verification. Independent real-organization pilot approval remains required.

## Recovery time and data-loss window

The isolated drill uses two separately owned replica sets, synthetic records, real encrypted packages and real restored private files. It records capture time, backup duration, restore-plus-verification duration and total drill time in `artifacts/day24-recovery-drill.json`. It creates a post-backup synthetic record and confirms that restoration excludes it, demonstrating snapshot loss rather than claiming zero data loss.

Expected data-loss window at a failure is `failure time - latest verified backup capturedAt`; changes after capture are outside this offline package. The measured synthetic window is evidence for the drill, not a production recovery-point guarantee. The proposed prototype operating schedule is a verified backup daily and before deployments/migrations. With successful daily captures, the planned window can approach 24 hours; missed backups increase it. No scheduler is installed by this stage. The operator must define and validate pilot-specific RPO/RTO, freshness alerts, key retrieval, off-host storage, network/database provisioning and recovery capacity. Local millisecond measurements exclude real incident response and hosted provisioning.
