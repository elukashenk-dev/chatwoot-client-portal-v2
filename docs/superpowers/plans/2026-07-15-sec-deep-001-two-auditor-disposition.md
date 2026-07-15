# SEC-DEEP-001 Two-Auditor Disposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:executing-plans` to execute this plan task-by-task. Task 4
> separately dispatches exactly two independent security auditors. Do not use
> `superpowers:subagent-driven-development` to add implementer/reviewer agents
> beyond that approved two-auditor budget. Steps use checkbox (`- [ ]`) syntax
> for tracking.

**Goal:** Resolve the nine known unresolved backend Deep candidate families
through two independent, bounded evidence reviews and either close
`SEC-DEEP-001` honestly or preserve its exact remaining blocker.

**Architecture:** Recover and seal the original nine-family inventory before
spending audit tokens, then freeze the historical and current source baselines.
Two isolated auditors review every family without seeing one another's work;
the coordinator validates artifact shape and reconciles only after both
reports are complete. This is targeted disposition, not a canonical Deep
Security Scan.

**Tech Stack:** Git and detached worktrees, Markdown and JSONL audit artifacts,
Node.js 24 for deterministic ledger validation, Codex Security validation and
attack-path skills, targeted local tests only when a family needs runtime
evidence.

**Approved specification:**
`docs/superpowers/specs/2026-07-15-sec-deep-001-two-auditor-disposition-design.md`

**Historical audit source:**
`docs/superpowers/plans/2026-07-13-full-application-risk-audit.md` and
`docs/superpowers/audits/2026-07-13-full-application-risk-audit/`.

## Global Constraints

- This plan does not authorize execution. Start Task 1 only after a new,
  explicit user instruction to run the two-auditor security review.
- Close the operator-gated production rollout and finding `F-CHAT-012` before
  execution begins.
- Use exactly two independent security auditors. The coordinator performs
  orchestration and reconciliation but does not become a third discovery
  auditor.
- Neither auditor may delegate, spawn another agent or request a separate
  write-up/reviewer worker. Their validation and attack-path work stays inside
  their own agent turn and assigned artifact directory.
- Both auditors review all nine recovered families; do not split the list into
  separate lanes.
- Do not invoke or claim `codex-security:deep-security-scan`. That workflow
  requires six workers and is not the approved method here.
- Do not run repository-wide or backend-wide discovery. Follow only direct
  callers, controls, sinks, tests and Git deltas required by a listed family.
- Do not edit product code, dependencies, migrations, environment files or
  Chatwoot core during the evidence review.
- Do not mutate production, access customer data, print secrets, push, deploy
  or open a remediation scope without separate approval.
- Runtime evidence must use local synthetic fixtures and be bounded to one
  family. If required evidence is unavailable, use `needs_follow_up`.
- The historical baseline is immutable commit
  `a61b4975ae7b59e244c0b5bbc4efd02466aa075c`.
- Freeze one then-current reviewed `main` commit after `F-CHAT-012` closes and
  use it as the immutable reassessment baseline.
- A likely Critical result is reported to the user immediately as unconfirmed
  when first seen. It becomes `confirmed_critical_or_high` only after both
  independent auditors support the same material path and impact.
- No full test suite is used as discovery. Targeted tests support individual
  dispositions; final documentation and ledger checks remain mandatory.
- Send the user a concise progress update at least every 60 seconds while
  workers or long commands are active. A background cell or idle auditor is
  progress state, not a completed turn.
- Point-in-time evidence stays under `docs/superpowers/audits/`; active
  validated product risks stay one-per-file under `docs/findings/`.
- Do not update `docs/roadmap/work-log.md` with audit commands, candidate
  counts, test lists or other audit minutiae.

## Planned Artifact Layout

Use this exact follow-up root:

```text
docs/superpowers/audits/2026-07-13-full-application-risk-audit/
  follow-ups/
    sec-deep-001-two-auditor/
      manifest.md
      input-ledger.md
      input-families.jsonl
      threat-model.md
      validate-ledgers.mjs
      auditor-a/
        assignment.md
        work-ledger.md
        report.md
        dispositions.jsonl
        poc/
      auditor-b/
        assignment.md
        work-ledger.md
        report.md
        dispositions.jsonl
        poc/
      reconciliation.md
      canonical-dispositions.jsonl
      final-report.md
```

The `poc/` directories are created only when an auditor needs a safe local
reproduction. Empty directories are not committed. Generated scan bulk and
restored raw worker outputs remain outside Git; the normalized nine-family
ledger, provenance and SHA-256 receipts are committed.

---

### Task 1: Enforce Entry Gates And Recover The Original Inventory

**Files:**

- Read: `docs/findings/F-CHAT-012-chat-unavailable-after-code-login.md`
- Read:
  `docs/superpowers/audits/2026-07-13-full-application-risk-audit/stages/02-security.md`
- Read:
  `docs/superpowers/audits/2026-07-13-full-application-risk-audit/final-report.md`
- Create:
  `docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/input-ledger.md`
- Create:
  `docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/input-families.jsonl`

**Interfaces:**

- Consumes: separate user execution approval, closed `F-CHAT-012`, and a
  restored immutable copy of the original Deep merge artifacts.
- Produces: exactly nine normalized records named `DEEP-R1-F01` through
  `DEEP-R1-F09`, plus provenance and checksums used by both auditors.

- [ ] **Step 1: Verify execution was separately approved**

Record the approving user message verbatim only as a short approval summary in
the future `manifest.md`; do not copy unrelated chat content. If the latest
user instruction approves only this plan, stop here and report that execution
permission is still missing.

Expected: an explicit instruction equivalent to “start the two-auditor
security review.”

- [ ] **Step 2: Create the dedicated execution branch**

Run from a clean control checkout after the planning branch has been integrated
locally:

