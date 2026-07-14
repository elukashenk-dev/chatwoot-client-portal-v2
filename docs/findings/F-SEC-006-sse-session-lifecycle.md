# F-SEC-006: Established SSE streams can receive message snapshots after session expiry, revocation, or portal-user deactivation

- status: open
- found_in: Full application risk audit 2026-07-13; canonical Codex Security finding SEC-STD-A09-001 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: medium
- urgency: Fix before the next release that changes or expands this security boundary.
- area: security / session-lifecycle
- confidence: high
- canonical_security_finding: SEC-STD-A09-001; generated writeup findings/sec-std-a09-001/sec-std-a09-001.md
- evidence: backend/src/modules/chat-realtime/routes.ts:44-79; backend/src/modules/chat-threads/service.ts:93-105; backend/src/modules/chat-realtime/hub.ts:91-123; backend/src/modules/chatwoot-webhooks/service.ts:196-204. Admission-time session validation is not bound to the subscription lifecycle. Later message authorization is reconstructed from userId and Chatwoot contact attributes, and the existing contact-link path does not check the active portal-user state or session validity.
- failure_path: The initial GET is correctly authenticated and authorized for the current thread. The hub retains no session token hash, session id, expiry, or active-user predicate. Logout, expiry, or deactivation does not close an already hijacked response. A mapped message webhook invokes a snapshot builder for the stored userId. The existing contact link still resolves and current Chatwoot attributes can remain enabled, so the latest message page is written to the stale stream.
- counterevidence: New HTTP admissions require an unexpired session and active user, and the repository already exposes findActivePortalUserContactLinkByUserId. Message fanout also skips a non-ready snapshot. The subscription has no session reference/expiry, and runtime uses findContactLinkByUserId instead of the active-user helper, so those controls are absent from the event path.
- load_impact: No separate load effect beyond the security failure path was established.
- fix_short: Restore this invariant: **before writing any sensitive SSE event, the backend must confirm that the exact customer session which admitted that subscription is still unexpired and unrevoked, and that its portal user is still active in the same tenant**. Rebuilding only thread access from `userId` is not a substitute for that session check.
- acceptance: Reproduce SEC-STD-A09-001, restore the stated invariant, add a targeted regression test, and pass the required lint/build/test and review closure gates.
