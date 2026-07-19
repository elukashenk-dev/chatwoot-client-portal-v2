# SEC-DEEP-001 Recovered Input Ledger

## Frozen Historical Input

- Original scan ID:
  `a61b4975ae7b59e244c0b5bbc4efd02466aa075c_20260713T231902Z`
- Historical commit:
  `a61b4975ae7b59e244c0b5bbc4efd02466aa075c`
- Durable family merge:
  `docs/superpowers/audits/2026-07-13-full-application-risk-audit/evidence/sec-deep-001-initial-discovery/round-01-candidate-families.md`
- Historical family merge:
  `/tmp/codex-security-scans/chatwoot-client-portal-v2-audit-source-2026-07-13-backend-deep/a61b4975ae7b59e244c0b5bbc4efd02466aa075c_20260713T231902Z/artifacts/deep_merge/round-01-candidate-families.md`
- Family merge SHA-256:
  `64ffd2cd43a3ccb2187f36a78a44229bfc1c07c8c7eed1aa325b1e1e901dc1df`
- Durable status record:
  `docs/superpowers/audits/2026-07-13-full-application-risk-audit/evidence/sec-deep-001-initial-discovery/deep-scan-status.md`
- Historical status record:
  `/tmp/codex-security-scans/chatwoot-client-portal-v2-audit-source-2026-07-13-backend-deep/a61b4975ae7b59e244c0b5bbc4efd02466aa075c_20260713T231902Z/artifacts/deep_merge/deep-scan-status.md`
- Status record SHA-256:
  `0f62b0bbc83b4b501a6f9c5e0d3f8ac866670fd8c0b42af9a25b30c63549a486`

The durable pair and its recovery receipt were checked against the exact
SHA-256 values above before normalization.

## Candidate-Level Provenance

The original generated worker directories no longer exist. Exact candidate
records were recovered from structured Codex execution receipts that contain
the original record verbatim and a successful write receipt. The SHA-256
values cover each exact two-line call/receipt pair cited by
`source-provenance.jsonl`.

| Worker source         | Structured receipt                                                                                                            | Candidate IDs                          | Receipt SHA-256                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| Worker 01 replacement | `/home/evluk/.codex/sessions/2026/07/14/rollout-2026-07-14T03-27-27-019f5dce-9690-7480-b391-641aed34b61a.jsonl` lines 277-278 | `W01R-C002`, `W01R-C003`, `W01R-C010`  | `3fe62f98759d1bec52df941003dad94a8b7048535873b873d61a0377d50dcdc0` |
| Worker 02             | `/home/evluk/.codex/sessions/2026/07/14/rollout-2026-07-14T03-20-36-019f5dc8-50fd-7fd2-99d3-2c3c3027983f.jsonl` lines 236-237 | `CAND-R01-W02-002`, `CAND-R01-W02-009` | `bc9a72d5450e86c3da92698f903c13768f538de7f85f965adf0ca878a9e9c611` |
| Worker 03 replacement | `/home/evluk/.codex/sessions/2026/07/14/rollout-2026-07-14T03-36-21-019f5dd6-b9e7-7ea1-8b77-666d279aae49.jsonl` lines 338-339 | `R01-W03R-C005`                        | `21c90136ad8bdff19eac044378ab57467323e0e0eec7f4e77a401cedf5ed7e68` |
| Worker 04             | `/home/evluk/.codex/sessions/2026/07/14/rollout-2026-07-14T03-21-43-019f5dc9-5700-7371-bd9a-3f0994429857.jsonl` lines 366-367 | `W04-CAND-007`, `W04-CAND-010`         | `f9be0b5b72fa79dce7cb17c0e79b3dbe0f99431d455ae7337d4bd9ba29cd3fdb` |
| Worker 05             | `/home/evluk/.codex/sessions/2026/07/14/rollout-2026-07-14T03-22-17-019f5dc9-d9d2-7bb3-90f0-a07c08802f71.jsonl` lines 294-295 | `R01-W05-C007`, `R01-W05-C009`         | `2251c4a05c2b7af8253878e1b3aecb2f0026e712373aa4c9fdaa9c33031832b6` |
| Worker 06             | `/home/evluk/.codex/sessions/2026/07/14/rollout-2026-07-14T03-22-49-019f5dca-56ae-7b43-8fc5-1cc9e6827d54.jsonl` lines 308-309 | `CAND-R01-W06-002`, `CAND-R01-W06-008` | `f64ef67dd26040b7e7a949e7e40c662db53e5982f54264c5368030bbcf35ed51` |

## Reconciled Merge Totals

- 53 deduplicated worker candidates.
- 20 semantically merged families.
- 9 families covered by Standard findings.
- 2 families repeating suppressed or ignored Standard paths.
- 9 unresolved or expanded families.

These totals agree with both recovered coordinator files and
`stages/02-security.md#conditional-backend-deep-gate`.

## Normalized Follow-Up Families

| Family ID     | Original family title                                           | Source candidate IDs                                |
| ------------- | --------------------------------------------------------------- | --------------------------------------------------- |
| `DEEP-R1-F01` | Mark-read CSRF origin enforcement                               | `W01R-C002`                                         |
| `DEEP-R1-F02` | Unsigned delivery identifier replay/dedupe bypass               | `W01R-C003`, `CAND-R01-W02-009`                     |
| `DEEP-R1-F03` | Existing portal-admin authority after Chatwoot revocation       | `W01R-C010`, `CAND-R01-W02-002`, `CAND-R01-W06-008` |
| `DEEP-R1-F04` | Non-evicting presence throttle maps                             | `R01-W03R-C005`                                     |
| `DEEP-R1-F05` | Admin membership enumeration through challenge behavior         | `W04-CAND-007`                                      |
| `DEEP-R1-F06` | Unthrottled repeated profile-avatar upstream writes             | `W04-CAND-010`                                      |
| `DEEP-R1-F07` | Database transaction/advisory-lock convoy across Chatwoot calls | `R01-W05-C007`                                      |
| `DEEP-R1-F08` | Process-local authentication throttling                         | `R01-W05-C009`                                      |
| `DEEP-R1-F09` | Chat search history-call amplification                          | `CAND-R01-W06-002`                                  |

No new discovery or newly generated hypothesis was used to construct this
input. The normalized files preserve only the nine unresolved or expanded
families and their original candidate evidence provenance.
