# F-API-001: Public parser error mapping

- status: open
- found_in: Full application risk audit 2026-07-13; candidate BACK-008 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: low
- urgency: Schedule a bounded maintenance fix before this control is relied on as regression evidence.
- area: Public parser error mapping
- confidence: high
- evidence: `backend/src/lib/errors.ts:32-65`; local Fastify injection probe
- failure_path: Malformed or oversized JSON fails before route Zod and is mapped to `500 INTERNAL_ERROR` instead of controlled 400/413, distorting telemetry and retry behavior
- counterevidence: Response is generic and leaks no parser detail; multipart and Telegram handlers map their known errors
- load_impact: No separate hot-path load increase was established; the primary impact is the failure path above.
- fix_short: Map allowlisted Fastify parser/status errors and add malformed/oversized JSON injection tests
- acceptance: Map allowlisted Fastify parser/status errors and add malformed/oversized JSON injection tests Add the targeted regression coverage for this boundary and pass the required lint/build/test and review closure gates.
