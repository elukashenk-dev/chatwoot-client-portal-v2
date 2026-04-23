import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { codeHealthConfig } from './code-health.config.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const ignoredDirectoryNames = new Set([
  '.git',
  'coverage',
  'dist',
  'node_modules',
])

async function listFiles(relativeDir) {
  const directoryPath = path.join(repoRoot, relativeDir)
  const entries = await readdir(directoryPath, { withFileTypes: true })
  const nestedFilePaths = await Promise.all(
    entries
      .filter((entry) => !ignoredDirectoryNames.has(entry.name))
      .map(async (entry) => {
        const nextRelativePath = path.posix.join(relativeDir, entry.name)

        if (entry.isDirectory()) {
          return listFiles(nextRelativePath)
        }

        return [nextRelativePath]
      }),
  )

  return nestedFilePaths.flat()
}

function isTrackedSourceFile(relativePath) {
  return relativePath.endsWith('.ts') || relativePath.endsWith('.tsx')
}

function isTestFile(relativePath) {
  return (
    relativePath.startsWith('tests/') ||
    relativePath.includes('/__tests__/') ||
    relativePath.endsWith('.test.ts') ||
    relativePath.endsWith('.test.tsx') ||
    relativePath.endsWith('.spec.ts') ||
    relativePath.endsWith('.spec.tsx')
  )
}

function countLines(fileContents) {
  if (fileContents.length === 0) {
    return 0
  }

  const lines = fileContents.split(/\r?\n/u)

  if (fileContents.endsWith('\n')) {
    return lines.length - 1
  }

  return lines.length
}

function describeLimit(relativePath) {
  const allowlistEntry = codeHealthConfig.allowlist[relativePath]

  if (allowlistEntry) {
    return {
      kind: 'allowlist',
      limit: allowlistEntry.maxLines,
      reason: allowlistEntry.reason,
    }
  }

  return {
    kind: isTestFile(relativePath) ? 'test' : 'production',
    limit: isTestFile(relativePath)
      ? codeHealthConfig.limits.test
      : codeHealthConfig.limits.production,
    reason: null,
  }
}

function formatFailureMessage(failure) {
  const overshoot = failure.lineCount - failure.limit

  if (failure.kind === 'allowlist') {
    return [
      `- ${failure.relativePath}: ${failure.lineCount} lines (allowlist baseline ${failure.limit}, +${overshoot})`,
      `  ${failure.reason}`,
    ].join('\n')
  }

  const label = failure.kind === 'test' ? 'test limit' : 'production limit'

  return `- ${failure.relativePath}: ${failure.lineCount} lines (${label} ${failure.limit}, +${overshoot})`
}

async function main() {
  const relativePaths = (
    await Promise.all(codeHealthConfig.roots.map((root) => listFiles(root)))
  )
    .flat()
    .filter(isTrackedSourceFile)
    .sort((left, right) => left.localeCompare(right))

  const failures = []

  for (const relativePath of relativePaths) {
    const fileContents = await readFile(
      path.join(repoRoot, relativePath),
      'utf8',
    )
    const lineCount = countLines(fileContents)
    const { kind, limit, reason } = describeLimit(relativePath)

    if (lineCount > limit) {
      failures.push({
        kind,
        limit,
        lineCount,
        reason,
        relativePath,
      })
    }
  }

  if (failures.length > 0) {
    console.error('Code health check failed.\n')
    console.error(failures.map(formatFailureMessage).join('\n\n'))
    process.exitCode = 1
    return
  }

  console.log(
    `Code health OK: checked ${relativePaths.length} files (production <= ${codeHealthConfig.limits.production}, tests <= ${codeHealthConfig.limits.test}, allowlist baselines enforced).`,
  )
}

await main()
