# Persistent sessions, limits and browser security

Day 21 uses the existing MongoDB database for short-lived security state. No new package, Redis service or process-memory fallback is required.

## Sessions and authentication

`security_sessions` contains a SHA-256 session-ID key, serialized minimal session data and an expiry. Session data holds cookie settings, CSRF token and authenticated account ID/version. It excludes passwords, JWTs, emails, contacts and donation/beneficiary text. Restrict database access; these records remain security data.

Sessions roll with a 30-minute idle expiry. Reads explicitly reject expired records without waiting for TTL cleanup. JWTs retain their existing absolute 30-minute expiry. Authentication requires both a valid JWT and matching persisted login context, plus current account status/role/version checks.

Registration and sign-in regenerate sessions and persist login context before issuing authentication cookies. New CSRF sessions are acknowledged before usable forms render. Logout clears both cookies and destroys the login session. Password reset and moderation continue to invalidate prior authentication versions.

Logout/regeneration retains a 30-minute revocation tombstone without a session body. Stale concurrent saves cannot recreate that session. Already-admitted operations can still finish. Storage failures return a secret-safe 503 and never grant fallback authentication or render a new usable form.

The first launch after Day 21 requires fresh sign-in for earlier memory sessions and JWT-only authentication. Business records are preserved. Later restarts and simultaneous instances preserve valid sessions when they share the database and both signing secrets. Secret rotation intentionally invalidates credentials.

## Shared limits and expiry

`security_limits` uses HMAC keys derived from the session secret, namespace, policy and effective client address. Raw IPs/emails are not stored. Authentication, recovery and action allowances remain unchanged, including Contact's shared action allowance. Day 19's per-account email cooldown remains separate.

Atomic updates use MongoDB time to start/reset windows and increment bounded counters. Other processes and restarts share allowances. Expired buckets reset without waiting for deletion. Rejection returns 429 with Retry-After; unavailable storage returns 503 without executing the action. Synchronize application clocks for cookie expiry and retry guidance.

Startup creates/verifies `session_expiry` and `limit_expiry` TTL indexes with expiry-after-seconds zero. Credentials need appropriate collection/index/read/write permissions. Conflicting indexes fail startup rather than being silently dropped. TTL cleanup is asynchronous; correctness uses explicit expiry checks. Monitor security-state storage. These limits do not claim complete protection against distributed abuse.

## HTTPS, proxy trust and cookies

Production retains explicit trusted proxy IP/CIDR configuration and an HTTPS application origin. Requests not identified as HTTPS through that boundary are rejected, including a spoofed HTTPS forwarding header from an untrusted peer. Limiting uses the same trusted client-address calculation. The edge must correctly overwrite/append forwarding headers and restrict direct backend access.

Production uses `__Host-carecycle.sid` and `__Host-carecycle.token`: Secure, HttpOnly, SameSite=Lax, Path=/ and no Domain. Local HTTP development/test retains existing cookie names without Secure. HTTPS production responses send one-year HSTS, without subdomain/preload commitments. Actual TLS and edge routing require deployment verification.

## CSP and CSRF

Application pages default-deny resources. Scripts/connections are same-origin, with no inline scripts, handlers or eval. Styles allow local files and existing fonts.googleapis.com CSS; fonts allow local files and fonts.gstatic.com. Images allow local media and blob previews. Objects, foreign form destinations, base overrides and framing are denied. Dynamic responses are private/no-store and vary by cookie. Recovery keeps no-referrer.

Receipt downloads remain self-contained offline HTML. Their response policy allows only hashes of exact inline print-style blocks, normalizing HTML line endings for Windows. Scripts, objects, forms and framing remain disabled. Stored revisions are not rewritten; reproducible downloads and printing remain intact.

Session-bound CSRF checks remain on mutations/multipart uploads. Non-string tokens fail safely. Login/regeneration renews the form token; old tokens fail. CSP complements escaping and authorization rather than replacing them.

## Verification and operational limits

Tests use real stores and independent Node processes, including process replacement. Only the isolated HTTPS-cookie probe injects a callback stub; no runtime fallback exists. Synthetic-session helpers are private test setup, never web routes.

Browser checks enforce CSP. Test-only axe is served from the isolated runtime, without shipping in public assets. Receipt accessibility uses trusted automation evaluation because receipts intentionally prohibit scripts; their CSP is unchanged. Local, route-controlled font fixtures verify CDN permissions without claiming real CDN availability.

Production HTTPS/proxy behavior, hosted CI, real font-provider/mail delivery and other engines/physical devices remain external checks. Session/rate records are ephemeral security state; future restores must avoid restoring live authenticated sessions. Durable uploads remain Day 22.
