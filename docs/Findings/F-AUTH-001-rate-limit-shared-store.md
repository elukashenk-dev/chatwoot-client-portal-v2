# F-AUTH-001. Auth Rate Limit Shared Store

- `status`: `deferred`
- `found_in`: backend rate limiting fix follow-up review
- `risk`: `low`
- `urgency`: before running multiple backend instances behind a load balancer
- `area`: backend auth, public auth endpoint rate limiting, deployment scaling
- `evidence`:
  - `backend/src/modules/auth/rateLimit.ts` keeps auth rate limit buckets in an in-memory `Map` created inside `registerAuthRateLimit`.
  - The current key includes route group, tenant or host, and request IP, which is sufficient for a single backend process.
  - If the portal backend is horizontally scaled to multiple processes or containers, each process will have an independent counter and the limit will no longer be global.
- `fix_short`: Move auth rate limit state to a shared store, for example Redis, or configure Fastify rate limiting with a shared backend before multi-instance deployment.
- `acceptance`:
  - Auth rate limit counters are shared across all backend instances for the same route group, tenant or host, and IP.
  - `Retry-After` and `RATE_LIMITED` behavior remain unchanged for clients.
  - Tests cover the shared-store limiter behavior through a fake/shared store.
  - Single-instance local development still works without requiring production infrastructure.
