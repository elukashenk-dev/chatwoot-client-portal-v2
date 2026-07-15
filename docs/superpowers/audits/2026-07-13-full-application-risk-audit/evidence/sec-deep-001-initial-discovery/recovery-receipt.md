# SEC-DEEP-001 Initial Discovery Recovery Receipt

Recovery date: `2026-07-15`

Recovered scan id:
`a61b4975ae7b59e244c0b5bbc4efd02466aa075c_20260713T231902Z`

Historical source commit: `a61b4975ae7b59e244c0b5bbc4efd02466aa075c`

## Recovery Source

The original generated files had disappeared from `/tmp`. They were recovered
from the local Codex execution journal that contains the exact `apply_patch`
payloads and their successful application receipts:

- session:
  `/home/evluk/.codex/sessions/2026/07/13/rollout-2026-07-13T18-43-23-019f5bee-ca9c-7b13-91e2-19d0766e22fa.jsonl`;
- lines `5542`–`5543`: complete two-file creation patch and successful apply
  receipt;
- lines `5551`–`5552`: the only later correction patch and successful apply
  receipt.

The correction changed the merge totals from ten/eight to nine/nine and the
status text from eight to nine unresolved or expanded families. No other
successful write to either historical path was present in the execution
journal.

The successful update receipt also removes one terminal blank line from each
file. The hashes below represent that post-update state; the earlier `wc`
receipt at journal lines `5547`–`5548` predates the correction.

The session journal is not copied into Git because it contains unrelated
conversation and tool records. Recovery used only the exact file-write
payloads and apply receipts, not natural-language recollection.

## Recovered Files

| File                             | Lines | Bytes | SHA-256                                                            |
| -------------------------------- | ----: | ----: | ------------------------------------------------------------------ |
| `round-01-candidate-families.md` |    41 | 4,952 | `64ffd2cd43a3ccb2187f36a78a44229bfc1c07c8c7eed1aa325b1e1e901dc1df` |
| `deep-scan-status.md`            |    26 | 1,196 | `0f62b0bbc83b4b501a6f9c5e0d3f8ac866670fd8c0b42af9a25b30c63549a486` |

The recovered merge contains 53 deduplicated worker candidates reduced to 20
families: nine covered by Standard findings, two repeating suppressed or
ignored Standard paths, and nine unresolved or expanded families.

## Boundary

These files restore the coordinator's exact initial merge and status record.
They do not constitute a completed Deep Security Scan, canonical validation,
attack-path analysis, `findings.json`, or final Deep report. This recovery does
not restore or claim to replace the six raw worker artifact sets, and it does
not authorize the planned two-auditor review or any product remediation.
The two recovered source files are listed in `.prettierignore` so automated
formatting cannot change their verified bytes.
