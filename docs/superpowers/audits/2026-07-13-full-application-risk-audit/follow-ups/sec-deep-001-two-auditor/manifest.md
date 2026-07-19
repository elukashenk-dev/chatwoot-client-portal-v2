# SEC-DEEP-001 Two-Auditor Disposition Manifest

Status: prepared

Method: targeted two-auditor disposition; not canonical Deep Security Scan

Historical commit:
`a61b4975ae7b59e244c0b5bbc4efd02466aa075c`

Historical root:
`/home/evluk/projects/chatwoot-client-portal-v2-audit-source-2026-07-13`

Reassessment commit:
`0c25c7575221ed19b21390abb8a5f1e364f2e06f`

Reassessment root:
`/home/evluk/projects/chatwoot-client-portal-v2-sec-deep-001-current`

Input family count: 9

Auditor count: 2

Production mutation: prohibited

Product-code mutation: prohibited

Execution approval: on `2026-07-19`, the user explicitly instructed Codex to
start the approved `SEC-DEEP-001` review with two independent auditors.

## Control Baseline

- Control branch: `docs/sec-deep-001-two-auditor-execution`.
- The branch was created in the dedicated execution worktree from local
  `main` at `0c25c7575221ed19b21390abb8a5f1e364f2e06f`.
- Local `main` and `origin/main` both resolved to
  `0c25c7575221ed19b21390abb8a5f1e364f2e06f` when the reassessment source was
  frozen. No pull, reset, rebase, push or merge was performed.
- Input-ledger checkpoint:
  `0d7e4358e5d73a1d3e0eadcea095ca36018c08ff`.

## Recovered Input Receipts

- `round-01-candidate-families.md` SHA-256:
  `64ffd2cd43a3ccb2187f36a78a44229bfc1c07c8c7eed1aa325b1e1e901dc1df`.
- `deep-scan-status.md` SHA-256:
  `0f62b0bbc83b4b501a6f9c5e0d3f8ac866670fd8c0b42af9a25b30c63549a486`.
- Candidate-level structured execution receipt hashes are sealed in
  `source-provenance.jsonl` and summarized in `input-ledger.md`.

Both source roots are detached, immutable review inputs. Auditors may read
them but must not edit them.