```bash
git switch main
git status --short --branch
test -f docs/superpowers/plans/2026-07-15-sec-deep-001-two-auditor-disposition.md
test -f docs/superpowers/specs/2026-07-15-sec-deep-001-two-auditor-disposition-design.md
git switch -c docs/sec-deep-001-two-auditor-execution
```

Expected: `main` is clean, contains the approved spec and plan, and the new
branch is created without replacing an existing branch.

- [ ] **Step 3: Verify the prerequisite finding is closed**

Run:

```bash
test ! -e docs/findings/F-CHAT-012-chat-unavailable-after-code-login.md
git status --short --branch
```

Expected: the `test` exits `0`, and the current worktree has no unclear or
unrelated changes. If the finding file still exists, stop without searching
for scan artifacts or creating auditors.

- [ ] **Step 4: Perform one bounded recovery search**

Run this exact selection command:

```bash
mapfile -t RECOVERED_FAMILY_FILES < <(
  find /home/evluk/backups /home/evluk/recovered /tmp/codex-security-scans \
    -type f \
    -path '*/a61b4975ae7b59e244c0b5bbc4efd02466aa075c_20260713T231902Z/artifacts/deep_merge/round-01-candidate-families.md' \
    -print 2>/dev/null | sort -u
)
printf '%s\n' "${RECOVERED_FAMILY_FILES[@]}"
test "${#RECOVERED_FAMILY_FILES[@]}" -eq 1
FAMILIES_FILE=${RECOVERED_FAMILY_FILES[0]}
```

Expected: exactly one candidate path belonging to scan id
`a61b4975ae7b59e244c0b5bbc4efd02466aa075c_20260713T231902Z`.

If no path is returned, record no invented family names, do not spawn either
auditor, and stop with the exact blocker: the historical input inventory is
not recoverable from the approved local sources. If more than one path is
returned, stop and require the recovery owner to provide one authoritative
immutable export; do not select a source by convenience.

- [ ] **Step 5: Verify the recovered pair belongs to one scan**

Use `FAMILIES_FILE` selected by Step 4, then run:

```bash
RECOVERED_SCAN_DIR="${FAMILIES_FILE%/artifacts/deep_merge/round-01-candidate-families.md}"
STATUS_FILE="$RECOVERED_SCAN_DIR/artifacts/deep_merge/deep-scan-status.md"
test -f "$FAMILIES_FILE"
test -f "$STATUS_FILE"
sha256sum "$FAMILIES_FILE" "$STATUS_FILE"
```

Expected: both `test` commands exit `0`; the two SHA-256 receipts print without
reading or exposing secrets.

- [ ] **Step 6: Reconcile the recovered totals before normalization**

Read both recovered files completely. Confirm that their preserved merge
records state all of the following:

```text
53 deduplicated worker candidates
20 semantically merged families
9 families covered by Standard findings
2 families repeating suppressed or ignored Standard paths
9 unresolved or expanded families
```

Expected: every count agrees with
`stages/02-security.md#conditional-backend-deep-gate`. Any disagreement blocks
execution and must be reported without choosing the more convenient source.

- [ ] **Step 7: Create the normalized nine-family input files**

Use `apply_patch` to create `input-families.jsonl` with one JSON object per
unresolved or expanded family, preserving original order. Assign deterministic
IDs `DEEP-R1-F01` through `DEEP-R1-F09`. Map fields exactly as follows:

| JSONL field                 | Required value source                                |
| --------------------------- | ---------------------------------------------------- |
| `familyId`                  | Sequential deterministic ID in preserved merge order |
| `title`                     | Verbatim title from the recovered family record      |
| `originalDisposition`       | Literal `unresolved_or_expanded`                     |
| `originalEvidence[].path`   | Recovered repository-relative evidence path          |
| `originalEvidence[].lines`  | Recovered line or line range as a string             |
| `originalEvidence[].detail` | Recovered explanation of why the location matters    |
| `sourceCandidateIds[]`      | Every worker candidate ID absorbed by the family     |
| `sourceArtifactSha256`      | Step 5 SHA-256 for `round-01-candidate-families.md`  |

Never populate a field from recollection or a newly generated hypothesis.

Use `apply_patch` to create `input-ledger.md` with:

- original scan id and historical commit;
- recovered source path outside Git;
- both SHA-256 receipts;
- the five verified totals from Step 6;
- a table mapping `DEEP-R1-F01`–`DEEP-R1-F09` to original family titles and
  source candidate IDs;
- a statement that no new discovery was used to construct the input.

- [ ] **Step 8: Review and checkpoint the recovered input**

Run:

```bash
pnpm exec prettier --write \
  docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/input-ledger.md
node -e "const fs=require('node:fs');const p='docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/input-families.jsonl';const rows=fs.readFileSync(p,'utf8').trim().split(/\n/).map(JSON.parse);if(rows.length!==9)throw new Error('expected 9 families');const ids=rows.map(r=>r.familyId);const expected=Array.from({length:9},(_,i)=>'DEEP-R1-F'+String(i+1).padStart(2,'0'));if(JSON.stringify(ids)!==JSON.stringify(expected))throw new Error('family ids/order mismatch');"
git diff --check
```

Expected: Prettier succeeds, Node exits `0`, and `git diff --check` prints
nothing.

Commit only the two normalized input files after focused evidence review:

```bash
git add \
  docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/input-ledger.md \
  docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/input-families.jsonl
git commit -m "docs(audit): recover sec-deep candidate inventory"
```

---

### Task 2: Freeze Historical And Current Reassessment Sources

**Files:**

- Create:
  `docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/manifest.md`
- Read-only source:
  `/home/evluk/projects/chatwoot-client-portal-v2-audit-source-2026-07-13`
- Create read-only source worktree:
  `/home/evluk/projects/chatwoot-client-portal-v2-sec-deep-001-current`

**Interfaces:**

- Consumes: sealed input ledger from Task 1 and the then-current reviewed
  `main` commit.
