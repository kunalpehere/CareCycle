# Durable private uploads (Day 22)

New donation images and NGO verification documents use the `private_media` GridFS bucket in the configured application MongoDB database. Files are independent of the application checkout, working directory, and local `uploads` volume. No new storage credentials or public bucket are introduced. This uses the MongoDB driver already supplied by Mongoose; no dependency was added.

## Deployment and access

Use the existing authenticated, TLS-enabled production replica set configuration. Give the application access to `private_media.files`, `private_media.chunks`, and `private_media_uploads`, including index creation during startup. Startup initializes the standard GridFS indexes. Upload writes use majority acknowledgement; startup fails if required storage indexes cannot be initialized. Database backups must include all three collections together with donation/organization references. Database capacity and backup retention now include uploaded bytes. MongoDB itself must have durable storage independent of the application deployment; a disposable MongoDB container cannot provide persistence.

The shared interface is `writePrivateMedia`, `readPrivateMedia`, `removePrivateMedia`, and `sendPrivateMedia` in `src/services/privateStorageService.js`. Each immutable object has a kind-scoped key, a byte count, MIME type, and SHA-256 digest. The complete bounded file is integrity-checked before a response begins. A corrupt/unavailable object produces a sanitized 503; missing files produce 404. GridFS-backed references never fall back to local files. No static route serves either storage backend.

Authorization stays in the controller before file access:

- Donors can read images referenced by their own listings, including closed listings.
- Verified NGOs can read images in current discoverable listings. Hidden listings, suspended donors, and exhausted/closed inventory stay out of discovery.
- A verified NGO owner who originally requested equipment can also read listing images through `/ngo/requests/:requestId/images/:filename` while that request is accepted or completed. Request history presents these links. Unrelated organizations, pending/rejected/cancelled attempts, and guessed request IDs cannot use this route. Existing account suspension and organization verification gates still apply.
- Administrators can read listing images through their protected review route. Verification documents remain restricted to the owning NGO member and administrators.

All file responses use `private, no-store`, `Vary: Cookie`, `nosniff`, the stored validated MIME type, and a safe server filename. ETags do not bypass authorization.

## Validation and metadata policy

Donation uploads remain limited to three JPEG/PNG/WebP images, 5 MiB each. Verification evidence remains one PDF/JPEG/PNG file, 8 MiB. Existing multipart field limits and signature checks remain, and storage also verifies actual buffer size against declared size. All donation files are checked before the first is written. Original client names are reduced to a basename, stripped of control characters, and limited to 255 characters; storage keys are server-generated UUIDs.

The explicit `original-v1` normalization policy preserves exact original bytes, orientation, embedded metadata, and PDF evidence. No lossy re-encoding, metadata extraction, public derivatives, or image-decoder claims are introduced. SHA-256 covers the complete original, including embedded metadata. Embedded EXIF is therefore present in downloaded originals; uploaders should remove unwanted location metadata before submitting. A future transformation must introduce a new policy and preserve original evidence instead of silently changing bytes or hashes. Prefix signature checks are not a complete image/PDF decoder or malware scanner.

## Manifest-driven migration

Existing references without `storage: "gridfs"` continue to use private legacy reads from `uploads/donations` or `uploads/verification-documents`. Complete migration before removing these directories from a deployment. Run from the checkout containing the originals, using the intended database configuration.

1. Back up the database and original upload directories. Stop application instances and all other writers before applying migration. Retain the backups and originals until recovery has been verified.
2. Create a new private manifest (an existing path is never overwritten):

   ```powershell
   npm run media:manifest -- --manifest artifacts/day22-media-manifest.json
   ```

3. Review database identity, ownership records, file counts, byte counts, MIME types, and SHA-256 digests in the manifest. Protect it as private operational data. Verify the plan without changing references:

   ```powershell
   npm run media:migrate -- --manifest artifacts/day22-media-manifest.json
   ```

4. With every writer stopped, apply the reviewed manifest:

   ```powershell
   npm run media:migrate -- --manifest artifacts/day22-media-manifest.json --apply --maintenance-confirmed
   ```

The manifest distinguishes unique file count/bytes from reference count, including files shared by multiple records. The tool recomputes it before copying, validates legacy signatures, and rejects changed/missing originals, stale references, cross-database manifests, and count/hash mismatches. Every destination is read back and verified before any reference changes. Source membership/counts are rechecked, then references switch in one replica-set transaction guarded by their original values. Reference versions increment. A failed switch rolls back all reference changes; successful copies remain available for retry. Existing destinations must have identical verified bytes. Local originals are never deleted by migration or orphan cleanup.

After success, generate a new manifest at a new path; zero legacy references confirms completion. Verify private access through the application before resuming writers. After a pre-switch failure, fix the cause and retry the unchanged manifest if sources still match; otherwise regenerate it. Restore references plus the retained originals from backup for rollback after a successful migration. Never rewrite a completed reference's storage marker without its matching original backup.

## Orphan policy

Immediate best-effort compensation removes newly saved files after failed listing/organization writes and removes superseded files after successful updates. It checks current references before deleting, so media shared by multiple records remains readable. Cleanup failures produce a sanitized diagnostic instead of masking the original request failure. A write lease identifies interrupted GridFS uploads; leases are removed only after completion or successful compensation.

Periodic cleanup is operator-run, defaults to a dry run, and has a fixed 24-hour grace period:

```powershell
npm run media:cleanup
```

Review the private candidate list, back up storage, and stop every writer before applying:

```powershell
npm run media:cleanup -- --apply --maintenance-confirmed
```

Cleanup removes only aged, unreferenced GridFS files and aged upload leases with their associated incomplete chunks. It rechecks references before deletion. Referenced files are retained regardless of age or listing/request status; recent uploads are retained. GridFS deletion is not transactional, so the maintenance attestation is necessary. Repeat the dry run after interruption. Untracked chunks without a file/lease require manual investigation; the tool never guesses their age or deletes them automatically. Local originals, backups, and unrelated files are never swept. Failed migration copies can become cleanup candidates after 24 hours; retained originals allow migration to copy them again.

## Verification boundary

Tests use disposable local replica sets and synthetic uploads. They verify fresh application processes reading the same bytes from a replacement working directory, HTTP authorization/cache headers, corruption handling, failed multipart/partial uploads, migration integrity and atomic rollback/retry, and orphan retention/deletion. Hosted database durability, storage sizing, backup restore, and an actual production redeployment require deployment verification.

Reference: [MongoDB driver's GridFS documentation](https://www.mongodb.com/docs/drivers/node/current/crud/gridfs/).
