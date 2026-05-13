# F-CHATWOOT-001. Chatwoot Request Timeout Config

- `status`: `deferred`
- `found_in`: Chatwoot outbound request timeout fix follow-up review
- `risk`: `low`
- `urgency`: when production telemetry shows slow Chatwoot send, upload, or attachment operations, or before environment-specific timeout tuning is needed
- `area`: backend Chatwoot integration, outbound request timeout, runtime configuration
- `evidence`:
  - `backend/src/integrations/chatwoot/request.ts` uses `DEFAULT_CHATWOOT_REQUEST_TIMEOUT_MS = 15_000`.
  - `normalizeChatwootRequestTimeoutMs` accepts an override in code, but the portal app does not currently expose an env-backed setting for operators.
  - The fixed 15 second timeout is a reasonable baseline, but production deployments may need a different value if Chatwoot attachment uploads or message sends are consistently slower.
- `fix_short`: Add a validated env setting such as `CHATWOOT_REQUEST_TIMEOUT_MS`, pass it into the Chatwoot client factory, and keep the current 15 second value as the default.
- `acceptance`:
  - Backend config validates `CHATWOOT_REQUEST_TIMEOUT_MS` as a positive number when provided.
  - Chatwoot client creation receives the configured timeout without changing browser-facing behavior.
  - Invalid timeout config fails startup with a clear configuration error.
  - Tests cover default timeout, configured timeout, and invalid timeout values.
