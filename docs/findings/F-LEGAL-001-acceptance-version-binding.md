# F-LEGAL-001: Legal acceptance version binding

- status: open
- found_in: Full application risk audit 2026-07-13; candidate BACK-001 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: medium
- urgency: Fix before the next release or feature slice that relies on this boundary.
- area: Legal acceptance version binding
- confidence: high
- evidence: `backend/src/modules/passwordless-login/acceptLegal.ts:47-52,168-180`; `backend/src/modules/passwordless-login/routes.ts:113-125`
- failure_path: Customer views V1, admin activates V2, then submit records acceptance of unseen V2 because the request carries no presented version identity
- counterevidence: Requires a legal publication during the open form; continuation and consent booleans are still valid
- load_impact: No separate hot-path load increase was established; the primary impact is the failure path above.
- fix_short: Bind acceptance to versioned presentation context and test V1-presented/V2-active submission
- acceptance: Bind acceptance to versioned presentation context and test V1-presented/V2-active submission Add the targeted regression coverage for this boundary and pass the required lint/build/test and review closure gates.