- Produces: two immutable source roots and a manifest that every later artifact
  cites.

- [ ] **Step 1: Load the worktree workflow before isolation**

Read `superpowers:using-git-worktrees` completely. Detect whether the control
checkout is already a linked worktree:

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" && pwd -P)
BRANCH=$(git branch --show-current)
printf '%s\n' "$GIT_DIR" "$GIT_COMMON" "$BRANCH"
```

Expected: the branch is a dedicated docs execution branch created from the
reviewed `main`; do not execute on detached `HEAD` or with unclear changes.

- [ ] **Step 2: Verify or recreate the historical detached source**

Run:

```bash
HISTORICAL_COMMIT=a61b4975ae7b59e244c0b5bbc4efd02466aa075c
HISTORICAL_ROOT=/home/evluk/projects/chatwoot-client-portal-v2-audit-source-2026-07-13
if test -d "$HISTORICAL_ROOT"; then
  git -C "$HISTORICAL_ROOT" rev-parse HEAD
  git -C "$HISTORICAL_ROOT" status --short
else
  git worktree add --detach "$HISTORICAL_ROOT" "$HISTORICAL_COMMIT"
fi
```

Expected: `HEAD` is exactly the historical commit and status prints nothing.

- [ ] **Step 3: Freeze the current reassessment commit**

Run from the control repository:

```bash
git status --short --branch
REASSESSMENT_COMMIT=$(git rev-parse main)
CURRENT_ROOT=/home/evluk/projects/chatwoot-client-portal-v2-sec-deep-001-current
test ! -e "$CURRENT_ROOT"
git worktree add --detach "$CURRENT_ROOT" "$REASSESSMENT_COMMIT"
git -C "$CURRENT_ROOT" status --short
git -C "$CURRENT_ROOT" rev-parse HEAD
```

Expected: the new worktree is detached at the recorded `main` commit and clean.
Do not advance or replace this target during the review.

- [ ] **Step 4: Create the manifest**

Use `apply_patch` to create `manifest.md` with:

```text
Status: prepared
Method: targeted two-auditor disposition; not canonical Deep Security Scan
Historical commit: a61b4975ae7b59e244c0b5bbc4efd02466aa075c
Historical root: /home/evluk/projects/chatwoot-client-portal-v2-audit-source-2026-07-13
Reassessment commit: exact Step 3 commit
Reassessment root: /home/evluk/projects/chatwoot-client-portal-v2-sec-deep-001-current
Input family count: 9
Auditor count: 2
Production mutation: prohibited
Product-code mutation: prohibited
Execution approval: date and concise approving instruction
```

Also record the control branch, `origin/main` relationship, input-ledger commit
and recovered source checksums.

- [ ] **Step 5: Validate and checkpoint the frozen baseline**

Run:

```bash
test "$(git -C "$HISTORICAL_ROOT" rev-parse HEAD)" = "$HISTORICAL_COMMIT"
test "$(git -C "$CURRENT_ROOT" rev-parse HEAD)" = "$REASSESSMENT_COMMIT"
test -z "$(git -C "$HISTORICAL_ROOT" status --short)"
test -z "$(git -C "$CURRENT_ROOT" status --short)"
pnpm exec prettier --check \
  docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/manifest.md
