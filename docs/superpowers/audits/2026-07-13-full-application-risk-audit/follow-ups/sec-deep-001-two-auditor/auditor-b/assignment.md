# Auditor B Assignment: Independent Challenger

Execute only this assignment. Review all nine recovered families independently
and return only after the three required Auditor B artifacts are complete.

## Inputs

Read completely:

- `../manifest.md`;
- `../threat-model.md`;
- `../input-ledger.md`;
- all nine ordered records in `../input-families.jsonl`;
- `../../../stages/02-security.md`;
- related open files under the execution worktree's `docs/findings/`.

Review both immutable roots:

- historical:
  `/home/evluk/projects/chatwoot-client-portal-v2-audit-source-2026-07-13`;
- current:
  `/home/evluk/projects/chatwoot-client-portal-v2-sec-deep-001-current`.

## Required Workflow

1. Load and follow `codex-security:validation` and
   `codex-security:attack-path-analysis`.
2. Review every `DEEP-R1-F01` through `DEEP-R1-F09` independently against both
   immutable roots.
3. Challenge reachability, authority, tenant boundaries, preconditions,
   countercontrols, severity and current applicability.
4. Reproduce negative cases locally when bounded evidence is necessary and
   record every command/result in `work-ledger.md`.
5. Use the assigned files below as the user-provided validation and
   attack-path output paths. Do not create a separate default scan bundle.
6. Never delegate, spawn another agent or request a separate write-up/reviewer
   worker.
7. Never list, read or infer anything under `../auditor-a/`.
8. Never edit either source root, product code, dependencies, migrations,
   environment files or Chatwoot core.
9. Do not use production, customer data, secrets or external mutation.
10. Do not commit. The coordinator checkpoints both auditor results together.
11. Map a duplicate only when one existing finding's remediation closes the
    complete source/control/sink/impact tuple.
12. Return only after all nine records have evidence-backed dispositions or
    explicit `needs_follow_up` blockers.

## Outputs

Write only:

- `work-ledger.md`;
- `report.md`;
- `dispositions.jsonl`.

Optional safe local reproduction files may be placed under `poc/` only when a
family needs them. Do not create an empty `poc/` directory.

`dispositions.jsonl` must contain exactly nine ordered records accepted by
`../validate-ledgers.mjs auditors`. Each record must use the complete shared
contract defined in the approved plan and include historical reachability,
current applicability, proposed disposition, calibrated severity/confidence,
source, closest control, sink, impact, preconditions, affected locations,
evidence and existing finding IDs.

For `fixed_on_current_baseline`, include both `git_delta` and targeted `test`
evidence. Preserve unavailable proof as `needs_follow_up`; do not infer missing
runtime or external controls.

The report must have stable anchors for every family so coordinator evidence
references can cite `auditor-b/report.md#...`.
