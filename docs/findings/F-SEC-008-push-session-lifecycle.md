# F-SEC-008: Push subscriptions outlive session expiry and logout, extending a stolen session into persistent chat-metadata delivery

- status: open
- found_in: Full application risk audit 2026-07-13; canonical Codex Security finding SEC-STD-A10-003 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: low
- urgency: Schedule a bounded fix before scale or exposure increases in this boundary.
- area: security / session-lifecycle
- confidence: high
- canonical_security_finding: SEC-STD-A10-003; generated writeup findings/sec-std-a10-003/sec-std-a10-003.md
- evidence: backend/src/modules/chat-notifications/routes.ts:298-318; backend/src/modules/chat-notifications/pushDeliveryService.ts:162-228; backend/src/modules/auth/service.ts:312-323. Push authority is an indefinitely active user row, not bounded to the registering session, a server-side expiration, or logout/revocation lifecycle. Active rows are never age-cleaned; only disabled/expired rows are eligible for maintenance deletion.
- failure_path: A valid session registers an endpoint controlled by the temporary session holder. Logout/session expiry changes no push-subscription state. Future mapped messages resolve the still-active victim and visible thread. The service encrypts and sends routing/unread metadata to the attacker's retained endpoint.
- counterevidence: Recipient resolution requires an active portal user/current membership and delivery rechecks visible threads. Cleanup removes only disabled/expired subscriptions, so session revocation alone does not close the registered endpoint.
- load_impact: No separate load effect beyond the security failure path was established.
- fix_short: To close the gap, we restore a straightforward invariant: an active push subscription must have a revocable authorization grant, and delivery must prove that grant is still live in addition to proving tenant, user, and thread access. The grant must not silently outlive the session that created it unless the product explicitly defines, bounds, and presents a separate durable device-notification authorization to the user.
- acceptance: Reproduce SEC-STD-A10-003, restore the stated invariant, add a targeted regression test, and pass the required lint/build/test and review closure gates.