git diff --check
```

Expected: every command exits `0` and no source worktree has changes.

Commit:

```bash
git add docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/manifest.md
git commit -m "docs(audit): freeze sec-deep reassessment baseline"
```

---

### Task 3: Create Deterministic Auditor Contracts And Ledger Validation

**Files:**

- Create:
  `docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/auditor-a/assignment.md`
- Create:
  `docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/auditor-b/assignment.md`
- Create:
  `docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/threat-model.md`
- Create:
  `docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/validate-ledgers.mjs`

**Interfaces:**

- Consumes: `manifest.md`, `input-families.jsonl`, the stable architecture
  documents and both immutable source roots.
- Produces: one shared bounded threat model, two isolated worker contracts and
  one deterministic validator for input, auditor and canonical JSONL records.

- [ ] **Step 1: Create the bounded reassessment threat model**

Read `docs/architecture/overview.md`, `docs/architecture/decisions.md`,
`stages/01-architecture-invariants.md`, `stages/02-security.md` and both source
baselines. Use `apply_patch` to create `threat-model.md` containing only the
security context needed to validate the recovered families:

- in-scope actors: unauthenticated internet user, authenticated customer,
  tenant administrator, compromised or misconfigured trusted upstream,
  malicious tenant input and operator error;
- trust boundaries: browser → portal backend, tenant resolution, customer and
  admin sessions, portal backend → isolated Postgres/object storage/Chatwoot,
  webhook/realtime ingress and deployment secrets;
- protected assets: cross-tenant isolation, session authority, Chatwoot
  credentials, customer chat data, database integrity and bounded service
  availability;
- exposure evidence from repository routes, ingress/runbooks and service
  configuration on both commits;
- explicit exclusions: speculative infrastructure not represented by code or
  deployment evidence, unrelated frontend-only candidates and new broad
  discovery;
- proof standard: concrete source, closest control, sink, preconditions,
  impact, strongest counterevidence and current-baseline applicability.

The threat model must not contain candidate conclusions or assign expected
dispositions. Both auditors receive the same neutral context.

- [ ] **Step 2: Define the shared auditor record contract**

Each auditor must write exactly nine JSONL objects with these fields:

```json
{
  "familyId": "DEEP-R1-F01",
  "historicalReachability": "reachable",
  "currentApplicability": "present",
  "proposedDisposition": "confirmed_medium_or_low",
  "severity": "Medium",
  "confidence": "high",
  "source": "concrete attacker or failure input",
  "control": "closest relevant control and why it holds or fails",
  "sink": "reachable sensitive operation or external effect",
  "impact": "concrete evidence-supported consequence",
  "preconditions": "required authority, state and timing",
  "affectedLocations": [
    {
      "baseline": "current",
      "label": "closest_control",
      "path": "backend/src/example.ts",
      "lines": "10-25"
    }
  ],
  "evidence": [
    {
      "kind": "static",
      "ref": "backend/src/example.ts:10-25",
      "result": "what the evidence proves"
    }
  ],
  "existingFindingIds": []
}
```

Allowed values:

- `historicalReachability`: `reachable`, `not_reachable`, `unclear`;
- `currentApplicability`: `present`, `fixed`, `not_applicable`, `unclear`;
- `proposedDisposition`: `confirmed_critical_or_high`,
  `confirmed_medium_or_low`, `duplicate`, `rejected`,
  `fixed_on_current_baseline`, `needs_follow_up`;
- `severity`: `Critical`, `High`, `Medium`, `Low`, `None`, `Unknown`;
- `confidence`: `high`, `medium`, `low`;
- evidence `kind`: `static`, `test`, `git_delta`, `counterevidence`,
  `external_blocker`.

- [ ] **Step 3: Write Auditor A's exact assignment**

Use `apply_patch` to create `auditor-a/assignment.md`. It must instruct the
auditor to:

1. read the manifest, shared threat model, input ledger, all nine JSONL input
   records, historical Stage 02 and related open findings;
2. load `codex-security:validation` and `codex-security:attack-path-analysis`;
3. review all nine families against both immutable roots;
4. actively try to prove the strongest concrete source → control → sink →
   impact path without widening into discovery;
5. use only targeted local synthetic checks when static proof is insufficient;
6. write `work-ledger.md`, `report.md` and `dispositions.jsonl` only under
   `auditor-a/`;
7. use those assigned paths as the user-provided validation and attack-path
   output paths instead of creating a separate default scan bundle;
8. never delegate, spawn another agent, or request a write-up worker;
9. never list, read or infer anything under `auditor-b/`;
10. never edit either source root or product code;
11. return only after all nine records exist or each unavailable proof is marked
    `needs_follow_up` with an exact blocker.

- [ ] **Step 4: Write Auditor B's exact assignment**

Use `apply_patch` to create `auditor-b/assignment.md`. It must instruct the
auditor to:

1. consume the same manifest, neutral threat model, nine input records and
   immutable roots;
2. load the same validation and attack-path skills;
3. review all nine families independently;
4. challenge reachability, authority, tenant boundaries, preconditions,
   countercontrols, severity and current applicability;
5. reproduce negative cases locally when bounded evidence is necessary;
6. write `work-ledger.md`, `report.md` and `dispositions.jsonl` only under
   `auditor-b/`;
7. use those assigned paths as the user-provided validation and attack-path
   output paths instead of creating a separate default scan bundle;
8. never delegate, spawn another agent, or request a write-up worker;
9. never list, read or infer anything under `auditor-a/`;
10. never edit either source root or product code;
11. map a duplicate only when one existing finding's remediation closes the
    complete source/control/sink/impact tuple;
12. return only after all nine records have evidence-backed dispositions or
    explicit `needs_follow_up` blockers.

- [ ] **Step 5: Write the ledger validator**

Use `apply_patch` to create `validate-ledgers.mjs` with this complete content:

```js
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(
  'docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor',
)

const expectedIds = Array.from(
  { length: 9 },
  (_, index) => `DEEP-R1-F${String(index + 1).padStart(2, '0')}`,
)
const reachability = new Set(['reachable', 'not_reachable', 'unclear'])
const applicability = new Set(['present', 'fixed', 'not_applicable', 'unclear'])
const dispositions = new Set([
  'confirmed_critical_or_high',
  'confirmed_medium_or_low',
  'duplicate',
  'rejected',
  'fixed_on_current_baseline',
  'needs_follow_up',
])
const severities = new Set([
  'Critical',
  'High',
  'Medium',
  'Low',
  'None',
  'Unknown',
])
const confidence = new Set(['high', 'medium', 'low'])
const evidenceKinds = new Set([
  'static',
  'test',
  'git_delta',
  'counterevidence',
  'external_blocker',
])

