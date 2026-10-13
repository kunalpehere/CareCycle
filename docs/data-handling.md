# Data handling and synthetic-demo rules (Day 24)

## Status and responsible decisions

These are prototype operating rules and proposed retention limits for review. They do not establish legal retention requirements, consent adequacy or approval to handle real medical/beneficiary data. The privacy owner, deployment operator and equipment-safety owner must be named before any real-organization pilot. Record decisions, exceptions and review dates in the restricted operational register. No automatic deletion/anonymization job is introduced by this stage.

Collect the minimum information needed for equipment matching and accountable handover. Beneficiary entries and outcomes should be aggregate summaries, not patient names, diagnoses, health records or identifiers. Contact/pickup details belong only in the protected participant workflow. Diagnostic logs and receipts must continue excluding beneficiary text and private coordination details.

## Access and handling

- Verification documents are private evidence for the owning NGO member and active administrators. Review through the application; do not put them in public URLs, logs, screenshots, demo fixtures, support messages or shared drives. Access ownership/authorization checks apply on every request. Administrator decisions identify evidence reviewed; download-access audit logging is not implemented by this stage and remains a pilot review item.
- Donation images are private to the owning donor, staff and authorized verified NGOs, with accepted/completed history access scoped to the matched organization. Originals can contain embedded EXIF/location metadata under the Day 22 policy; uploaders should remove unwanted metadata before submission.
- Passwords use existing password hashing. Recovery links/credentials, cookies and secrets are not support evidence. Backups containing contact information, hashes or private documents require encryption and restricted access; keys are held separately.
- Receipt snapshots and administrative audit history support accountability and remain immutable through ordinary workflows. They can contain historical participant names, so anonymizing the current profile alone does not erase historical copies.
- Retain application roles and suspensions as implemented. Give backup/recovery infrastructure access only to named operators and reviewers; application administrator access does not imply direct backup/key access.

## Proposed retention register

| Data | Prototype proposal for owner approval | Required action |
|---|---|---|
| Verified account/contact profile | While active and needed for commitments; review dormant accounts after 12 months | Resolve commitments and privacy requests before disabling/anonymizing |
| Rejected/withdrawn organization verification evidence | Review for removal 30 days after final rejection/withdrawal, subject to appeal/evidence holds | Remove private media only after references and evidence obligations are reviewed |
| Current verified organization evidence | While verification is valid; review on renewal or closure | Define the pilot's renewal/access/retention policy |
| Beneficiary summaries and pickup coordination | Review minimization 90 days after settlement | Remove sensitive free text through a reviewed operation while retaining reconciled quantities/history |
| Receipts and accountable audit history | Review annually; no automatic deletion before the responsible retention decision | Determine lawful/accountability needs and handling of historical names before a pilot |
| Notification history and operational logs | Proposed 90 days for notifications and 30 days for restricted logs | Apply collection/collector retention after approval; verify support and evidence needs |
| Encrypted recovery packages | Proposed daily captures retained 30 days plus a reviewed pre-change recovery package | Rotate packages and separately held key material; record holds and restore drills |
| Sessions, security limits and worker heartbeats | Existing TTL policies | Expiry checks apply before asynchronous TTL removal; worker rows expire after 24 hours |
| Orphan GridFS files and interrupted uploads | Existing 24-hour grace policy | Reviewed maintenance cleanup; referenced files and local originals are not swept |

These limits are proposals, not automated enforcement or a claim that all categories must share one retention period. The operator must document the approved implementation and any hold before applying deletion. Retained local migration originals and pre-change packages are sensitive copies with their own retention review; do not forget them when deleting a current reference.

## Deletion and anonymization requests

Verify the requester's identity through an approved private channel without collecting extra identity documents by default. Log the request, affected scope and decision in a restricted register. Suspend new activity and revoke credentials where appropriate, then assess outstanding commitments, receipts, audits, legal/evidence holds, stored images/documents, notification history and backups.

For referenced accounts, preserve stable record IDs and accountable quantity/history links; a reviewed tombstone/anonymized profile may replace contact fields and personal names. Never delete users/organizations/requests independently and leave broken references or fabricate receipt amendments. Historical names embedded in immutable receipt HTML and audit details need a specific retention/redaction decision; changing the live profile is insufficient. Sensitive free text and private media require explicit scope and a consistency check after the operation. Keep file copies/exports within the same review.

Record pending erasure/minimization decisions outside rollback-prone application backups. During recovery, reapply newer approved decisions before any service start or live cutover, preventing old backups from reintroducing deleted information. The verified marker-release step checks the original snapshot plus mandatory safety changes; approved privacy edits then require continued offline isolation, current-state verification and a fresh reviewed backup baseline as described in [recovery procedures](backup-recovery.md). Encrypted backups generally age out under the approved retention/hold policy; do not promise immediate complete erasure while recoverable copies remain. Record what was retained, why, access restrictions and the next review date. No destructive erasure operation is applied to existing data in Day 24.

## Synthetic demo and support evidence

Public portfolios, staging demos, screenshots, exported reports and recovery drills use generated synthetic identities and `.invalid` email addresses. Keep mail credentials blank, outbound SMTP disabled, databases and storage separate, and demo credentials unrelated to real accounts. Label synthetic examples clearly. Never copy a real organization's database or uploaded evidence into a public demo, even after changing a few profile names. Existing test fixtures and the Day 24 drill generate their own records and never select a developer's existing database.

Use random support references and approved safe error codes for diagnostics. Do not publish backup manifests, decrypted packages, verification files, account hashes, real recipient addresses or operational register contents. Synthetic evidence artifacts may be summarized, but application test secrets and backup keys are not release artifacts.

## Pilot gates still unresolved

Before a real-organization pilot, complete independent privacy/legal review of purpose, consent/notices, beneficiary-data minimization, retention and erasure, historical receipts, verification-document access evidence, and incident response. Complete equipment-safety review of suitability, condition, cleaning, handover and recipient responsibilities. Validate hosting/data location, infrastructure permissions, encryption/key custody, off-host backup restore, SMTP suppression, monitoring/alerts and the approved retention process. Assign named operational ownership and escalation coverage. Local recovery tests do not satisfy these external approvals.
