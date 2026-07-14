# F-SEC-012: Message-created retries perform tenant-wide unread recipient work before the delivery dedupe claim

- status: open
- found_in: Full application risk audit 2026-07-13; canonical Codex Security finding SEC-STD-A13-001 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: low
- urgency: Schedule a bounded fix before scale or exposure increases in this boundary.
- area: security / resource-amplification
- confidence: high
- canonical_security_finding: SEC-STD-A13-001; generated writeup findings/sec-std-a13-001/sec-std-a13-001.md
- evidence: backend/src/modules/chatwoot-webhooks/service.ts:374-374; backend/src/modules/chatwoot-webhooks/service.ts:381-381; backend/src/modules/chat-notifications/recipientResolver.ts:154-154; backend/src/modules/chat-notifications/recipientResolver.ts:155-155. The atomic tenant delivery-key check is ordered after recordMessageCreatedUnread. That call resolves group recipients with an unpaginated tenant-wide link query and one external Chatwoot lookup per active user before the handler can return duplicate.
- failure_path: valid mapped group message -> delayed/lost acknowledgement -> fresh signed retry -> tenant-wide active-link scan plus per-link Chatwoot lookup -> late duplicate result -> repeated backend/Chatwoot resource consumption
- counterevidence: chatwoot_webhook_deliveries has an atomic tenant_id + delivery_key unique index, unread rows have a tenant/user/thread/message unique index, and recipient contact lookups run five at a time. The delivery claim is too late to avoid the repeated reads/external calls, while unread uniqueness only prevents duplicate rows.
- load_impact: No separate load effect beyond the security failure path was established.
- fix_short: The invariant to restore is straightforward: for one tenant and delivery key, at most one worker may perform recipient resolution. The claim must happen before unread resolution, but it must also remain recoverable. Simply inserting an `accepted` row before unread work would introduce message loss: a crash or unread failure would make a legitimate retry look complete. The existing test that rejects the webhook when unread recording fails captures this requirement.
- acceptance: Reproduce SEC-STD-A13-001, restore the stated invariant, add a targeted regression test, and pass the required lint/build/test and review closure gates.