function readJsonl(relativePath) {
  const text = readFileSync(resolve(root, relativePath), 'utf8').trim()
  if (!text) throw new Error(`${relativePath}: empty JSONL`)
  return text.split(/\n/).map((line, index) => {
    try {
      return JSON.parse(line)
    } catch (error) {
      throw new Error(`${relativePath}:${index + 1}: ${error.message}`)
    }
  })
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label}: expected non-empty string`)
  }
}

function requireExactIds(rows, label) {
  const ids = rows.map((row) => row.familyId)
  if (JSON.stringify(ids) !== JSON.stringify(expectedIds)) {
    throw new Error(`${label}: expected ordered ids ${expectedIds.join(', ')}`)
  }
}

function validateInput() {
  const rows = readJsonl('input-families.jsonl')
  requireExactIds(rows, 'input')
  for (const row of rows) {
    requireString(row.title, `${row.familyId}.title`)
    if (row.originalDisposition !== 'unresolved_or_expanded') {
      throw new Error(`${row.familyId}: invalid originalDisposition`)
    }
    if (
      !Array.isArray(row.originalEvidence) ||
      row.originalEvidence.length === 0
    ) {
      throw new Error(`${row.familyId}: originalEvidence required`)
    }
    for (const item of row.originalEvidence) {
      requireString(item.path, `${row.familyId}.originalEvidence.path`)
      requireString(item.lines, `${row.familyId}.originalEvidence.lines`)
      requireString(item.detail, `${row.familyId}.originalEvidence.detail`)
    }
    if (
      !Array.isArray(row.sourceCandidateIds) ||
      row.sourceCandidateIds.length === 0
    ) {
      throw new Error(`${row.familyId}: sourceCandidateIds required`)
    }
    for (const candidateId of row.sourceCandidateIds) {
      requireString(candidateId, `${row.familyId}.sourceCandidateIds`)
    }
    requireString(
      row.sourceArtifactSha256,
      `${row.familyId}.sourceArtifactSha256`,
    )
    if (!/^[a-f0-9]{64}$/.test(row.sourceArtifactSha256)) {
      throw new Error(
        `${row.familyId}: sourceArtifactSha256 must be lowercase SHA-256`,
      )
    }
  }
}

function validateAuditor(relativePath) {
  const rows = readJsonl(relativePath)
  requireExactIds(rows, relativePath)
  for (const row of rows) {
    if (!reachability.has(row.historicalReachability))
      throw new Error(`${row.familyId}: invalid historicalReachability`)
    if (!applicability.has(row.currentApplicability))
      throw new Error(`${row.familyId}: invalid currentApplicability`)
    if (!dispositions.has(row.proposedDisposition))
      throw new Error(`${row.familyId}: invalid proposedDisposition`)
    if (!severities.has(row.severity))
      throw new Error(`${row.familyId}: invalid severity`)
    if (!confidence.has(row.confidence))
      throw new Error(`${row.familyId}: invalid confidence`)
    for (const field of [
      'source',
      'control',
      'sink',
      'impact',
      'preconditions',
    ]) {
      requireString(row[field], `${row.familyId}.${field}`)
    }
    if (
      !Array.isArray(row.affectedLocations) ||
      row.affectedLocations.length === 0
    ) {
      throw new Error(`${row.familyId}: affectedLocations required`)
    }
    for (const item of row.affectedLocations) {
      if (!new Set(['historical', 'current']).has(item.baseline)) {
        throw new Error(`${row.familyId}: invalid affected-location baseline`)
      }
      requireString(item.label, `${row.familyId}.affectedLocations.label`)
      requireString(item.path, `${row.familyId}.affectedLocations.path`)
      requireString(item.lines, `${row.familyId}.affectedLocations.lines`)
    }
    if (!Array.isArray(row.evidence) || row.evidence.length === 0) {
      throw new Error(`${row.familyId}: evidence required`)
    }
    for (const item of row.evidence) {
      if (!evidenceKinds.has(item.kind))
        throw new Error(`${row.familyId}: invalid evidence kind`)
      requireString(item.ref, `${row.familyId}.evidence.ref`)
      requireString(item.result, `${row.familyId}.evidence.result`)
    }
    if (!Array.isArray(row.existingFindingIds)) {
      throw new Error(`${row.familyId}: existingFindingIds must be an array`)
    }
    if (
      row.proposedDisposition === 'duplicate' &&
      (!Array.isArray(row.existingFindingIds) ||
        row.existingFindingIds.length === 0)
    ) {
      throw new Error(`${row.familyId}: duplicate requires existingFindingIds`)
    }
    if (
      row.proposedDisposition === 'confirmed_critical_or_high' &&
      !new Set(['Critical', 'High']).has(row.severity)
    ) {
      throw new Error(
        `${row.familyId}: critical/high disposition has incompatible severity`,
      )
    }
    if (
      row.proposedDisposition === 'confirmed_medium_or_low' &&
      !new Set(['Medium', 'Low']).has(row.severity)
    ) {
      throw new Error(
        `${row.familyId}: medium/low disposition has incompatible severity`,
      )
    }
    if (
      new Set(['rejected', 'fixed_on_current_baseline']).has(
        row.proposedDisposition,
      ) &&
      row.severity !== 'None'
    ) {
      throw new Error(
        `${row.familyId}: rejected/fixed disposition must use severity None`,
      )
    }
    if (row.proposedDisposition === 'fixed_on_current_baseline') {
      const kinds = new Set(row.evidence.map((item) => item.kind))
      if (!kinds.has('git_delta') || !kinds.has('test')) {
        throw new Error(
          `${row.familyId}: fixed disposition requires git_delta and test evidence`,
        )
      }
    }
  }
}

function validateCanonical() {
  const rows = readJsonl('canonical-dispositions.jsonl')
  requireExactIds(rows, 'canonical')
  for (const row of rows) {
    if (!dispositions.has(row.disposition))
      throw new Error(`${row.familyId}: invalid canonical disposition`)
    if (!severities.has(row.severity))
      throw new Error(`${row.familyId}: invalid canonical severity`)
    if (typeof row.agreement !== 'boolean')
      throw new Error(`${row.familyId}: agreement must be boolean`)
    if (typeof row.plausibleHighOpen !== 'boolean')
      throw new Error(`${row.familyId}: plausibleHighOpen must be boolean`)
    requireString(row.adjudication, `${row.familyId}.adjudication`)
    if (!Array.isArray(row.evidenceRefs) || row.evidenceRefs.length < 2) {
      throw new Error(
        `${row.familyId}: at least two independent evidenceRefs required`,
      )
    }
    if (
      !row.evidenceRefs.some((ref) => ref.startsWith('auditor-a/')) ||
      !row.evidenceRefs.some((ref) => ref.startsWith('auditor-b/'))
    ) {
      throw new Error(
        `${row.familyId}: evidenceRefs must include both auditors`,
      )
    }
    if (!Array.isArray(row.findingIds))
      throw new Error(`${row.familyId}: findingIds must be an array`)
  }
}

function validateFinal() {
  validateCanonical()
  const rows = readJsonl('canonical-dispositions.jsonl')
  for (const row of rows) {
    if (
      new Set([
        'confirmed_critical_or_high',
        'confirmed_medium_or_low',
        'duplicate',
      ]).has(row.disposition) &&
      row.findingIds.length === 0
    ) {
      throw new Error(
        `${row.familyId}: surviving or duplicate disposition requires findingIds`,
      )
    }
  }
}

const mode = process.argv[2]
if (mode === 'input') validateInput()
else if (mode === 'auditors') {
  validateInput()
  validateAuditor('auditor-a/dispositions.jsonl')
  validateAuditor('auditor-b/dispositions.jsonl')
} else if (mode === 'canonical') {
  validateInput()
  validateAuditor('auditor-a/dispositions.jsonl')
  validateAuditor('auditor-b/dispositions.jsonl')
  validateCanonical()
} else if (mode === 'final') {
  validateInput()
  validateAuditor('auditor-a/dispositions.jsonl')
  validateAuditor('auditor-b/dispositions.jsonl')
  validateFinal()
} else {
  throw new Error(
    'usage: node validate-ledgers.mjs input|auditors|canonical|final',
  )
}
```

