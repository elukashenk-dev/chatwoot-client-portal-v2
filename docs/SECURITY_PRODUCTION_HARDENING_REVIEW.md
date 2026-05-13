# Security & Production Hardening Review

- `review_date`: 2026-05-13
- `scope`: `main@7bf94fe9159c9bc7a05fc0ffd79863f3cb01a71a`
- `production`: `https://lk.provgroup.ru`
- `mode`: read-only security and production posture review
- `result`: no critical/high findings found

## Executive Summary

Backend architecture is in good shape for the current dedicated one-tenant production deployment on a tenant-aware foundation. The strongest areas are backend-owned Chatwoot authority, tenant-scoped persistence, signed `HttpOnly` session cookies, origin checks on state-changing browser endpoints, Chatwoot webhook signature validation, and encrypted tenant Chatwoot secrets.

The highest remaining risks are availability and production hardening rather than direct data compromise: unbounded authenticated SSE subscriptions, missing browser security headers in production, release-source drift between deployed `main` and `origin/main`, and a legacy webhook helper that can still print a webhook secret if manually used.

## Threat Model

Primary assets:

- portal session cookies and session token hashes;
- tenant Chatwoot runtime token and webhook secret;
- tenant public identity, domain and Chatwoot account/inbox mapping;
- portal users, Chatwoot contact links and conversation mappings;
- verification codes and continuation tokens for registration/password reset;
- message send authority, attachment upload payloads and SSE realtime snapshots;
- production `.env.production`, Docker network boundaries and deploy provenance.

Trust boundaries:

- public browser to portal backend over same-origin `/api`;
- `Host`/proxy headers to tenant resolver;
- portal backend to isolated portal PostgreSQL;
- portal backend to Chatwoot API using backend-only tokens;
- Chatwoot webhook callback to portal backend using HMAC signature and timestamp;
- backend SSE stream to authenticated browser;
- operator/deploy scripts to production VM.

Severity calibration:

- `critical`: token theft, cross-tenant read/send, RCE, forged cross-tenant webhook delivery;
- `high`: protected endpoint authz bypass, password reset compromise, exposed backend/Postgres/secrets;
- `medium`: authenticated availability abuse, MT-9 admin-token boundary, significant tenant isolation regression;
- `low`: production header baseline, release provenance drift, operator-script secret hygiene, future scaling hardening.

## Validated Findings

| Severity | Finding | Area | Summary |
| --- | --- | --- | --- |
| medium | `F-SSE-001` | SSE realtime | Authenticated users can open unbounded concurrent SSE subscriptions for the same chat. |
| medium | `F-MT-004` | MT-9 admin auth | Tenant admin verification still requires the planned separate encrypted admin-verification token boundary before MT-9 admin login. |
| low | `F-PROD-001` | production headers | Current production responses lack HSTS, CSP and Permissions-Policy. |
| low | `F-PROD-002` | release control | Production deployed commit is clean locally but not present on `origin/main`. |
| low | `F-SCRIPT-001` | scripts/secrets | Legacy global webhook helper can print plaintext webhook secret if manually run in installer-output mode. |
| low | `F-AUTH-001` | auth rate limiting | In-memory auth rate limit is acceptable for one backend process, not multi-instance global limiting. |
| low | `F-CHATWOOT-001` | Chatwoot requests | Chatwoot request timeout is fixed at 15 seconds, not env-tunable. |

## Suppressed Candidates

- Chatwoot browser authority: suppressed. Frontend uses same-origin `/api` and no direct `api_access_token`; backend injects Chatwoot token only in `backend/src/integrations/chatwoot/client.ts`.
- CSRF on state-changing browser endpoints: suppressed. Auth, registration, password reset and chat send routes call `assertAllowedTenantOrigin()`, while cookies are `SameSite=Lax`, `Secure` in production and `HttpOnly`.
- Tenantless DB access in runtime routes: suppressed. Runtime repositories are constructed with `tenantId`, and auth/session/chat queries include tenant/user/conversation scoping.
- Webhook forgery/replay: suppressed. Webhooks use raw-body HMAC with timestamp tolerance, tenant account/inbox invariant checks, tenant-scoped conversation mapping and tenant-scoped delivery-key dedupe.
- Attachment path traversal: suppressed. Uploads are read into memory and forwarded to Chatwoot; portal does not write user filenames to disk.
- PWA API caching: suppressed. Service worker bypasses `/api/*` and tenant dynamic metadata requests.

## Production Read-Only Checks

- `https://chat.provgroup.ru/api`: `queue_services=ok`, `data_services=ok`, Chatwoot `4.13.0`.
- `https://lk.provgroup.ru/api/health`: production health `ok`.
- `https://lk.provgroup.ru/api/tenant`: tenant `provgroup`.
- `https://lk.provgroup.ru/auth/login`: HTTP 200, `Cache-Control: no-store`, `Referrer-Policy`, `X-Content-Type-Options`, `X-Frame-Options`; missing HSTS/CSP/Permissions-Policy.
- Production `DEPLOY_SOURCE.txt`: clean deploy from `main@7bf94fe9159c9bc7a05fc0ffd79863f3cb01a71a`.
- Production compose: `portal-backend` and `portal-db` healthy; `portal-web` running; backend and Postgres are not publicly bound by compose.
- Host nginx: public TLS terminates at nginx and proxies to `127.0.0.1:8088`.

## MT-9 Readiness

Current production can continue without a critical/high blocker. MT-9 can start only if its first backend slice closes or explicitly gates `F-MT-004`: tenant admin verification must use a separate encrypted per-tenant admin-verification token and must not reuse the runtime Chatwoot token as implicit admin authority.

`F-SSE-001` is not specific to MT-9, but should be prioritized before heavier production usage because tenant admins and normal users will increase concurrent browser sessions.

## Test And Coverage Notes

Existing automated coverage is strong around tenant-aware auth, chat runtime, Chatwoot integration mocks, webhook signature/invariants, frontend auth/chat flows and PWA service worker behavior.

Recommended additional tests:

- SSE cap behavior and disconnect cleanup for `F-SSE-001`;
- production header smoke check after `F-PROD-001`;
- script output redaction test for `F-SCRIPT-001`;
- MT-9 admin-token boundary tests before tenant admin implementation.

## Do Not Touch

- Do not reuse or read the retired `../chatwoot-client-portal`.
- Do not widen browser authority to direct Chatwoot APIs or tokens.
- Do not repurpose the runtime Chatwoot token for tenant admin verification.
- Do not merge MT-9 admin/branding until the admin-token boundary is explicit.
- Do not change production env, DB schema, migrations, Chatwoot core or containers as part of this review.

## Recommendation

No critical/high security blocker was found. Current production hardening is acceptable for the dedicated one-tenant deployment, with the findings above tracked before broader usage. For MT-9, close `F-MT-004` first, then handle `F-SSE-001` and the low production hardening backlog in priority order.
