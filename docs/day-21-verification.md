# Day 21 verification: persistent sessions, limits and browser security

Date: October 13, 2026. Branch: `codex/day-21-persistent-security`. Commit: the commit containing this record, `security: persist sessions and harden deployment boundaries`.

## Delivered behavior

MongoDB-backed sessions replace process memory. Login requires a valid JWT plus matching persisted account context and current account version/status. Sessions/CSRF survive restarts and independent instances. Login regenerates and acknowledges context before issuing credentials. Logout clears both cookies and retains a revocation tombstone, preventing stale writes from resurrecting a session. Expiry is enforced without relying on TTL deletion. New CSRF sessions are acknowledged before forms render; unavailable storage returns 503.

Authentication, recovery and action limits use namespace-scoped HMAC keys and atomic, database-timed counters. Multiple processes and restarts share allowances; expired windows reset immediately. Raw IPs/emails are not stored in buckets. Storage failure does not permit the protected action.

Production rejects untrusted/insecure proxy requests, uses host-only Secure/HttpOnly/SameSite=Lax cookies with root paths and `__Host-` names, and sends HSTS on HTTPS responses. CSP restricts scripts, styles, fonts, images, connections, forms, framing and base/object use. Receipt CSS is authorized by exact hashes rather than unsafe-inline; stored receipt revisions and offline printing remain intact. See [operational policy](persistent-security.md).

## Verification evidence

- Final `npm test`: 90 unit/model/template tests passed.
- Final full source check: 165 JavaScript files passed; the final CSP test synchronization edit also passed its focused syntax check.
- Final full `npm run test:integration`: 150 checks passed on disposable MongoDB 8.2.5 replica sets, including two independent Node processes and process replacements.
- Final focused configuration/security run: 21 checks passed, including explicit session/rate storage outages and production cookie/proxy flags. This count is not added to full-suite totals.
- Full Chromium desktop/mobile run: 44 browser tests passed. Four instrumentation/probe checks needed correction: receipt pages intentionally deny scripts, and deliberately blocked top-frame form navigation confused Playwright's navigation synchronization.
- Final accessibility rerun: four checks passed, including page-family audits and keyboard/reduced-motion checks with application CSP enforced. Receipts are inspected through trusted automation evaluation without changing their script prohibition.
- Final CSP probe rerun: two checks passed on desktop/mobile. Route-controlled local font fixtures loaded through the permitted CDN origins. Inline/foreign scripts and foreign form actions were blocked. The form refusal probe uses a subframe to keep main-page synchronization independent of the deliberately refused navigation.
- Across full and targeted runs, all 48 distinct browser scenarios have passing evidence. Reruns are not added to suite totals. Existing receipt tests confirmed hash-authorized CSS, reproducible downloads and A4 PDF printing.
- Git whitespace checks and representative rendered-layout review completed. No design identity or workflow quantity changes were introduced.

Restart tests preserve authentication and CSRF between independent processes and after replacing a process. Concurrent requests receive exactly one shared allowance; restart does not reset it. Untrusted forwarded client addresses cannot evade limiting. Expired sessions fail before cleanup. Logout rejects copied cookies, and stale session saves fail against tombstones. Stored security identifiers exclude raw session IDs/client IPs. Deliberate database write failures return 503 without granting access or performing the action.

The HTTPS-cookie probe uses an explicit callback stub only to inspect cookie/proxy flags; application/integration stores remain real MongoDB stores. Private synthetic session setup is guarded to isolated test mode and has no web endpoint. Browser axe assets are copied only into the disposable runtime; no test instrumentation is shipped in public source assets. The bounded production-probe subprocess timeout was increased to 30 seconds for Windows startup variability; the standalone probe and final checks pass.

Logs are in ignored `artifacts/logs`, including `day21-final-security.log`, `day21-final-browser.log` and `day21-final-csp.log`. Browser reports retain the full-run results; final targeted logs record the corrected checks.

## Preserved data and remaining limits

Existing application data, uploads, `.env`, stored receipt revisions and unrelated `Readme1.md` are preserved. No production data migration, remote push, PR or deployment is part of this stage. The first launch requires fresh sign-in for pre-Day-21 memory/JWT-only sessions. Security TTL indexes are initialized at startup in the configured database; no existing business record is rewritten.

The reviewed runtime's UI files were refreshed. Application port 4000 and development database port 27018 remain stopped. Its helper continues to select isolated development data and disable real mail; ordinary `npm start` does not select that runtime.

Actual production HTTPS/TLS/proxy behavior, hosted CI, real font-provider/mail delivery, other browser engines, physical devices/screen readers and earlier research/dependency/asset-permission findings remain unverified or pending. TTL cleanup is asynchronous, and already-admitted operations can finish after logout/revocation. IP limits do not establish complete distributed-abuse protection. Durable private uploads remain Day 22.
