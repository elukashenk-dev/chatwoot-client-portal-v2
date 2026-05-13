# F-PROD-001. Production Security Headers Baseline

- `status`: `open`
- `found_in`: Security & Production Hardening Review
- `risk`: `low`
- `urgency`: next production hardening pass
- `area`: production reverse proxy, frontend/PWA browser security
- `evidence`:
  - `infra/production/Caddyfile` sets `Referrer-Policy`, `X-Content-Type-Options` and `X-Frame-Options`, but does not set `Strict-Transport-Security`, `Content-Security-Policy` or `Permissions-Policy`.
  - Read-only `curl -I https://lk.provgroup.ru/auth/login` confirmed those headers are absent in the current production response.
  - Read-only inspection of `/etc/nginx/sites-enabled/chatwoot-client-portal-v2.conf` showed TLS termination/proxying but no compensating `add_header` rules for these headers.
- `fix_short`: Add a reviewed production header baseline either at host nginx or Caddy. Start with HSTS after confirming HTTPS-only rollout, a conservative CSP compatible with Vite assets and inline-free React, and a minimal `Permissions-Policy`.
- `acceptance`:
  - `curl -I https://lk.provgroup.ru/auth/login` shows the agreed HSTS, CSP and Permissions-Policy headers.
  - API and SSE routes continue to work through the reverse proxy.
  - The PWA service worker, manifest and static assets still load after the CSP change.
