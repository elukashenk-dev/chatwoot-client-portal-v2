# Full Application Risk Audit Manifest

Status: in progress
Decision target: safe continued operation and new-client onboarding

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

| Stage                   | Status      | Artifact                             |
| ----------------------- | ----------- | ------------------------------------ |
| Baseline                | complete    | stages/00-baseline.md                |
| Architecture invariants | complete    | stages/01-architecture-invariants.md |
| Security                | complete    | stages/02-security.md                |
| Backend/data            | not_started | stages/03-backend-data.md            |
| Chatwoot/integrations   | not_started | stages/04-chatwoot-integrations.md   |
| Frontend/PWA            | not_started | stages/05-frontend-pwa.md            |
| Load/reliability        | not_started | stages/06-load-reliability.md        |
| Operations/supply chain | not_started | stages/07-operations-supply-chain.md |
| Existing findings       | not_started | stages/08-existing-findings.md       |
| Dynamic validation      | not_started | stages/09-dynamic-validation.md      |
| Canonical validation    | not_started | stages/10-canonical-validation.md    |
