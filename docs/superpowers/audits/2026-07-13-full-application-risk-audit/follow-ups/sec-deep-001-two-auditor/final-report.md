# SEC-DEEP-001 Targeted Two-Auditor Disposition

Status: `closed_by_targeted_disposition`

Completed: `2026-07-19`

Method: targeted two-auditor disposition of the nine recovered unresolved or
expanded families. This was not a canonical Deep Security Scan.

## Frozen Evidence

- Historical commit:
  `a61b4975ae7b59e244c0b5bbc4efd02466aa075c`.
- Current reassessment commit:
  `0c25c7575221ed19b21390abb8a5f1e364f2e06f`.
- Recovered family merge SHA-256:
  `64ffd2cd43a3ccb2187f36a78a44229bfc1c07c8c7eed1aa325b1e1e901dc1df`.
- Recovered status SHA-256:
  `0f62b0bbc83b4b501a6f9c5e0d3f8ac866670fd8c0b42af9a25b30c63549a486`.
- Independent auditor directories: exactly 2.
- Families reviewed by each auditor and canonically reconciled: 9.

Both auditors independently traced source, sink, authority, counterevidence,
severity and attack path on both immutable commits. Their complete ledgers were
validated mechanically before coordinator reconciliation. Product code,
production state and Chatwoot core were not changed.

## Canonical Family Dispositions

| Family        | Auditor A         | Auditor B         | Canonical disposition     | Mapping      |
| ------------- | ----------------- | ----------------- | ------------------------- | ------------ |
| `DEEP-R1-F01` | Confirmed Low     | `needs_follow_up` | `needs_follow_up`         | —            |
| `DEEP-R1-F02` | Rejected          | Confirmed Medium  | `needs_follow_up`         | —            |
| `DEEP-R1-F03` | Confirmed Medium  | Confirmed Medium  | `confirmed_medium_or_low` | `F-SEC-020`  |
| `DEEP-R1-F04` | Duplicate, Medium | Duplicate, Low    | `duplicate`               | `F-LOAD-006` |
| `DEEP-R1-F05` | Duplicate, Medium | Duplicate, Low    | `duplicate`               | `F-AUTH-002` |
| `DEEP-R1-F06` | Rejected          | Confirmed Medium  | `needs_follow_up`         | —            |
| `DEEP-R1-F07` | Duplicate, Medium | Duplicate, Medium | `duplicate`               | `F-LOAD-002` |
| `DEEP-R1-F08` | Duplicate, Low    | Duplicate, Low    | `duplicate`               | `F-AUTH-001` |
| `DEEP-R1-F09` | Confirmed Medium  | Confirmed Medium  | `confirmed_medium_or_low` | `F-LOAD-008` |

Canonical counts:

- 2 `confirmed_medium_or_low`;
- 4 `duplicate`;
- 3 `needs_follow_up`;
- 0 `confirmed_critical_or_high`;
- 0 `rejected`;
- 0 `fixed_on_current_baseline`.

The zero canonical rejected count does not erase the auditors' individual
rejections for `DEEP-R1-F02` and `DEEP-R1-F06`; the peer independently retained
a plausible Medium interpretation, so both records remain `needs_follow_up`.
No family was fixed on the current baseline because fixes were outside the
authorized scope.

## Confirmed And Duplicate Findings

- `DEEP-R1-F03` registered
  [F-SEC-020](../../../../../findings/F-SEC-020-admin-session-revocation.md):
  active portal-admin sessions can retain bounded stale authority after
  Chatwoot revokes eligibility. Risk: Medium.
- `DEEP-R1-F09` registered
  [F-LOAD-008](../../../../../findings/F-LOAD-008-chat-search-history-amplification.md):
  one authenticated search can amplify into up to 183 Chatwoot history calls,
  with no aggregate search admission. Risk: Medium.
- `DEEP-R1-F04`, `F05`, `F07` and `F08` are fully covered by existing findings
  `F-LOAD-006`, `F-AUTH-002`, `F-LOAD-002` and `F-AUTH-001` respectively.

## Preserved Lower-Severity Evidence Questions

These records do not contain an open plausible High path, but their material
auditor disagreements are preserved without a coordinator tie-break:

- `DEEP-R1-F01`: inventory the deployed sibling-origin/domain topology and run
  the bounded browser reproduction from an actually attacker-controlled,
  script-capable same-site origin. Any proven impact remains bounded to the
  read-state mutation assessed as Low.
- `DEEP-R1-F02`: explicitly decide whether a compromised or misconfigured
  trusted signed-webhook source is reportable in the portal threat model, then
  run a bounded replay/dedupe test under that source policy. The surviving
  interpretation is bounded to Medium.
- `DEEP-R1-F06`: measure bounded concurrent avatar uploads and Chatwoot writes,
  choose a tenant/user/runtime admission policy, and validate 10x/100x
  backpressure. The surviving availability interpretation is bounded to
  Medium.

## SEC-DEEP-001 Decision And Overall Verdict

All nine recovered families were independently reviewed. No Critical or High
attack path survived, and `plausibleHighOpen=true` count is zero. The
plausible-High proof gap represented by `SEC-DEEP-001` is therefore closed as
`closed_by_targeted_disposition`.

This closes only the targeted security proof gap. It does not retroactively
turn the incomplete historical Deep run into a canonical Deep report, and it
does not produce an overall `GO`. `OPS-009`, `F-OPS-002` and every other audit
finding or evidence gate remain outside this follow-up's scope and retain
their existing status. The frozen audit verdict remains `NO-GO` until its
remaining reassessment conditions are satisfied and evaluated on a new
immutable baseline.

Detailed disagreements and duplicate-remediation subsumption are preserved in
[reconciliation.md](reconciliation.md); the machine-readable result is
[canonical-dispositions.jsonl](canonical-dispositions.jsonl).
