# F-LOAD-004: Thread-list refresh amplification

- status: open
- found_in: Full application risk audit 2026-07-13; candidate LOAD-002 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: medium
- urgency: Fix before the next release or feature slice that relies on this boundary.
- area: Thread-list refresh amplification
- confidence: high
- evidence: `frontend/src/features/chat/pages/useChatForegroundUnreadRefresh.ts:35-113`; `backend/src/modules/chat-threads/service.ts:310-357`; `backend/src/modules/chat-threads/repository.ts:229-325`
- failure_path: Every visible-tab 30-second refresh can repeat 21 Chatwoot calls, 21 conflicting inserts and 21 unchanged-row updates for a 20-group user
- counterevidence: Hidden tabs pause, one tab suppresses overlap, groups are capped at 20 and upstream calls have deadlines
- load_impact: Every visible-tab 30-second refresh can repeat 21 Chatwoot calls, 21 conflicting inserts and 21 unchanged-row updates for a 20-group user
- fix_short: Build bounded projection/TTL singleflight with change-only writes; assert call/write budgets at 1/10/100 concurrent refresh schedules
- acceptance: Build bounded projection/TTL singleflight with change-only writes; assert call/write budgets at 1/10/100 concurrent refresh schedules Add the targeted regression coverage for this boundary and pass the required lint/build/test and review closure gates.
