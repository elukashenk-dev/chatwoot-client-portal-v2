# Full Application Risk Audit Coverage Matrix

| Surface                   | Risk area                                                          | Static review | Dynamic validation | Outcome         | Evidence artifact | Limitations             |
| ------------------------- | ------------------------------------------------------------------ | ------------- | ------------------ | --------------- | ----------------- | ----------------------- |
| Tenant resolution         | Host normalization, tenant lifecycle, fail-closed routing          | not_started   | not_started        | Needs follow-up | `manifest.md`     | Audit stage has not run |
| Customer auth/session     | Login, email-code proof, cookies, expiry and rotation              | not_started   | not_started        | Needs follow-up | `manifest.md`     | Audit stage has not run |
| Tenant-admin auth/session | Chatwoot administrator verification and separate session authority | not_started   | not_started        | Needs follow-up | `manifest.md`     | Audit stage has not run |
| Database/migrations       | Tenant scoping, constraints, indexes and migration consistency     | not_started   | not_started        | Needs follow-up | `manifest.md`     | Audit stage has not run |
| Chatwoot runtime client   | Token ownership, API contracts, timeouts and error mapping         | not_started   | not_started        | Needs follow-up | `manifest.md`     | Audit stage has not run |
| Chat threads/messages     | Access, bootstrap, transcript, send idempotency and attachments    | not_started   | not_started        | Needs follow-up | `manifest.md`     | Audit stage has not run |
| Webhooks/realtime         | Signature, dedupe, routing, SSE admission and fanout               | not_started   | not_started        | Needs follow-up | `manifest.md`     | Audit stage has not run |
| Notifications/push        | Recipient authority, unread state and push delivery                | not_started   | not_started        | Needs follow-up | `manifest.md`     | Audit stage has not run |
| Profile/avatars           | Linked-contact authority, uploads and proxy access                 | not_started   | not_started        | Needs follow-up | `manifest.md`     | Audit stage has not run |
| Branding/legal/storage    | Tenant ownership, uploads, public reads and object lifecycle       | not_started   | not_started        | Needs follow-up | `manifest.md`     | Audit stage has not run |
| Telegram bridge           | Secret boundaries, update dedupe, identity linking and retries     | not_started   | not_started        | Needs follow-up | `manifest.md`     | Audit stage has not run |
| Frontend routing/state    | Route contracts, auth boundaries and stale state                   | not_started   | not_started        | Needs follow-up | `manifest.md`     | Audit stage has not run |
| Offline/PWA               | Cache identity, IndexedDB, outbox, service worker and recovery     | not_started   | not_started        | Needs follow-up | `manifest.md`     | Audit stage has not run |
| Load/scalability          | Query frequency, boundedness, fanout and multi-instance behavior   | not_started   | not_started        | Needs follow-up | `manifest.md`     | Audit stage has not run |
| Dependencies/CI           | Supported versions, advisories and automated gates                 | not_started   | not_started        | Needs follow-up | `manifest.md`     | Audit stage has not run |
| Deploy/backup/restore     | Environment propagation, rollback and recoverability               | not_started   | not_started        | Needs follow-up | `manifest.md`     | Audit stage has not run |
| Documentation alignment   | Code, architecture, roadmap and runbook consistency                | not_started   | not_started        | Needs follow-up | `manifest.md`     | Audit stage has not run |
