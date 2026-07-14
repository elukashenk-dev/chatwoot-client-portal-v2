# F-LOAD-003: Multi-instance realtime locality

- status: deferred
- found_in: Full application risk audit 2026-07-13; candidate LOAD-001 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: medium
- urgency: Complete before enabling more than one production backend replica.
- area: Multi-instance realtime locality
- confidence: high
- evidence: `backend/src/app.ts:137`; `backend/src/modules/chat-realtime/hub.ts:64-188`; `backend/src/modules/chatwoot-webhooks/service.ts`; `frontend/src/features/chat/pages/useChatRealtimeHealthFallback.ts`
- failure_path: With two replicas, an SSE stream on A does not receive a webhook published only to B's process-local hub; message repair waits for visible fallback and typing is lost
- counterevidence: Reference compose is single-instance; DB unread/push state is shared; visible selected messages have a 30-second health fallback
- load_impact: With two replicas, an SSE stream on A does not receive a webhook published only to B's process-local hub; message repair waits for visible fallback and typing is lost
- fix_short: Cross-route SSE/webhook between two processes and require bounded shared broker/log delivery, reconnect and backpressure semantics
- acceptance: Cross-route SSE/webhook between two processes and require bounded shared broker/log delivery, reconnect and backpressure semantics Add the targeted regression coverage for this boundary and pass the required lint/build/test and review closure gates.
