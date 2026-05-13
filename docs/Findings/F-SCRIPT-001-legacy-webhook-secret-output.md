# F-SCRIPT-001. Legacy Webhook Script Secret Output

- `status`: `open`
- `found_in`: Security & Production Hardening Review
- `risk`: `low`
- `urgency`: before reusing legacy webhook helper scripts in production operations
- `area`: backend scripts, operator tooling, secret handling
- `evidence`:
  - Current tenant-aware production installer uses `configure-tenant-chatwoot-webhook.ts`, which prints a safe report with `hasSecret` and does not print the secret value.
  - The legacy `backend/src/scripts/configure-chatwoot-account-webhook-core.ts` still has `formatInstallerWebhookOutput()` that includes `WEBHOOK_SECRET=${singleLine(result.secret)}`.
  - `backend/src/scripts/configure-chatwoot-account-webhook.ts` can also write the returned webhook secret to `../.env` when run with `--write-env`.
- `fix_short`: Retire the legacy global account webhook script or remove plaintext secret output and parent-directory `.env` writes from its supported modes.
- `acceptance`:
  - No supported production webhook helper prints a raw webhook secret to stdout.
  - No helper writes secrets outside the current v2 repository/env file by default.
  - Tests or script-level checks verify redacted output for webhook configuration reports.
