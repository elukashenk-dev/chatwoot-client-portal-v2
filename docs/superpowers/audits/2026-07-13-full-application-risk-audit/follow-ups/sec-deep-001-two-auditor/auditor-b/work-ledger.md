# Auditor B Work Ledger

Scope: independent validation and attack-path challenge for `DEEP-R1-F01`
through `DEEP-R1-F09` against the historical and current immutable roots.
Product-code changes, source-root mutation, external mutation, and auditor-a
access are excluded.

## Validation Rubric

Every family is closed against the same five criteria:

- [ ] Attacker or failure source is concrete and crosses an in-scope interface.
- [ ] The closest authority, origin, rate, cardinality, timing, or dedupe control
      is identified and its exact semantics are established.
- [ ] A reachable sensitive sink or external effect is traced with exact
      historical and current locations.
- [ ] Preconditions, strongest counterevidence, tenant/identity boundary, and
      10x/100x cardinality or concurrency implications are explicit.
- [ ] Historical reachability and current applicability are independently
      proved; any `fixed_on_current_baseline` claim includes both Git-delta and
      targeted-test evidence, otherwise the proof gap remains
      `needs_follow_up`.

## Intake And Safety Checks

- `pwd` -> execution worktree is
  `/home/evluk/projects/chatwoot-client-portal-v2-sec-deep-001-execution`.
- `git status --short --branch` -> branch
  `docs/sec-deep-001-two-auditor-execution`, clean before Auditor B artifacts.
- Read the shared manifest, threat model, input ledger, all nine ordered JSONL
  records, Stage 02 security record, shared validator, and only related open
  finding files. No auditor-a path was listed or read.
- Loaded and followed `codex-security:validation` and
  `codex-security:attack-path-analysis`, including their validation-guidance,
  static-assessment, attack-path-facts, severity-policy, and artifact-path
  references. Assignment-provided Auditor B paths override default scan paths.

## Evidence Commands And Results

Commands below are bounded, read-only unless explicitly described as writing
one of the three authorized Auditor B artifacts.

### Baseline identity and delta

- `git -C <historical-root> status --short --branch && git -C
<historical-root> rev-parse HEAD` -> detached clean tree at
  `a61b4975ae7b59e244c0b5bbc4efd02466aa075c`.
- `git -C <current-root> status --short --branch && git -C <current-root>
rev-parse HEAD` -> detached clean tree at
  `0c25c7575221ed19b21390abb8a5f1e364f2e06f`.
- `git diff --name-status a61b4975..0c25c757 -- <family paths>` -> only
  unrelated chat-thread contact-attribute/service test changes appeared; none
  of the root-control, route, limiter, transaction, signature, avatar, search,
  or deployment files used by the nine families appeared in the delta.
- A bounded `sha256sum` comparison of the 26 exact files used by the nine
  traces returned `identical` for every file, including `backend/src/app.ts`,
  `backend/src/lib/origin.ts`, both cookie/limiter files, all family route and
  service files, webhook repository/schema, the Chatwoot clients, and
  `infra/production/compose.yaml`. The full hash output was inspected during
  review; this establishes unchanged line locations and control semantics on
  both immutable baselines.

### Static trace commands

- Bounded `nl -ba ... | sed -n ...` reads were run for every supplied
  root-control and sink range plus the nearest route, guard, repository,
  integration-client, test, and deployment range. Results are preserved in
  `report.md` as exact affected locations and evidence summaries.
- Bounded `rg -n` searches were limited to named family modules, tests,
  `infra/production`, and `docs/findings`. They established route registration,
  closest controls, direct callers, exact existing-finding overlap, and the
  absence of a route-specific avatar/search admission control. No repository-
  wide discovery was performed.

### Local synthetic and targeted checks

- Command attempted in the immutable current root:

  `pnpm --dir backend exec tsx -e "<synthetic F02 signature/header check>"`

  Result: blocked before execution with `Command "tsx" not found`; the
  immutable root intentionally has no installed dependencies. This is setup
  evidence only, not counterevidence.

- `test -x backend/node_modules/.bin/tsx` and the equivalent Vitest check in
  the execution worktree -> both tools present. Relevant product-file hashes
  in that worktree equal the immutable current root, so checks could execute
  without installing or changing dependencies in either source root.

- Synthetic F02 command (execution worktree): import
  `createSignatureDigest`/`verifyChatwootSignature`, sign a fixed synthetic raw
  body and timestamp, then change only `x-chatwoot-delivery` from
  `delivery-a` to `delivery-b` and verify both requests.

  Result:
  `{"baseVerified":true,"changedDeliveryVerified":true,"sameSignature":true}`.
  The check used only `synthetic-test-secret`; no environment or live secret
  was read.

- Targeted regression command:

  `pnpm --dir backend exec vitest run src/modules/chat-presence/routes.test.ts src/modules/chat-presence/service.test.ts src/modules/chatwoot-webhooks/service.test.ts src/modules/profile/routes.test.ts src/modules/chat-threads/service.test.ts src/modules/chat-messages/service.search.test.ts --no-file-parallelism --reporter=dot`

  Result: 6 files passed, 78 tests passed. This confirms the traced ordinary
  interface behavior and countercontrols; it does not claim that absent
  adversarial assertions were tested.

- Targeted auth/admin command:

  `pnpm --dir backend exec vitest run src/app.test.ts src/app-admin-auth.integration.test.ts --no-file-parallelism --reporter=dot -t "rate limits repeated login attempts|rate limits repeated password reset requests|requests, verifies, resolves, and logs out|rejects an agent email"`

  Result: 2 files passed; 3 tests passed and 19 were skipped by the name
  filter. The results reproduce the per-app five-request limiter and the
  eligible-success/ineligible-403 administrator oracle.

- First synthetic F09 command used top-level `await` under `tsx -e`.

  Result: no application execution; esbuild rejected the harness because
  top-level await is unsupported for its CJS eval output. This is a harness
  error, not counterevidence.

- Corrected synthetic F09 command wrapped the same call in an async IIFE and
  invoked `getCurrentUserChatSearch` with eight 20-message pages, no query
  match, and one unique missing reply target per message.

  Result:
  `{"listCalls":8,"replyCalls":160,"resultCount":0,"hasMoreOlder":true}`.
  This directly reproduces the service-layer fan-out. Static inspection of
  `messageClient.ts` separately proves that a `listConversationMessages` call
  is itself one to three Chatwoot history requests depending on cursor and
  older-page probing.

## Family Closure Checklist

| Family | Source | Closest control | Sink | Preconditions/counterevidence | Both baselines |
| ------ | ------ | --------------- | ---- | ----------------------------- | -------------- |
| F01    | done   | done            | done | proof gap retained            | done           |
| F02    | done   | done            | done | done                          | done           |
| F03    | done   | done            | done | done                          | done           |
| F04    | done   | done            | done | done                          | done           |
| F05    | done   | done            | done | done                          | done           |
| F06    | done   | done            | done | done                          | done           |
| F07    | done   | done            | done | done                          | done           |
| F08    | done   | done            | done | done                          | done           |
| F09    | done   | done            | done | done                          | done           |

F01's retained proof gap is exact: the code and documented domain modes prove
that a same-site sibling-origin request would not meet an Origin check because
none exists, but the immutable evidence does not prove an attacker-controlled
script-capable sibling origin for a real victim deployment. SameSite=Lax makes
that distinction dispositive; cross-site attackers do not receive the same
cookie behavior. The minimal follow-up is a real deployment domain-ownership
inventory or a browser test using the actual provider/custom-domain topology.
