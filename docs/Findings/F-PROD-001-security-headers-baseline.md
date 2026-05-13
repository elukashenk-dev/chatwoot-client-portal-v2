# F-PROD-001. Production Security Headers Baseline

- `status`: `open`
- `found_in`: Security & Production Hardening Review
- `risk`: `low`
- `urgency`: next production hardening pass
- `area`: production reverse proxy, frontend/PWA browser security
- `evidence`:
  - `infra/production/Caddyfile` now defines `Strict-Transport-Security`, `Content-Security-Policy` and `Permissions-Policy`.
  - `scripts/check-code-health.mjs` now fails if those production Caddyfile headers are removed.
  - The repo-side fix still needs production deploy verification because read-only `curl -I https://lk.provgroup.ru/auth/login` originally confirmed those headers were absent in the deployed response.
  - Read-only inspection of `/etc/nginx/sites-enabled/chatwoot-client-portal-v2.conf` showed TLS termination/proxying but no compensating `add_header` rules for these headers.
- `fix_short`: Deploy the reviewed Caddyfile header baseline and verify the public production response includes HSTS, CSP and Permissions-Policy.
- `acceptance`:
  - `curl -I https://lk.provgroup.ru/auth/login` shows the agreed HSTS, CSP and Permissions-Policy headers.
  - API and SSE routes continue to work through the reverse proxy.
  - The PWA service worker, manifest, static assets and voice recorder microphone flow still work after the CSP/Permissions-Policy change.
