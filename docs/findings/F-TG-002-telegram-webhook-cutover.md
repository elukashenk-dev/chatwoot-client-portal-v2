# F-TG-002: Telegram webhook cutover

- status: open
- found_in: Full application risk audit 2026-07-13; candidate INT-003 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: medium
- urgency: Fix before the next release or feature slice that relies on this boundary.
- area: Telegram webhook cutover
- confidence: high
- evidence: `backend/src/modules/telegram-bridge-admin/service.ts:161-205,336-371`; `backend/src/telegram-bridge/configRepository.ts:183-192`; `backend/src/telegram-bridge/server.ts:82-121`
- failure_path: Telegram can own the new webhook before config activation; `rotating` is returned as disabled/ignored 200, so updates delivered in the gap are permanently acknowledged and dropped
- counterevidence: Setup is privileged/low-frequency, verifies health and can be rerun; already acknowledged updates cannot be recovered
- load_impact: No separate hot-path load increase was established; the primary impact is the failure path above.
- fix_short: Inject failure after confirmed `setWebhook`; require committed generation processing or retryable 503 until activation
- acceptance: Inject failure after confirmed `setWebhook`; require committed generation processing or retryable 503 until activation Add the targeted regression coverage for this boundary and pass the required lint/build/test and review closure gates.