- [ ] **Step 6: Validate contracts before spawning workers**

Run:

```bash
node docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/validate-ledgers.mjs input
pnpm exec prettier --check \
  docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/auditor-a/assignment.md \
  docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/auditor-b/assignment.md \
  docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/threat-model.md \
  docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/validate-ledgers.mjs
git diff --check
```

Expected: all commands exit `0`.

Commit:

```bash
git add \
  docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/auditor-a/assignment.md \
  docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/auditor-b/assignment.md \
  docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/threat-model.md \
  docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/validate-ledgers.mjs
git commit -m "docs(audit): prepare two-auditor disposition"
```

---

### Task 4: Run Exactly Two Independent Auditor Passes

**Files:**

- Create by Auditor A:
  `docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/auditor-a/work-ledger.md`
- Create by Auditor A:
  `docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/auditor-a/report.md`
- Create by Auditor A:
  `docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/auditor-a/dispositions.jsonl`
- Create by Auditor B: the corresponding three files under `auditor-b/`.

**Interfaces:**

- Consumes: sealed manifest, input ledger, assignments and two immutable source
  roots.
- Produces: two complete, isolated nine-family evidence sets. No reconciliation
  occurs during this task.

- [ ] **Step 1: Reconfirm capacity and source immutability**

Run:

```bash
test -z "$(git -C /home/evluk/projects/chatwoot-client-portal-v2-audit-source-2026-07-13 status --short)"
test -z "$(git -C /home/evluk/projects/chatwoot-client-portal-v2-sec-deep-001-current status --short)"
```

Expected: both exit `0`. Confirm at least three available agent slots: one
coordinator plus exactly two auditors. Do not reserve six or nine threads.

- [ ] **Step 2: Load the parallel-dispatch workflow**

Read `superpowers:dispatching-parallel-agents` completely. Apply it only to the
two approved independent assignments. Do not create extra review, write-up or
specialist agents.

- [ ] **Step 3: Spawn both auditors concurrently**

Dispatch exactly two agents with `fork_turns="none"`:

```text
Task name: sec_deep_proof_builder
Prompt: Read and execute only auditor-a/assignment.md. Review all nine input
families against the two immutable source roots. Write only auditor-a artifacts.
Do not read auditor-b. Do not edit product code. Return after the three required
artifacts are complete.
```

```text
Task name: sec_deep_independent_challenger
Prompt: Read and execute only auditor-b/assignment.md. Review all nine input
families against the two immutable source roots. Write only auditor-b artifacts.
Do not read auditor-a. Do not edit product code. Return after the three required
artifacts are complete.
```

Do not add family hints, prior conclusions or different target scope to either
prompt.

- [ ] **Step 4: Monitor without breaking independence**

Until both agents are idle:

- provide the user short status updates at intervals below 60 seconds;
- inspect only agent status and existence/parseability of the expected files;
- do not read substantive report content while the other auditor is active;
- do not send one auditor information learned from the other;
- do not start coordinator source review.

If an auditor fails before producing a usable report, replace that same role
once with the same assignment. The failed incomplete run is not counted as a
third opinion. If the replacement also fails, preserve available artifacts and
stop as blocked.

- [ ] **Step 5: Handle a likely Critical signal safely**

If one completed auditor reports a likely Critical before the other finishes,
notify the user immediately that it is a single-auditor, unconfirmed signal.
Continue only read-only validation. Do not fix, deploy, contact external parties
or reveal exploit details beyond what the owner needs to understand the risk.

- [ ] **Step 6: Validate both completed ledgers**

After both agents are idle, run:

```bash
node docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/validate-ledgers.mjs auditors
test -z "$(git -C /home/evluk/projects/chatwoot-client-portal-v2-audit-source-2026-07-13 status --short)"
test -z "$(git -C /home/evluk/projects/chatwoot-client-portal-v2-sec-deep-001-current status --short)"
git diff --check
```

Expected: exactly nine valid records from each auditor, and both source roots
remain clean. Schema defects return to the same auditor for repair; they do not
authorize a new substantive review pass.

- [ ] **Step 7: Checkpoint both independent results together**

Run Prettier on both Markdown reports and work ledgers, inspect the exact diff
for secrets and source mutations, then commit both completed evidence sets in
one checkpoint so neither becomes an input to the other:

```bash
git add \
  docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/auditor-a \
  docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/auditor-b
git commit -m "docs(audit): record independent sec-deep reviews"
```

---

### Task 5: Reconcile Without Adding A Third Audit Lane

**Files:**

- Create:
  `docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/reconciliation.md`
- Create:
  `docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/canonical-dispositions.jsonl`

**Interfaces:**

- Consumes: two complete auditor ledgers validated by Task 4.
- Produces: exactly nine canonical disposition receipts and the current
  `SEC-DEEP-001` closure decision.

- [ ] **Step 1: Compare both records family by family**

For each `DEEP-R1-F01`–`DEEP-R1-F09`, record both conclusions without deleting
minority evidence. Apply this decision matrix:

