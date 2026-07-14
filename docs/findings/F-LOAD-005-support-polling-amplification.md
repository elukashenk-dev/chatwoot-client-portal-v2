# F-LOAD-005: Support availability polling

- status: open
- found_in: Full application risk audit 2026-07-13; candidate LOAD-003 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: medium
- urgency: Fix before the next release or feature slice that relies on this boundary.
- area: Support availability polling
- confidence: high
- evidence: `frontend/src/features/chat/pages/useChatSupportAvailability.ts:7,109-126`; `backend/src/modules/chat-support/service.ts:63-79`
- failure_path: Each online tab, including hidden tabs, generates two Chatwoot calls every 30 seconds for tenant-wide state with no shared cache or singleflight
- counterevidence: Calls are fixed at two, timed out and stale React results are fenced
- load_impact: Each online tab, including hidden tabs, generates two Chatwoot calls every 30 seconds for tenant-wide state with no shared cache or singleflight
- fix_short: Pause hidden polling; add short tenant-scoped cache/singleflight and test provider-call counts under tab concurrency and slow/failing responses
- acceptance: Pause hidden polling; add short tenant-scoped cache/singleflight and test provider-call counts under tab concurrency and slow/failing responses Add the targeted regression coverage for this boundary and pass the required lint/build/test and review closure gates.
