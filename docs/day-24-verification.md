# Day 24 verification: backup, privacy and restore drill

Date: October 13, 2026. Branch: `codex/day-24-backup-recovery`. Commit: the commit containing this record, `docs(operations): verify backup recovery and data handling`.

## Delivered behavior

The recovery CLI captures a versioned encrypted BSON package of business records, collection options/indexes, GridFS records/chunks/upload leases and referenced local uploads. It requires stopped writers, a separately supplied random backup key and a new private output directory. AES-256-GCM authentication, manifest authentication, SHA-256 and before/after count/content checks detect wrong keys, corruption and detected source changes. Windows directories remove inherited access and grant the current operator access; POSIX directories use owner-only permissions. Public asset destinations and unsafe package paths are rejected. The package verifier works offline without runtime/database credentials.

Restore defaults to a dry run and requires a fresh, separately named database for application. No existing database/directory is dropped, merged or overwritten. A durable quarantine marker is written before any restored records; interruption leaves it in place. User IDs and business history remain stable, while authentication versions advance, reset/verification credentials are removed, email preferences are disabled, sessions/rate/worker records are omitted, old pending mail is suppressed and unprocessed historical lifecycle events are not replayed. Startup reports `recovery_quarantined`; direct mail/notification senders also check quarantine.

Verification compares restored content against the authenticated package plus explicit safety transformations, checks account/organization/request ownership, allocations/handover totals, receipt identities/revisions and unchanged HTML, audit references, index definitions and private-file hashes/counts. Release reruns verification and requires maintenance and review attestations. Current-state verification supports separately reviewed privacy decisions kept offline before live cutover; these decisions and retention limits are not automatically applied to real data.

Operational backup/restore ownership, key handling, retention proposals, deletion/anonymization procedure, verification-document access, synthetic-demo rules and unresolved independent privacy/safety review are documented in [backup recovery](backup-recovery.md) and [data handling](data-handling.md).

## Measured recovery drill

Two separately owned disposable MongoDB 8.2.5 replica sets were used. Synthetic records included two users, one NGO, completed and accepted requests across two listings, an actual issued receipt snapshot, an audit record, queued notifications, GridFS image/document bytes and a remaining local image. A post-backup account was deliberately added and remained absent from the restored snapshot, demonstrating the backup's data-loss boundary. Original synthetic source accounts, credentials, preferences and receipt history stayed intact.

Final measured run:

| Measurement | Local result |
|---|---:|
| Backup capture | 972 ms |
| Restore plus verification | 6,012 ms |
| Entire synthetic drill, including additional safeguards/CLI checks | 20,178 ms |
| Simulated failure time minus package capture time | 4,099 ms |
| Recovered users / requests / receipts / audits / unique private files | 2 / 2 / 1 / 1 / 3 |

These measurements cover a small local fixture, not a hosted RTO guarantee. The expected data-loss window is the age of the latest verified backup at failure; changes after capture are outside that snapshot. Daily/pre-change captures are a proposed operating procedure, not an installed scheduler or proof of production RPO. Evidence is retained in ignored `artifacts/day24-recovery-drill.json` and `artifacts/logs/day24-final-recovery.log`; no encryption key or recoverable business package is committed.

## Checks and safeguards

- `npm test`: 94 unit/model/template checks passed; 181 JavaScript files passed source checks.
- Full `npm run test:integration`: 179 checks passed on owned disposable infrastructure.
- Final focused recovery drill: seven checks passed, including interrupted restore, index mismatch, offline package verification, startup and outbound-delivery quarantine, current-state verification and explicit release. Reruns are not added to full-suite totals.
- Final source/CLI syntax and Git whitespace checks passed.

The initial synthetic fixture attempted two blocking requests for the same organization/listing pair. It was corrected to use two listings, preserving the existing request-index contract. A contact unit test previously mocked only the provider; it now explicitly mocks the recovery-marker read as well and verifies that a quarantined state prevents any fake provider send. Runtime senders retain their real database guard. No production bypass or web testing endpoint was added.

Corrupted ciphertext/wrong keys fail before target creation. Dry runs leave targets empty. A forced restore interruption retains an unverified quarantine marker and rejects reuse of that partial target. Altered allocations/indexes block verification/release. Guarded subprocesses prove that a restored app cannot start and notification email cannot be attempted before review. Receipt HTML, quantities, account IDs and audit references are recovered; historical credentials/queued delivery are not reactivated. Browser workflows were not rerun for this maintenance-only stage; application startup/mail behavior was verified through real subprocess and integration paths.

## Preserved data and unresolved external checks

Existing application databases, uploads, `.env`, receipt revisions and unrelated `Readme1.md` were preserved. Tests generated their own records, keys, private packages and replica sets, then cleaned only owned disposable resources. No real-data backup, restore, release, migration, deletion, remote push, PR or deployment was performed. Ports 4000 and 27018 were not started. No UI/runtime asset update was needed.

Hosted backup/restore, off-host package/key retrieval, realistic dataset performance, alerting/scheduling, named owners/deputies, approved retention/erasure enforcement, document-access audit requirements, privacy/legal review and equipment-safety approval remain pending before a real-organization pilot. Encryption/ACL checks do not prevent an authorized operator or OS administrator from accessing data. Referenced legacy files are included; unreferenced local originals require separate encrypted filesystem coverage. SMTP must remain isolated during recovery, and privacy decisions newer than the backup must be reapplied offline before live cutover. Day 25 is staging deployment and the isolated demo.
