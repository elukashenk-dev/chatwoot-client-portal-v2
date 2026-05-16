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
- `decision`: Tenant admin verification will use a separate per-tenant encrypted Chatwoot admin-verification token in MT-9, for example `chatwoot_admin_verification_token_ciphertext`. The runtime Chatwoot token must not become implicit admin authority, and provisioning/platform-admin tokens must not be used for tenant admin login.
- `fix_short`: Keep this deferred until MT-9 implementation. Do not add an admin-verification token in MT-1. Before MT-9 implementation, run a Chatwoot permissions spike to verify the exact Agents API permissions, response fields and failure modes for the selected separate per-tenant admin-verification token strategy. Keep the browser out of Chatwoot authority in all cases.
- `acceptance`:
  - MT-1 schema has no admin-verification token field.
  - MT-9 starts with a documented Chatwoot permissions spike for the selected separate per-tenant admin-verification token strategy.
  - MT-9 schema stores the separate token as an encrypted tenant secret.
  - MT-9 docs/code define the token boundary explicitly.
  - Tenant admin verification never uses the runtime Chatwoot token or platform/provisioning token as implicit login authority.
  - Tenant admin login tests cover insufficient Chatwoot token permission and cross-tenant admin attempts.
