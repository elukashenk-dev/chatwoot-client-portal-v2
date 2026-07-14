# F-LOAD-001: Admin session write amplification

- status: open
- found_in: Full application risk audit 2026-07-13; candidate ARCH-005 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: medium
- urgency: Fix before the next release or feature slice that relies on this boundary.
- area: Admin session write amplification
- confidence: high
- evidence: `backend/src/modules/tenant-admin/adminAuthService.ts:59-79`; `backend/src/modules/tenant-admin/adminAuthRepository.ts:423-435`; protected guard call sites in branding/legal/Telegram routes
- failure_path: Every authenticated admin request performs SELECT plus UPDATE on the same session row, causing per-tab WAL writes and a hot row at 10x/100x
- counterevidence: Admin traffic is lower than customer traffic and update is primary-key/tenant scoped
- load_impact: Every authenticated admin request performs SELECT plus UPDATE on the same session row, causing per-tab WAL writes and a hot row at 10x/100x
- fix_short: Define bounded touch interval or remove write; prove repeated checks inside interval do not update
- acceptance: Define bounded touch interval or remove write; prove repeated checks inside interval do not update Add the targeted regression coverage for this boundary and pass the required lint/build/test and review closure gates.
