# F-TG-001: Telegram external-effect replay

- status: open
- found_in: Full application risk audit 2026-07-13; candidate INT-002 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: medium
- urgency: Fix before the next release or feature slice that relies on this boundary.
- area: Telegram external-effect replay
- confidence: high
- evidence: `backend/src/telegram-bridge/service.ts:303-460`; `backend/src/telegram-bridge/updateDedupeRepository.ts:155-237`; official Telegram webhook retry and Chatwoot v4.15.1 non-unique source ID
- failure_path: Chatwoot/Telegram may accept an effect before the portal sees success; failed or stale delivery state is reacquired and repeats the same prompt/message/link effect
- counterevidence: Successful processed rows dedupe normally; a post-effect mark failure returns 200 to avoid an immediate retry
- load_impact: No separate hot-path load increase was established; the primary impact is the failure path above.
- fix_short: Reproduce post-accept timeout and lost-response/post-effect-DB-failure schedules; require one authoritative external effect
- acceptance: Reproduce post-accept timeout and lost-response/post-effect-DB-failure schedules; require one authoritative external effect Add the targeted regression coverage for this boundary and pass the required lint/build/test and review closure gates.
