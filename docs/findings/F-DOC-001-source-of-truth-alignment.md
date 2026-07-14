# F-DOC-001: Documentation alignment

- status: open
- found_in: Full application risk audit 2026-07-13; candidate BASE-002 at frozen commit a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- risk: low
- urgency: Schedule a bounded maintenance fix before this control is relied on as regression evidence.
- area: Documentation alignment
- confidence: high
- evidence: `docs/roadmap/work-log.md:281-285`; `docs/architecture/overview.md:545-550`; `docs/roadmap/implementation-plan.md:62-69`; no branch named `feature/auth-email-code-primary`
- failure_path: Mandatory entry docs can direct an agent to an absent branch or already-completed MT-9 scope
- counterevidence: Code is source of truth and later text records the completed baseline; no direct runtime effect
- load_impact: No separate hot-path load increase was established; the primary impact is the failure path above.
- fix_short: Reconcile the mandatory roadmap and architecture entry documents with the implemented baseline and leave exactly one current recommended next step.
- acceptance: Reconcile the mandatory roadmap and architecture entry documents with the implemented baseline and leave exactly one current recommended next step. Add the targeted regression coverage for this boundary and pass the required lint/build/test and review closure gates.
