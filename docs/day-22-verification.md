# Day 22 verification: durable private uploads

Date: October 13, 2026. Branch: `codex/day-22-private-storage`. Commit: the commit containing this record, `feat(storage): add durable private media persistence`.

## Delivered behavior

New donation images and verification documents are stored in a private MongoDB GridFS bucket through a shared storage interface. There is no public storage URL or local-write fallback. Authorization remains ahead of reads. Stored MIME type, size and SHA-256 are checked before bytes are sent, with bounded reads and sanitized errors. Original evidence bytes and embedded metadata are preserved under the explicit `original-v1` policy. Existing multipart limits and signature checks remain in place.

The owning donor and administrators retain their existing access. Verified NGO discovery continues to enforce visibility and remaining stock. Accepted/completed request history offers private image links only to the organization owner who requested that equipment, even after discovery closes. Pending, rejected, cancelled, unrelated, unverified and suspended actors do not gain this history access. Verification evidence remains owner/admin only. Responses retain private/no-store caching and nosniff headers.

Manifest generation and migration dry runs verify legacy originals without changing references. Migration distinguishes unique files from reference counts, verifies every copied destination, and switches references atomically with guarded values. Failures roll back reference changes; verified copies can be reused. Local originals remain recoverable. Cleanup defaults to a dry run, retains referenced/recent files, and removes only aged unreferenced GridFS files or tracked interrupted uploads after a 24-hour grace period. Applying either tool requires a maintenance attestation. Shared referenced media is protected from immediate compensation.

See [storage and maintenance policy](private-uploads.md) for commands, deployment configuration, original metadata handling, backup requirements and recovery steps.

## Verification evidence

- `npm test`: 90 unit/model/template checks passed; source syntax checks covered 170 JavaScript files.
- Full `npm run test:integration`: 160 checks passed on disposable MongoDB 8.2.5 replica sets.
- Final focused `private-media.test.js`: 11 checks passed, including the added storage-outage and shared-reference scenarios. Reruns are not added to full-suite totals.
- Full `npm run test:browser`: all 48 Chromium desktop/mobile checks passed, including private image previews/uploads, evidence review, page-family accessibility, receipt printing and CSP behavior.
- Final changed maintenance-script/service/test syntax and Git whitespace checks passed.

The focused storage checks cover private bytes/cache headers, guessed public paths, owner/admin boundaries, two fresh reader processes from a replacement working directory, accepted/completed image history, absent hash/unknown backend/path traversal rejection, corruption returning 503 before file delivery, referenced-file compensation, invalid and partially failed uploads leaving no extra files/chunks/leases, changed/missing migration originals, manifest CLI dry runs and apply safeguards, transactional reference rollback/retry, deduplicated file counts, retained originals, orphan grace/cleanup and unavailable storage without local fallback.

The full integration suite and browser run logs are retained in ignored `artifacts/logs/integration.log` and `artifacts/logs/browser.log`, with browser HTML/JUnit results under `artifacts`. Tests use synthetic files, isolated runtime directories and owned disposable databases; real application data is not selected by these runners.

## Preserved data and remaining deployment checks

Existing uploads, application databases, `.env`, receipt revisions and unrelated `Readme1.md` were preserved. Migration tools were tested against synthetic legacy files; no migration or cleanup was applied to existing application data. Legacy references remain readable until a reviewed maintenance migration is performed. The reviewed runtime request-history view was refreshed; application port 4000 and development database port 27018 were not started. No remote push, PR or deployment was performed.

Actual hosted MongoDB durability, database sizing, backup restore and production redeployment remain unverified. Backups must include both GridFS collections, upload leases and owning records. Original image/PDF metadata is preserved, not stripped; prefix signatures are not full decoding or malware scanning. Cleanup deliberately leaves local originals and untracked chunks for operator review. Real mail/font-provider delivery, other browser engines, physical devices/screen readers and earlier operational/privacy review requirements remain external checks. Health/log/support diagnostics are Day 23.
