# F-SEC-001: Public login email lookup can perform tenant-sized database work because its normalization expression does not match the available index

- status: open
- found_in: Full application risk audit 2026-07-13; canonical Codex Security finding SEC-STD-A03-001 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: low
- urgency: Schedule a bounded fix before scale or exposure increases in this boundary.
- area: security / resource-exhaustion
- confidence: medium
- canonical_security_finding: SEC-STD-A03-001; generated writeup findings/sec-std-a03-001/sec-std-a03-001.md
- evidence: backend/src/modules/auth/routes.ts:67-67; backend/src/modules/auth/service.ts:278-278; backend/src/modules/auth/repository.ts:80-80; backend/src/db/schema.ts:45-45. findUserByEmail evaluates lower(portal_users.email) = normalizedEmail while PostgreSQL is given only a raw (tenant_id, email) index. For an absent value, and potentially for late matches, the database may have to inspect every candidate email in that tenant instead of performing a full-key index seek.
- failure_path: public login request -> normalized email -> lower(email) tenant lookup -> tenant-sized row/index filtering -> PostgreSQL/pool CPU and latency -> authentication or shared-service degradation
- counterevidence: backend/src/modules/auth/rateLimit.ts:92-131 limits the route per process, tenant, and request IP (default five per minute), and backend/src/db/schema.ts:45-48 indexes tenant_id as the first key. These controls reduce per-source request rate and avoid a repository-wide scan, but they do not make the lower(email) predicate index-seekable or impose a shared per-tenant budget across instances and source addresses.
- load_impact: public login request -> normalized email -> lower(email) tenant lookup -> tenant-sized row/index filtering -> PostgreSQL/pool CPU and latency -> authentication or shared-service degradation
- fix_short: The invariant to restore is simple: the equality key used in the public login query must be represented by the leading keys of a tenant-scoped index. A miss should require one selective lookup, not evaluation across all users belonging to the tenant.
- acceptance: Reproduce SEC-STD-A03-001, restore the stated invariant, add a targeted regression test, and pass the required lint/build/test and review closure gates.
