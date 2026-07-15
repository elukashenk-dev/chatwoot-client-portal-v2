# SEC-DEEP-001 Two-Auditor Disposition Design

Status: approved by the user on `2026-07-15`. Execution is not approved and
must not start without a separate explicit user decision.

## Goal

Close the known plausible-High proof gap recorded as `SEC-DEEP-001` at lower
cost than another canonical Deep Security discovery round, while preserving
independent review and without presenting the result as a completed Deep
Security Scan.

## Decision

Use one bounded two-auditor disposition pass over the exact nine unresolved or
expanded candidate families retained by the first backend Deep discovery
round.

- Both auditors review all nine families independently.
- The auditors do not see one another's provisional conclusions.
- The first auditor attempts to establish a concrete failure or attack path.
- The second auditor independently challenges reachability, impact and missing
  controls.
- A coordinator reconciles the two completed evidence sets only after both are
  available.
- No repeated broad discovery round is part of this path.
- No third auditor is added automatically. A disagreement remains explicit
  `needs_follow_up` unless the existing evidence can resolve it mechanically.

This is a targeted evidence-disposition review, not the canonical
`codex-security:deep-security-scan` workflow. The official Deep workflow still
requires exactly six usable discovery workers per completed round and must not
be claimed when only two auditors are used.

## Why This Is Acceptable

The expensive first discovery round already ran with six independent workers.
Its outputs were semantically reduced from 53 candidates to 20 families:

- nine were already covered by Standard findings;
- two repeated Standard-suppressed or ignored paths;
- nine remained unresolved or expanded.

The final audit report already permits either of two closure paths:

1. complete the canonical Deep workflow; or
2. evidence-backed disposition of every plausibly High unresolved family.

This design selects the second path. It reduces repeated search cost while
retaining two independent judgments for the known high-impact uncertainty.

## Input Recovery Gate

The original generated scan directory was intentionally outside Git under
`/tmp/codex-security-scans`. On `2026-07-15`, the recorded
`round-01-candidate-families.md` and `deep-scan-status.md` paths were no longer
present on the local filesystem.

Execution must not begin until an input ledger containing the exact nine
families and their original evidence provenance has been recovered from one of
these sources, in order:

1. a retained copy or backup of the original generated Deep scan directory;
2. the six original worker artifact sets and a reproducible semantic merge;
3. another immutable export that preserves the original family text and
   source evidence.

Chat history, memory, family counts, Standard findings or newly invented
hypotheses are not substitutes for the original nine-family inventory.

If the exact input inventory cannot be recovered, this targeted review is
blocked. The user must then choose separately between a new canonical Deep
scan and a new two-auditor scoped assessment whose narrower coverage cannot
close the historical `SEC-DEEP-001` saturation gap by itself.

## Source Baselines

The historical proof gap belongs to frozen commit
`a61b4975ae7b59e244c0b5bbc4efd02466aa075c`.

At execution time, the coordinator must also freeze the then-current reviewed
`main` commit after the operator-gated `F-CHAT-012` rollout is closed. Each
family receives two linked conclusions:

1. what the preserved evidence proves or fails to prove on the historical
   audit commit;
2. whether the same code path is present, fixed, changed or no longer
   reachable on the new immutable reassessment commit.

The review must not silently apply an old line number or failure path to new
code. Current applicability requires a source trace or a precise Git delta.

## Auditor Contracts

### Auditor A: Proof Builder

For every family, independently record:

- attacker or failure source;
- closest relevant control;
- reachable sink or external effect;
- required preconditions;
- concrete impact;
- affected files and lines on both baselines;
- bounded static or local-runtime evidence;
- proposed disposition and confidence.

The auditor actively attempts to prove the strongest evidence-supported
failure path but must not inflate severity from speculation.

### Auditor B: Independent Challenger

For every family, independently record the same evidence fields, with emphasis
on:

- missing reachability assumptions;
- existing authorization, tenant, validation or resource controls;
- counterexamples and negative tests;
- whether the claimed impact survives on the current baseline;
- whether the issue duplicates an existing registered finding.

Auditor B must not receive Auditor A's report before completing its own report.

### Coordinator: Reconciliation Only

After both reports are complete, the coordinator:

- compares the evidence family by family;
- preserves disagreements instead of averaging them away;
- maps duplicates to existing finding IDs without dropping distinct proof
  tuples;
- requests no new broad discovery;
- creates one canonical disposition receipt per family;
- stops and asks the user before any remediation scope is opened.

## Allowed Dispositions

Every family must end in exactly one state:

- `confirmed_critical_or_high`: independently supported concrete path and
  impact; immediately reported to the user and kept open for a separately
  approved remediation decision;
- `confirmed_medium_or_low`: a real issue remains, but evidence rejects High
  impact; create or map the appropriate active finding;
- `duplicate`: fully covered by an existing canonical finding whose fix would
  also close this family's complete proof tuple;
- `rejected`: the alleged path or impact is disproved with concrete evidence;
- `fixed_on_current_baseline`: historical concern is evidenced, and an exact
  reviewed code delta plus regression evidence closes current applicability;
- `needs_follow_up`: evidence is incomplete, auditors materially disagree, or
  required runtime/external proof is unavailable.

`needs_follow_up` never counts as closure.

## Cost Boundaries

- Exactly two independent auditors are used for the disposition pass.
- Both use the same exact nine-family input ledger; neither performs a fresh
  repository-wide or backend-wide discovery pass.
- Review may follow direct callers, controls, sinks, tests and Git deltas needed
  for a listed family, but may not expand into unrelated candidate hunting.
- Runtime checks are local, synthetic, read-only where possible and bounded to
  the family being tested.
- Production mutation, production secrets, external customer data and Chatwoot
  core changes are prohibited.
- A family that requires broad discovery or unavailable production evidence is
  marked `needs_follow_up`; the process does not silently spend an open-ended
  token budget.
- No full test suite is run merely as discovery. Targeted tests support each
  disposition; final document consistency checks remain mandatory.

## Closure Conditions

`SEC-DEEP-001` may be closed through this path only when all conditions hold:

1. the recovered input ledger proves it contains the exact original nine
   unresolved or expanded families;
2. both auditors independently reviewed all nine families;
3. every report contains concrete source/control/sink/impact evidence or
   concrete counterevidence;
4. every possible Critical or High result received independent confirmation;
5. the reconciliation contains nine canonical disposition receipts;
6. no family remains `needs_follow_up` with plausible High impact;
7. current-baseline applicability was checked against one immutable reassessment
   commit;
8. active confirmed risks were created or mapped under `docs/findings/`;
9. the audit stage, candidate ledger, coverage matrix and final report state
   explicitly that closure used targeted two-auditor disposition rather than a
   completed Deep Security Scan;
10. formatting, link checks and `git diff --check` pass for the resulting audit
    documentation.

If any condition fails, `SEC-DEEP-001` remains open and the final audit verdict
must continue to show the unresolved limitation.

## Execution Order And Approval

1. Finish the operator-gated production rollout and closure of `F-CHAT-012`.
2. Obtain separate explicit user approval to start this security evidence
   review.
3. Recover and seal the nine-family input ledger.
4. Freeze the current reassessment commit.
5. Run both independent auditor passes.
6. Reconcile and validate dispositions.
7. Update audit artifacts and active findings.

Approval of this design changes documentation only. It does not authorize the
security review, production access, product fixes, deployment, push or Deep
Security Scan execution.
