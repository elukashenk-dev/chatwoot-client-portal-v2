# Full Application Risk Audit Manifest

Status: complete
Decision target: safe continued operation and new-client onboarding
Verdict: NO-GO for new-client onboarding and production expansion on the
frozen commit; see `final-report.md`

## Frozen Source

- Repository: chatwoot-client-portal-v2
- Commit: a61b4975ae7b59e244c0b5bbc4efd02466aa075c
- Control branch: docs/full-application-risk-audit
- Source worktree:
  /home/evluk/projects/chatwoot-client-portal-v2-audit-source-2026-07-13
- Product-code delta from baseline: none
- Source setup: `pnpm install --frozen-lockfile` passed with pnpm 10.33.0
- Initial source test gate: `pnpm test` passed; backend 125 files / 842
  tests, frontend 127 files / 732 tests, production environment upgrade checks
  passed

## Runtime Boundaries

- Production mutation: prohibited
- Chatwoot core mutation/restart: prohibited
- Local portal services: allowed when a stage requires them
- Secrets in audit artifacts: prohibited

## Stage Status

| Stage                   | Status   | Artifact                             |
| ----------------------- | -------- | ------------------------------------ |
| Baseline                | complete | stages/00-baseline.md                |
| Architecture invariants | complete | stages/01-architecture-invariants.md |
| Security                | complete | stages/02-security.md                |
| Backend/data            | complete | stages/03-backend-data.md            |
| Chatwoot/integrations   | complete | stages/04-chatwoot-integrations.md   |
| Frontend/PWA            | complete | stages/05-frontend-pwa.md            |
| Load/reliability        | complete | stages/06-load-reliability.md        |
| Operations/supply chain | complete | stages/07-operations-supply-chain.md |
| Existing findings       | complete | stages/08-existing-findings.md       |
| Dynamic validation      | complete | stages/09-dynamic-validation.md      |
| Canonical validation    | complete | stages/10-canonical-validation.md    |
| Final synthesis         | complete | final-report.md                      |

## Final Canonical State

- Candidate ledger: 71 rows; 58 `validated`, 11 `needs_follow_up`, 2
  `rejected`, 0 unresolved discovery statuses.
- Unique validated findings: 56; 0 Critical, 0 High, 40 Medium, 16 Low.
- Blocking proof gates: `SEC-DEEP-001`, `OPS-009`, `F-OPS-002`.
- Product-code delta from frozen source: none.
- Final audit-document verification: recorded by the concluding audit commit;
  see `final-report.md#evidence-and-artifact-map`.
