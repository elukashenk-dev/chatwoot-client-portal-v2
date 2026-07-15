# Stage 02: Canonical Security Review

Status: complete

Follow-up: `SEC-DEEP-001` remains `needs_follow_up` and blocks final `GO`.

Verdict effect: the completed Standard Security Scan is canonical for Task 4,
but the unresolved conditional backend Deep gate prevents a final `GO` until
its plausible high-impact proof gap is closed or explicitly dispositioned.

## Frozen Target And Safety Boundary

- Repository revision: `a61b4975ae7b59e244c0b5bbc4efd02466aa075c`
- Frozen source:
  `/home/evluk/projects/chatwoot-client-portal-v2-audit-source-2026-07-13`
- Standard scope: complete frozen repository
- Conditional Deep scope: exact path `backend/`
- Product source mutation: none
- Production or external Chatwoot mutation: none
- Test/PoC data: local and synthetic only

## Canonical Standard Scan

- Capability preflight: `ready`
- Workflow: `codex-security:security-scan`
- Plugin version: `0.1.11`
- Status: completed and sealed at `2026-07-13T23:12:00Z`
- Validation mode: exhaustive static discovery, canonical validation,
  attack-path calibration and bounded local reproduction where feasible
- Generated report:
  `/tmp/codex-security-scans/chatwoot-client-portal-v2-audit-source-2026-07-13/a61b4975ae7b59e244c0b5bbc4efd02466aa075c_20260713T191131Z/report.md`
- Canonical JSON:
  `/tmp/codex-security-scans/chatwoot-client-portal-v2-audit-source-2026-07-13/a61b4975ae7b59e244c0b5bbc4efd02466aa075c_20260713T191131Z/findings.json`
- Coverage artifact:
  `/tmp/codex-security-scans/chatwoot-client-portal-v2-audit-source-2026-07-13/a61b4975ae7b59e244c0b5bbc4efd02466aa075c_20260713T191131Z/coverage.json`
- Hardening portfolio:
  `/tmp/codex-security-scans/chatwoot-client-portal-v2-audit-source-2026-07-13/a61b4975ae7b59e244c0b5bbc4efd02466aa075c_20260713T191131Z/hardening/hardening.md`

Generated scan bulk remains outside Git by design.

## Canonical Standard Findings

The scan finalized 19 reportable findings: 9 Medium/P2 and 10 Low/P3. Eighteen
have high confidence and `SEC-STD-A03-001` has medium confidence. No Critical or
High finding survived canonical validation and attack-path calibration.

| ID                | Severity  | Finding                                                                                                        |
| ----------------- | --------- | -------------------------------------------------------------------------------------------------------------- |
| `SEC-STD-A04-001` | Medium/P2 | Invalid admin-code failures roll back the attempt counter and audit event                                      |
| `SEC-STD-A04-002` | Medium/P2 | Chatwoot administrator eligibility is not rechecked before session creation                                    |
| `SEC-STD-A05-001` | Medium/P2 | Invalidating a code drops the database resend cooldown and permits repeated email/guess cycles                 |
| `SEC-STD-A07-001` | Medium/P2 | Older verified password-reset continuations can become usable again after a newer reset completes              |
| `SEC-STD-A09-001` | Medium/P2 | Established SSE streams can receive message snapshots after session expiry, revocation or user deactivation    |
| `SEC-STD-A10-004` | Medium/P2 | A user can create unbounded active push subscriptions and amplify storage/delivery work                        |
| `SEC-STD-A11-001` | Medium/P2 | Attachment send limiting occurs after buffering the full 40 MiB file                                           |
| `SEC-STD-A18-002` | Medium/P2 | Automatic Chatwoot redirects can pivot backend requests to internal network destinations                       |
| `SEC-STD-A22-004` | Medium/P2 | Production secrets are written before restrictive file permissions are applied                                 |
| `SEC-STD-A03-001` | Low/P3    | Public login email lookup can perform tenant-sized work because query normalization misses the available index |
| `SEC-STD-A09-003` | Low/P3    | Group-info requests amplify into a tenant-wide sequence of Chatwoot calls                                      |
| `SEC-STD-A10-003` | Low/P3    | Push subscriptions outlive session expiry/logout and extend stolen-session metadata delivery                   |
| `SEC-STD-A11-002` | Low/P3    | Unauthorized thread labels create unbounded high-cardinality rate-limit buckets                                |
| `SEC-STD-A13-001` | Low/P3    | Message-created retries perform tenant-wide unread-recipient work before dedupe claim                          |
| `SEC-STD-A13-003` | Low/P3    | Webhook acknowledgement waits synchronously on unbounded per-connection snapshots                              |
| `SEC-STD-A13-004` | Low/P3    | Accepted message events spawn unqueued push fanout with unbounded total work                                   |
| `SEC-STD-A14-001` | Low/P3    | DOCX legal upload expands compressed XML without expanded-size/execution budgets                               |
| `SEC-STD-A14-002` | Low/P3    | PDF legal upload parses every page without page/object/text/execution budgets                                  |
| `SEC-STD-A15-001` | Low/P3    | Concurrent same-kind branding uploads leave durable inactive objects and metadata                              |

