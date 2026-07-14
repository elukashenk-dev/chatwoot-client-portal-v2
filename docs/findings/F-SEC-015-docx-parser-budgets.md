# F-SEC-015: DOCX legal upload can expand compressed XML without an uncompressed-size or execution budget

- status: open
- found_in: Full application risk audit 2026-07-13; canonical Codex Security finding SEC-STD-A14-001 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: low
- urgency: Schedule a bounded fix before scale or exposure increases in this boundary.
- area: security / parser-resource-exhaustion
- confidence: high
- canonical_security_finding: SEC-STD-A14-001; generated writeup findings/sec-std-a14-001/sec-std-a14-001.md
- evidence: backend/src/modules/legal-documents/routes.ts:198-198; backend/src/modules/legal-documents/documentParser.ts:117-117; backend/src/modules/legal-documents/documentParser.ts:183-183; backend/src/modules/legal-documents/documentParser.ts:185-185; node_modules/.pnpm/mammoth@1.12.0/node_modules/mammoth/lib/zipfile.js:15-15. The route bounds only compressed request/file bytes. The parser path supplies no uncompressed ZIP-entry total, per-entry limit, compression-ratio limit, entry-count limit, parse timeout/cancellation, isolated worker, or per-tenant parser concurrency budget before mammoth/JSZip fully materialize XML and the document object model.
- failure_path: tenant-admin multipart DOCX -> 10 MiB compressed-byte admission -> mammoth/JSZip full entry materialization and XML parse -> CPU/RSS amplification before text limit -> shared backend stall or process termination/restart
- counterevidence: Admin authentication, exact Origin, a 10 MiB compressed file limit, a 10 MiB plus 128 KiB request limit, one file/part, post-parse 200,000-character rejection, and catch-to-422 error mapping reduce reach and ordinary error leakage. They neither bound decompressed work nor contain OOM/event-loop/process impact.
- load_impact: No separate load effect beyond the security failure path was established.
- fix_short: The invariant to restore is: **before any dependency performs attacker-scaled DOCX expansion or XML work, the backend must establish enforceable per-file budgets, and parser failure must be containable without exhausting the shared request process**.
- acceptance: Reproduce SEC-STD-A14-001, restore the stated invariant, add a targeted regression test, and pass the required lint/build/test and review closure gates.