| Auditor results                                                                               | Canonical result                                                |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Both prove materially the same Critical/High path and impact                                  | `confirmed_critical_or_high`; use the higher supported severity |
| Both prove a real Medium/Low issue                                                            | `confirmed_medium_or_low`; map or create a finding              |
| Both reject the path with concrete evidence                                                   | `rejected`                                                      |
| Both map the complete proof tuple to the same existing finding                                | `duplicate`                                                     |
| Both prove the same reviewed Git delta and regression                                         | `fixed_on_current_baseline`                                     |
| Material disagreement, unclear reachability, unavailable proof or different duplicate targets | `needs_follow_up`                                               |

Do not average severity or let a coordinator opinion break a material tie.

- [ ] **Step 2: Write canonical JSONL records**

Use `apply_patch` to create one ordered JSON object per family. Populate fields
using this exact mapping:

| JSONL field         | Required value                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `familyId`          | The unchanged `DEEP-R1-F01`–`DEEP-R1-F09` input ID                                         |
| `disposition`       | One allowed canonical result from the Step 1 decision matrix                               |
| `severity`          | Highest severity supported by both evidence sets, or `Unknown` for unresolved disagreement |
| `agreement`         | `true` only when both auditors materially agree on reachability, impact and result         |
| `plausibleHighOpen` | `true` only when plausible High impact remains unresolved                                  |
| `adjudication`      | Concrete comparison of both evidence sets and the reason the matrix selected this result   |
| `evidenceRefs`      | At least one `auditor-a/report.md#...` and one `auditor-b/report.md#...` anchor            |
| `findingIds`        | Existing mapped IDs, or an empty array until Task 6 registers a surviving new finding      |

Set `plausibleHighOpen` to `true` whenever a plausible High path remains
unresolved. A confirmed Critical/High has `plausibleHighOpen=false` because the
proof gap is resolved, but its new validated finding independently blocks a
safe verdict.

- [ ] **Step 3: Write the reconciliation report**

Use `apply_patch` to create `reconciliation.md` containing:

- both immutable commits and the input checksum;
- a nine-row table with Auditor A, Auditor B and canonical result;
- preserved material disagreements;
- duplicate remediation-subsumption reasoning;
- confirmed finding mappings;
- count of `plausibleHighOpen=true` records;
- an explicit statement that this was two-auditor targeted disposition, not a
  completed Deep Security Scan.

- [ ] **Step 4: Validate the canonical ledger**

Run:

```bash
node docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/validate-ledgers.mjs canonical
node -e "const fs=require('node:fs');const p='docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/canonical-dispositions.jsonl';const rows=fs.readFileSync(p,'utf8').trim().split(/\n/).map(JSON.parse);const open=rows.filter(r=>r.plausibleHighOpen);console.log(JSON.stringify({families:rows.length,plausibleHighOpen:open.map(r=>r.familyId)}));"
pnpm exec prettier --check \
  docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/reconciliation.md
git diff --check
```

Expected: schema validation exits `0`; the second command prints exactly nine
families and the explicit list of any still-open High hypotheses.

- [ ] **Step 5: Decide closure without changing product code**

- If any record has `plausibleHighOpen=true`, keep `SEC-DEEP-001` open.
- If none has `plausibleHighOpen=true`, the proof gap may close through targeted
  disposition.
- If any record is `confirmed_critical_or_high`, report it immediately and keep
  the product verdict blocked by the new validated finding even though the
  uncertainty represented by `SEC-DEEP-001` is resolved.
- Do not start remediation in any of these cases.

Commit:

```bash
git add \
  docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/reconciliation.md \
  docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/canonical-dispositions.jsonl
git commit -m "docs(audit): reconcile sec-deep dispositions"
```

---

### Task 6: Register Surviving Findings And Update Audit State

**Files:**

- Create when needed: one new `docs/findings/F-<AREA>-<NNN>-<slug>.md` per
  distinct confirmed risk not already registered.
- Modify when needed: an existing `docs/findings/*.md` only to add materially
  new evidence to the same proof tuple.
- Create:
  `docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/final-report.md`
- Modify:
  `docs/superpowers/audits/2026-07-13-full-application-risk-audit/stages/02-security.md`
- Modify:
  `docs/superpowers/audits/2026-07-13-full-application-risk-audit/candidate-ledger.md`
- Modify:
  `docs/superpowers/audits/2026-07-13-full-application-risk-audit/coverage-matrix.md`
- Modify:
  `docs/superpowers/audits/2026-07-13-full-application-risk-audit/final-report.md`

**Interfaces:**

- Consumes: canonical dispositions and reconciliation from Task 5.
- Produces: active finding records, an explicit follow-up report and a current
  audit status that preserves the historical verdict.

- [ ] **Step 1: Reconcile confirmed risks with the finding registry**

For every `confirmed_critical_or_high` or `confirmed_medium_or_low` record:

1. search `docs/findings/` by affected path, control, sink and remediation;
2. map to an existing finding only when the remediation fully closes the
   canonical proof tuple;
3. otherwise allocate the next free `F-<AREA>-<NNN>` identifier and create one
   finding file containing all fields required by `docs/findings/README.md`;
4. use a separate `fix/<area>-<family-id-lowercase>` branch for each new
   finding registration and cherry-pick its docs-only commit into the audit
   execution branch;
5. do not implement any fix.

The exact new paths are derived from the surviving canonical results; no file
is created for rejected, fixed or fully duplicate families.

After registration, update each surviving or duplicate record in
`canonical-dispositions.jsonl` so `findingIds` contains the exact active finding
IDs. Run:

```bash
node docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/validate-ledgers.mjs final
```

Expected: the final ledger contract exits `0`; no confirmed or duplicate
family lacks a finding mapping.

- [ ] **Step 2: Write the focused follow-up final report**

Create `follow-ups/sec-deep-001-two-auditor/final-report.md` with:

- method and explicit non-Deep label;
- both source commits and input checksum;
- nine-family canonical table;
- newly created and existing finding mappings;
- rejected/fixed evidence summary;
- unresolved evidence and exact next action;
- `SEC-DEEP-001` result: `closed_by_targeted_disposition` or
  `needs_follow_up`;
