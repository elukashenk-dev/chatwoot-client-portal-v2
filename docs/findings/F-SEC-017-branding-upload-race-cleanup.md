# F-SEC-017: Concurrent same-kind branding uploads leave durable inactive objects and metadata

- status: open
- found_in: Full application risk audit 2026-07-13; canonical Codex Security finding SEC-STD-A15-001 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: low
- urgency: Schedule a bounded fix before scale or exposure increases in this boundary.
- area: security / race-condition-resource-leak
- confidence: high
- canonical_security_finding: SEC-STD-A15-001; generated writeup findings/sec-std-a15-001/sec-std-a15-001.md
- evidence: backend/src/modules/branding/routes.ts:206-206; backend/src/modules/branding/assetService.ts:129-129; backend/src/modules/branding/assetService.ts:132-132; backend/src/modules/branding/assetService.ts:146-146; backend/src/modules/branding/assetService.ts:155-155. The replacement operation lacks per-tenant-kind serialization or an atomic activation/displacement primitive. Unique object keys make every concurrent write durable, while cleanup uses only stale pre-operation state and cannot identify newly displaced concurrent uploads.
- failure_path: valid admin upload burst -> identical stale previousAsset snapshots -> unique S3 puts and metadata inserts -> last settings upsert wins -> stale cleanup misses new losers -> persistent shared storage/DB growth
- counterevidence: Exact tenant Origin, live admin session, 5 MiB per-file/request limits, generated tenant-prefixed keys, and best-effort deletion of the previously active asset constrain individual requests and cross-tenant writes. They do not bound request concurrency, serialize a kind, reclaim concurrent losers, or cap durable inactive assets.
- load_impact: No separate load effect beyond the security failure path was established.
- fix_short: The invariant to restore is: **activation must atomically return the asset that this activation displaced, and every displaced asset must enter a bounded, retryable cleanup path**. The decision must be serialized by tenant and asset kind. Reading `previousAsset` before the object write cannot satisfy that invariant because the value is stale by the time activation occurs.
- acceptance: Reproduce SEC-STD-A15-001, restore the stated invariant, add a targeted regression test, and pass the required lint/build/test and review closure gates.
