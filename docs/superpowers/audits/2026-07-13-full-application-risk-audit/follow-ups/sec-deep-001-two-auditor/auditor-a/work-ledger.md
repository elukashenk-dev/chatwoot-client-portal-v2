# Auditor A Work Ledger

Date: 2026-07-19

Scope: independent validation and attack-path analysis of `DEEP-R1-F01`
through `DEEP-R1-F09` only. No discovery expansion, product-code edits,
source-root edits, external calls, production access or mutation occurred.

## Validation Rubric

The following five-criterion rubric was applied independently to every family
before disposition:

1. The claimed source is attacker-controlled or represents an in-scope failure
   trigger under exact authority, state, timing and cardinality preconditions.
2. The closest control is identified and shown either to hold or to fail on the
   exact path.
3. The source reaches the named sink or external effect without an omitted
   intervening control.
4. The sink produces a concrete security-relevant impact across an in-scope
   boundary, with the strongest counterevidence considered.
5. Historical reachability, current applicability and any duplicate mapping are
   independently established; duplicate status requires remediation
   subsumption of the complete tuple.

## Read Inputs

- Shared `manifest.md`, `threat-model.md`, `input-ledger.md` and all nine
  ordered `input-families.jsonl` records.
- Historical `stages/02-security.md`.
- Approved plan contract and the local ledger validator.
- Related open findings: `F-AUTH-001`, `F-AUTH-002`, `F-SEC-003`,
  `F-LOAD-001`, `F-LOAD-002`, `F-LOAD-004`, `F-LOAD-006`, `F-SEC-012`,
  `F-SEC-013` and `F-SEC-014`.
- Both immutable source roots named in the manifest. No path under the peer
  auditor directory was listed, read or inferred.

## Commands And Results

### Baseline identity and immutability

Command summary:

```text
git -C <historical-root> rev-parse HEAD
git -C <current-root> rev-parse HEAD
git -C <historical-root> status --short
git -C <current-root> status --short
```

Result: historical `HEAD` was
`a61b4975ae7b59e244c0b5bbc4efd02466aa075c`; current `HEAD` was
`0c25c7575221ed19b21390abb8a5f1e364f2e06f`; both status outputs were empty.

### Candidate-path Git delta

Command summary: `git diff --quiet` was run from the historical repository for
each family's exact candidate files between the two manifest commits. A
separate `git diff --quiet` compared the execution checkout's product paths
with the current commit.

Result: no candidate-path delta for any of F01-F09. The execution checkout also
has no product delta from the immutable current commit. Neighboring
chat-thread/contact changes outside the F07 root-control files were not used as
candidate evidence.

### Existing targeted tests

Command:

```text
pnpm --dir backend exec vitest run --no-file-parallelism --reporter=dot \
  src/modules/chat-presence/routes.test.ts \
  src/modules/chat-presence/service.test.ts \
  src/modules/chatwoot-webhooks/service.test.ts \
  src/modules/tenant-admin/adminAuthService.test.ts \
  src/app-admin-auth.integration.test.ts \
  src/modules/profile/routes.test.ts \
  src/modules/profile/service.test.ts \
  src/modules/profile/avatarValidation.test.ts \
  src/modules/chat-threads/repository.test.ts \
  src/modules/chat-threads/service.test.ts \
  src/app.test.ts \
  src/modules/chat-messages/routes.search.test.ts \
  src/modules/chat-messages/service.search.test.ts
```

Result: `13` test files passed, `128` tests passed, exit code `0`, duration
`36.21s`. This confirms the checked-in behavior used by the static traces; it
does not by itself prove production traffic or external-provider conditions.

### Synthetic reproduction command resolution

Initial command:

```text
pnpm exec vitest --config auditor-a/poc/vitest.config.ts run
```

Result: failed before test execution because root `pnpm exec` could not resolve
the backend-local `vitest` binary. No source or dependency changes were made.

Corrected command:

```text
pnpm --dir backend exec vitest --config \
  ../docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/auditor-a/poc/vitest.config.ts \
  run --reporter=verbose
```

First corrected result: both tests passed, but the optional config helper import
produced a module-resolution warning. The config was simplified without
changing test behavior.

Final corrected result: `1` test file passed, `2` tests passed, exit code `0`.
The reproductions establish that:

- one identical raw webhook body and signature is accepted twice when only the
  unsigned delivery header changes; and
- one bounded eight-page search can issue `8` history-page calls plus `160`
  reply-target lookups at the service/client boundary.

Artifacts:

- `poc/reproduction.test.ts`
- `poc/vitest.config.ts`

## Family Closure Summary

| Family | Validation method                                                                        | Closure  |
| ------ | ---------------------------------------------------------------------------------------- | -------- |
| F01    | Static trace plus existing route/service tests                                           | Complete |
| F02    | Static trace, repository secret-boundary search and synthetic reproduction               | Complete |
| F03    | Static authority/session/action trace plus existing session test                         | Complete |
| F04    | Static state/cardinality trace and exact finding remediation comparison                  | Complete |
| F05    | Static response-oracle trace plus integration test and exact finding comparison          | Complete |
| F06    | Static request/body/upstream trace plus targeted route/service tests                     | Complete |
| F07    | Static transaction/lock/external-I/O trace plus repository/service tests                 | Complete |
| F08    | Static limiter/deployment trace plus auth integration tests and exact finding comparison | Complete |
| F09    | Static call-budget trace plus synthetic amplification reproduction                       | Complete |

## Artifact Verification

The Auditor A JSONL was parsed and checked independently because the shared
`auditors` validator intentionally reads both auditor directories and may only
be run by the coordinator after both roles are idle. The Auditor A-only check
confirmed exactly nine ordered records, all shared enums, required strings,
affected-location objects, evidence objects, duplicate mappings and
severity/disposition constraints. `wc -l` confirmed nine physical JSONL lines.

Prettier check passed for both Markdown files and both optional PoC TypeScript
files. `git diff --check` reported no whitespace errors. The final PoC rerun
passed `2/2`, every report anchor `deep-r1-f01` through `deep-r1-f09` was found,
and both immutable source roots remained clean.
