# Account recovery and email verification

Day 19 adds email ownership verification and password recovery for active donors, NGO members and administrators. Organization verification remains a separate administrative decision.

## Participant behavior

Registration attempts a verification email without blocking sign-in if mail is unavailable. Signed-in accounts can review status and resend at `/account/email`. Verification links expire after 24 hours. A GET opens a confirmation form; a CSRF-protected POST consumes the link. Email ownership is required to create a new donor listing or NGO equipment request. Browsing, onboarding, existing listing edits, decisions, pickup, handover, receipts and cancellation retain their existing role/organization/ownership gates. Existing accounts are not silently marked verified.

`/forgot-password` serves every role, including administrators. Responses are identical for missing, inactive and eligible accounts, independent of delivery completion. Reset links expire after 30 minutes. Passwords must match, contain at least 8 characters and fit in bcrypt's 72-byte UTF-8 input limit. Successful reset revokes all earlier signed authentication cookies and destroys the resetting browser's session. Users sign in again; administrators continue using the administrator portal. Recovery never changes role or reactivates a suspended account.

## Credential and request boundaries

Credentials use 32 random bytes. Only SHA-256 digests, the account email, expiry and issuance time are stored in the user record; credential fields are excluded by default and removed from JSON serialization. Atomic conditional updates bind consumption to account, purpose, current email and expiry. Replayed links and concurrent losers cannot change the account. Expired fields may remain until replaced but are unusable; no credential backfill is needed.

JWTs include `authVersion`; protected and guest-only middleware compare it against the current user record. Older records/tokens without a version are treated as version zero. The first reset increments the account version, invalidating older cookies. This does not cancel an operation that already passed authentication before the reset.

Issuance has a database-backed 60-second per-account/per-purpose cooldown, including failed delivery. Resend atomically replaces the previous credential. Recovery routes share an IP allowance of 10 requests per 15 minutes; link-form GETs also consume this allowance. The IP store remains process-local until Day 21; its address count is bounded. CSRF validation applies to all mutations. Link pages are private/no-store and use `Referrer-Policy: no-referrer`. Do not log URL queries or raw token values in a future proxy/access logger.

## Delivery, retry and support

Account mail goes directly to the user's address, using the existing `MAIL_SERVICE`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM` and trusted `APP_URL` origin. It does not send credentials to `MAIL_RECIPIENTS`; that existing setting is still required by runtime configuration for other mail features. Mail links never derive their origin from request headers. Provider timeouts are bounded.

Recovery mail is transactional account mail, independent of the optional lifecycle notification preference. It uses best-effort immediate delivery, without a durable account-mail outbox. Registration/recovery attempts run in the application process; process shutdown can lose an unfinished attempt. Provider acceptance does not prove inbox delivery. Users should check spam, wait at least one minute, then resend/request a new reset. Every new link invalidates the previous link for that purpose. A provider acknowledgement lost after sending can mean an email arrived despite a failure report.

When mail is disabled or fails, no raw link is exposed in the UI or logs. Signed-in verification reports unavailable delivery. Public recovery preserves the neutral response. The Contact page is the user support entry point; it can itself be unavailable when mail is disabled, and accurately reports that limitation. Operators must restore mail configuration/provider access and ask the user to retry; do not manually set verification or send raw credentials as a workaround. No mailbox polling, scheduled retry worker or automatic support ticket is claimed.

Keep testing isolated with blank mail credentials. Real provider/mailbox delivery, deployed proxy logs, HTTPS infrastructure and hosted CI require external verification.