- statement that `OPS-009`, `F-OPS-002` and all other findings were outside
  this scope;
- statement that closing `SEC-DEEP-001` alone does not produce `GO`.

- [ ] **Step 3: Append, do not erase, historical audit context**

Update the four historical audit artifacts with a dated follow-up note:

- `stages/02-security.md`: link the two-auditor evidence and state the method;
- `candidate-ledger.md`: preserve the original `SEC-DEEP-001` row and append
  the current follow-up state plus finding IDs;
- `coverage-matrix.md`: preserve the original incomplete-Deep limitation and
  add the current targeted-disposition result;
- `final-report.md`: add a reassessment addendum and update the current blocker
  explanation without rewriting the frozen-commit history.

If any plausible High remains open, every document must continue to show
`SEC-DEEP-001` as blocking. If the proof gap closes but a Critical/High finding
survives, replace the uncertainty blocker with that validated finding; do not
improve the overall verdict.

- [ ] **Step 4: Update manifest status**

Change the follow-up `manifest.md` status from `prepared` to one of:

```text
complete — SEC-DEEP-001 closed by targeted disposition
complete — SEC-DEEP-001 remains needs_follow_up
```

Record exact canonical counts, finding IDs and the final follow-up report path.

---

### Task 7: Perform Final Evidence And Documentation Closure

**Files:**

- Verify every file created or modified by Tasks 1–6.
- Do not modify product code or `docs/roadmap/work-log.md` in this task.

**Interfaces:**

- Consumes: complete follow-up artifacts and audit-state updates.
- Produces: one reviewed docs-only checkpoint ready for user acceptance or
  merge; no audit execution remains active.

- [ ] **Step 1: Run deterministic ledger checks again**

Run:

```bash
node docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/validate-ledgers.mjs final
test "$(find docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor -mindepth 1 -maxdepth 1 -type d -name 'auditor-*' | wc -l)" -eq 2
test "$(wc -l < docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/auditor-a/dispositions.jsonl)" -eq 9
test "$(wc -l < docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/auditor-b/dispositions.jsonl)" -eq 9
test "$(wc -l < docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/canonical-dispositions.jsonl)" -eq 9
```

Expected: all checks exit `0`.

- [ ] **Step 2: Verify source immutability and scope**

Run:

```bash
test -z "$(git -C /home/evluk/projects/chatwoot-client-portal-v2-audit-source-2026-07-13 status --short)"
test -z "$(git -C /home/evluk/projects/chatwoot-client-portal-v2-sec-deep-001-current status --short)"
git status --short
git diff --name-only main...HEAD
```

Expected: both sources are clean; changed paths are only the approved audit
artifacts and any separately registered finding Markdown files.

- [ ] **Step 3: Run documentation formatting and consistency checks**

Run:

```bash
mapfile -t FORMAT_FILES < <(
  git diff --name-only main...HEAD | rg '\.(md|mjs)$'
)
test "${#FORMAT_FILES[@]}" -gt 0
pnpm exec prettier --check "${FORMAT_FILES[@]}"
git diff --check
rg -n 'SEC-DEEP-001|closed_by_targeted_disposition|needs_follow_up' \
  docs/superpowers/audits/2026-07-13-full-application-risk-audit/stages/02-security.md \
  docs/superpowers/audits/2026-07-13-full-application-risk-audit/candidate-ledger.md \
  docs/superpowers/audits/2026-07-13-full-application-risk-audit/coverage-matrix.md \
  docs/superpowers/audits/2026-07-13-full-application-risk-audit/final-report.md \
  docs/superpowers/audits/2026-07-13-full-application-risk-audit/follow-ups/sec-deep-001-two-auditor/final-report.md
```

Then validate repository-relative Markdown file links changed by this branch:

```bash
node --input-type=module <<'NODE'
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const files = execFileSync('git', ['diff', '--name-only', 'main...HEAD'], {
  encoding: 'utf8',
})
  .trim()
  .split(/\n/)
  .filter((path) => path.endsWith('.md'));
const failures = [];

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const rawTarget = match[1].replace(/^<|>$/g, '');
    if (/^(?:https?:|mailto:|#|\/)/.test(rawTarget)) continue;
    const fileTarget = rawTarget.split('#', 1)[0];
    if (!existsSync(resolve(dirname(file), fileTarget))) {
      failures.push(`${file} -> ${rawTarget}`);
    }
  }
}

if (failures.length > 0) {
  throw new Error(`missing relative links:\n${failures.join('\n')}`);
}
NODE
```

Expected: Prettier, diff check and relative-link validation pass; all five
status surfaces explicitly reference the follow-up outcome.

- [ ] **Step 4: Review for secrets and unsupported claims**

Inspect the exact staged diff. Confirm it contains no credentials, cookies,
tokens, production payloads, customer data, generated scan bulk, statement of
a completed canonical Deep scan, or unconditional `GO` claim.

Any claim of `fixed_on_current_baseline` must have both `git_delta` and targeted
`test` evidence. Any Critical/High claim must cite both independent auditor
reports.

- [ ] **Step 5: Commit the conclusion**

Stage only the approved audit/finding paths, run `git diff --cached --check`,
inspect `git diff --cached --stat`, then commit:

```bash
git commit -m "docs(audit): conclude two-auditor security disposition"
```

- [ ] **Step 6: Hand off without starting remediation**

Report to the user in plain language:

- whether the original nine-family input was successfully recovered;
- the two-auditor canonical counts;
- whether `SEC-DEEP-001` closed or remains open;
- any confirmed finding IDs and their severity;
- all remaining verdict blockers;
- the branch and final commit;
- that no product fix, production mutation, deploy or push occurred.

Do not merge, push, remediate or begin another audit without the user's next
explicit instruction.
