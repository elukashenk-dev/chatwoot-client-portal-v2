# F-MT-004. Tenant Admin Chatwoot Token Boundary

- `status`: `deferred`
- `found_in`: `MT-0 architecture review`
- `risk`: `medium`
- `urgency`: before `MT-9 Tenant Admin And Branding Rebuild`
- `area`: tenant admin, Chatwoot integration, token policy
- `evidence`:
  - The plan prefers least-privilege per-tenant Chatwoot Application API tokens for runtime.
  - The planned tenant admin login calls the tenant Chatwoot Agents API and requires administrator role and confirmed email.
  - Chatwoot Application API tokens are user access tokens and endpoint access depends on that user's permissions. A minimal runtime token may be intentionally unable to list agents, while a token broad enough for admin verification may be too privileged for normal chat runtime.
- `fix_short`: Keep this deferred until MT-9. Do not add an admin-verification token in MT-1. Before MT-9, run a Chatwoot permissions spike and decide whether tenant admin verification uses the same tenant runtime token if safe, a separate tenant admin-verification token, or a provisioning/platform-admin approach. Keep the browser out of Chatwoot authority in all cases.
- `acceptance`:
  - MT-1 schema has no admin-verification token field.
  - MT-9 starts with a documented Chatwoot permissions spike.
  - MT-9 docs/code define the token boundary explicitly.
  - Tenant admin login tests cover insufficient Chatwoot token permission and cross-tenant admin attempts.
