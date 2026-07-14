# F-SEC-016: PDF legal upload parses every page without page, object, text, or execution budgets

- status: open
- found_in: Full application risk audit 2026-07-13; canonical Codex Security finding SEC-STD-A14-002 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: low
- urgency: Schedule a bounded fix before scale or exposure increases in this boundary.
- area: security / parser-resource-exhaustion
- confidence: high
- canonical_security_finding: SEC-STD-A14-002; generated writeup findings/sec-std-a14-002/sec-std-a14-002.md
- evidence: backend/src/modules/legal-documents/routes.ts:198-198; backend/src/modules/legal-documents/documentParser.ts:109-109; backend/src/modules/legal-documents/documentParser.ts:198-198; backend/src/modules/legal-documents/documentParser.ts:200-200; node_modules/.pnpm/pdf-parse@2.4.5/node_modules/pdf-parse/dist/pdf-parse/esm/PDFParse.js:124-124. The application does not bound PDF page count, object/stream expansion, text item count, total decoded text during parsing, CPU, memory, wall time, or concurrent parser jobs. The available pdf-parse first/last/partial selection is not used, and parsing is not isolated from the shared backend process.
- failure_path: tenant-admin multipart PDF -> 10 MiB byte/signature admission -> pdf.js loads and iterates every page/object/text item -> full result accumulation before limit -> shared backend CPU/RSS exhaustion -> cross-tenant availability degradation or restart
- counterevidence: Admin/tenant/Origin gates, 10 MiB input/request limits, one part, a post-result 200,000-character limit, controlled ordinary parse errors, and parser.destroy() cleanup constrain reach and clean completed work. None stops or isolates excessive work while getText is running.
- load_impact: tenant-admin multipart PDF -> 10 MiB byte/signature admission -> pdf.js loads and iterates every page/object/text item -> full result accumulation before limit -> shared backend CPU/RSS exhaustion -> cross-tenant availability degradation or restart
- fix_short: The invariant to restore is: one admitted PDF parse must have finite per-job work and memory, and all parses together must have finite concurrency. The byte and final-text limits should remain, but parser execution should move behind a bounded job interface that carries every resource limit explicitly.
- acceptance: Reproduce SEC-STD-A14-002, restore the stated invariant, add a targeted regression test, and pass the required lint/build/test and review closure gates.
