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