Each ID is imported into `candidate-ledger.md` as `validated`. The incomplete
Deep proof gap is mapped separately as `SEC-DEEP-001` with status
`needs_follow_up`; it is not a vulnerability finding. Task 12 owns the
one-file-per-finding active registry reconciliation and must avoid duplicating
overlapping architecture or later-stage candidates.

## Reviewed Surfaces

The canonical coverage artifact records 25 reviewed security surfaces:

- tenant admission, customer/admin auth, recovery proofs and session lifecycle;
- tenant-scoped Postgres persistence, thread/message authority and attachments;
- Chatwoot HTTP authority, webhooks, realtime, push and Telegram boundaries;
- legal/branding parsers and storage, frontend/offline identity and navigation;
- deployment, configuration, secrets, dependencies, containers and ingress;
- public/event-driven resource controls, CSRF/origin and mutation boundaries.

Tenant resolution failed closed and no direct browser Chatwoot authority,
generic code-execution sink or reachable production dependency advisory was
validated. Those negative conclusions remain bounded by the recorded scope and
proof gaps rather than being global guarantees.

## Conditional Backend Deep Gate

Decision: `triggered`, then `incomplete — needs follow-up`.

The Standard validation closure explicitly retained plausible high-impact
backend uncertainty around Chatwoot redirect/credential authority and other
core backend boundaries. That satisfies the approved conditional escalation
rule even though the final calibrated Standard severities were Medium/Low.

The official Deep preflight reached `ready` for exact scope `backend/`. The
complete initial discovery evidence set passed artifact-health checks and its
53 deduplicated candidates were semantically reduced to 20 families. A second
saturation cycle was not started because the initial cycle consumed a
disproportionate token budget for the user-approved cost-aware Task 4.

Therefore the Deep workflow did **not** reach saturation, canonical validation,
attack-path analysis or generated final reporting. There is no authoritative
Deep `findings.json` or `report.md`, and no Deep candidate is imported as a
finding.

- Historical generated status path:
  `/tmp/codex-security-scans/chatwoot-client-portal-v2-audit-source-2026-07-13-backend-deep/a61b4975ae7b59e244c0b5bbc4efd02466aa075c_20260713T231902Z/artifacts/deep_merge/deep-scan-status.md`
- Historical generated merge path:
  `/tmp/codex-security-scans/chatwoot-client-portal-v2-audit-source-2026-07-13-backend-deep/a61b4975ae7b59e244c0b5bbc4efd02466aa075c_20260713T231902Z/artifacts/deep_merge/round-01-candidate-families.md`
- Durable recovered status:
  [`deep-scan-status.md`](../evidence/sec-deep-001-initial-discovery/deep-scan-status.md)
- Durable recovered merge:
  [`round-01-candidate-families.md`](../evidence/sec-deep-001-initial-discovery/round-01-candidate-families.md)
- Recovery provenance and checksums:
  [`recovery-receipt.md`](../evidence/sec-deep-001-initial-discovery/recovery-receipt.md)

The merge records nine families already covered by Standard findings, two
families repeating Standard-suppressed/ignored paths, and nine unresolved or
expanded candidate families. The latter are evidence-backed follow-up inputs,
not validated defects.

## Limitations And Deferred Evidence

Standard coverage is `partial`. Ten proof questions still require deployment,
telemetry, provider, real-browser/device or production-host evidence:

- safe browser image-decode resource limits;
- archived/disabled Telegram bridge re-enable policy;
- production SSH/temp-file and kernel symlink semantics;
- replica count and shared authentication limiter policy;
- Chatwoot response-byte limits;
- concurrent same-tenant provisioning;
- Telegram update IDs beyond JavaScript safe integer;
- cross-tab session rotation and service-worker outbox identity.

No production latency, cardinality, memory, queue-depth, ingress or shared-rate
limit measurements were supplied. Task 4 must not be read as dynamic proof for
every surface.

## Structural Hardening Direction

The generated hardening portfolio recommends two staged architectural themes:

1. generation-aware authority lifecycle for proofs, sessions, SSE and push;
2. bounded work admission/backpressure for uploads, parsing, webhook fanout,
   external calls and tenant-scoped scheduling.

These are proposals, not hidden implementation work. Per-finding focused fixes
and regression tests remain the first closure step; broader architecture should
be selected only after later audit stages finish reconciliation.
