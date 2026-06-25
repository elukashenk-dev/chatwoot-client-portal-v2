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

async function checkProductionSecurityHeaders(failures) {
  const caddyfilePath = 'infra/production/Caddyfile'
  const caddyfile = await readFile(path.join(repoRoot, caddyfilePath), 'utf8')
  const requiredHeaders = [
    'Content-Security-Policy',
    'Permissions-Policy',
    'Strict-Transport-Security',
  ]

  for (const headerName of requiredHeaders) {
    if (!caddyfile.includes(headerName)) {
      failures.push({
        relativePath: caddyfilePath,
        message: `missing production security header: ${headerName}`,
      })
    }
  }
}

async function checkRetiredWebhookScripts(failures) {
  const relativePaths = await listFiles('backend/src/scripts')
  const retiredFiles = relativePaths.filter((relativePath) =>
    relativePath.includes('configure-chatwoot-account-webhook'),
  )

  for (const relativePath of retiredFiles) {
    failures.push({
      relativePath,
      message: 'retired account webhook script must not be reintroduced',
    })
  }
}

async function checkProductionObjectStorageConfig(failures) {
  const composePath = 'infra/production/compose.yaml'
  const envExamplePath = '.env.production.example'
  const compose = await readFile(path.join(repoRoot, composePath), 'utf8')
  const envExample = await readFile(path.join(repoRoot, envExamplePath), 'utf8')
  const requiredComposeSnippets = [
    'portal-object-storage:',
    'portal-object-storage-init:',
    'portal-object-storage-data:',
    '../../scripts/init-production-object-storage.sh:/usr/local/bin/init-production-object-storage.sh:ro',
    'BRANDING_ASSET_STORAGE_ACCESS_KEY_ID:',
    'BRANDING_ASSET_STORAGE_BUCKET:',
    'BRANDING_ASSET_STORAGE_ENDPOINT:',
    'BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY:',
    'condition: service_completed_successfully',
    'portal-internal',
  ]
  const requiredEnvNames = [
    'PORTAL_OBJECT_STORAGE_IMAGE',
    'PORTAL_OBJECT_STORAGE_MC_IMAGE',
    'PORTAL_OBJECT_STORAGE_ROOT_USER',
    'PORTAL_OBJECT_STORAGE_ROOT_PASSWORD',
    'BRANDING_ASSET_STORAGE_ENDPOINT',
    'BRANDING_ASSET_STORAGE_REGION',
    'BRANDING_ASSET_STORAGE_BUCKET',
    'BRANDING_ASSET_STORAGE_ACCESS_KEY_ID',
    'BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY',
    'BRANDING_ASSET_STORAGE_FORCE_PATH_STYLE',
  ]

  for (const snippet of requiredComposeSnippets) {
    if (!compose.includes(snippet)) {
      failures.push({
        relativePath: composePath,
        message: `missing production object-storage wiring: ${snippet}`,
      })
    }
  }

  for (const envName of requiredEnvNames) {
    if (!envExample.includes(`${envName}=`)) {
      failures.push({
        relativePath: envExamplePath,
        message: `missing production object-storage env example: ${envName}`,
      })
    }
  }

  const initScriptPath = 'scripts/init-production-object-storage.sh'
  const initScript = await readFile(path.join(repoRoot, initScriptPath), 'utf8')
  const requiredInitSnippets = [
    'mc mb --ignore-existing',
    'mc admin policy create',
    'mc admin user add',
    'mc admin policy attach',
    's3:GetObject',
    's3:PutObject',
    's3:DeleteObject',
    'mc admin policy remove',
    'mc admin user remove',
  ]

  for (const snippet of requiredInitSnippets) {
    if (!initScript.includes(snippet)) {
      failures.push({
        relativePath: initScriptPath,
        message: `missing production object-storage init behavior: ${snippet}`,
      })
    }
  }

  const minioServiceBlock = compose.split('portal-object-storage:')[1] ?? ''
  const minioBlockBeforeInit =
    minioServiceBlock.split('portal-object-storage-init:')[0] ?? ''

  if (!minioBlockBeforeInit.includes('networks:')) {
    failures.push({
      relativePath: composePath,
      message: 'production object storage must declare explicit networks',
    })
  }

  if (!minioBlockBeforeInit.includes('- portal-internal')) {
    failures.push({
      relativePath: composePath,
      message: 'production object storage must be on portal-internal only',
    })
  }

  if (minioBlockBeforeInit.includes('ports:')) {
    failures.push({
      relativePath: composePath,
      message: 'production object storage must not publish host ports',
    })
  }

  const backendBlock = compose.split('portal-backend:')[1] ?? ''
  const backendBlockBeforeWeb = backendBlock.split('portal-web:')[0] ?? ''

  if (backendBlockBeforeWeb.includes('PORTAL_OBJECT_STORAGE_ROOT_PASSWORD')) {
    failures.push({
      relativePath: composePath,
      message: 'backend must not receive object-storage root password',
    })
  }

  if (!backendBlockBeforeWeb.includes('portal-object-storage-init:')) {
    failures.push({
      relativePath: composePath,
      message: 'backend must depend on object-storage init service',
    })
  }

  if (
    !backendBlockBeforeWeb.includes(
      'DEFAULT_TENANT_CHATWOOT_ADMIN_VERIFICATION_TOKEN:',
    )
  ) {
    failures.push({
      relativePath: composePath,
      message:
        'production backend must receive tenant admin verification token for bootstrap',
    })
  }

  const installScriptPath = 'scripts/install-production.sh'
  const installScript = await readFile(
    path.join(repoRoot, installScriptPath),
    'utf8',
  )

  if (
    !installScript.includes(
      'Default tenant Chatwoot admin verification token',
    )
  ) {
    failures.push({
      relativePath: installScriptPath,
      message:
        'production installer must prompt for the default tenant admin verification token',
    })
  }

  if (
    installScript.includes(
      'DEFAULT_TENANT_CHATWOOT_ADMIN_VERIFICATION_TOKEN',
    ) &&
    installScript.includes(
      'Optional separate Chatwoot admin verification token',
    )
  ) {
    failures.push({
      relativePath: installScriptPath,
      message:
        'production installer must require the default tenant admin verification token',
    })
  }
}

async function checkProductionTelegramBridgeConfig(failures) {
  const composePath = 'infra/production/compose.yaml'
  const caddyfilePath = 'infra/production/Caddyfile'
  const envExamplePath = '.env.production.example'
  const compose = await readFile(path.join(repoRoot, composePath), 'utf8')
  const caddyfile = await readFile(path.join(repoRoot, caddyfilePath), 'utf8')
  const envExample = await readFile(path.join(repoRoot, envExamplePath), 'utf8')
  const requiredComposeSnippets = [
    'telegram-bridge:',
    'command: ["node", "backend/dist/telegram-bridge/server.js"]',
    'TELEGRAM_BRIDGE_PORT:',
    'TELEGRAM_BRIDGE_MAX_BODY_BYTES:',
    'TELEGRAM_BRIDGE_PROCESSING_STALE_MS:',
    'TELEGRAM_BRIDGE_PHONE_PROMPT_TEXT:',
    'TELEGRAM_BRIDGE_REQUEST_TIMEOUT_MS: ${TELEGRAM_BRIDGE_REQUEST_TIMEOUT_MS:-10000}',
    "expose:\n      - '${TELEGRAM_BRIDGE_PORT:-3401}'",
    "http://127.0.0.1:${TELEGRAM_BRIDGE_PORT:-3401}/telegram-bridge/health",
  ]
  const forbiddenComposeSnippets = [
    'TELEGRAM_BRIDGE_PUBLIC_BASE_URL',
    'TELEGRAM_BRIDGE_TELEGRAM_BOT_TOKEN',
    'TELEGRAM_BRIDGE_CHATWOOT_ACCOUNT_ID',
    'TELEGRAM_BRIDGE_CHATWOOT_API_ACCESS_TOKEN',
    'TELEGRAM_BRIDGE_CHATWOOT_TELEGRAM_INBOX_ID',
  ]
  const requiredEnvNames = [
    'TELEGRAM_BRIDGE_PORT',
    'TELEGRAM_BRIDGE_REQUEST_TIMEOUT_MS',
    'TELEGRAM_BRIDGE_MAX_BODY_BYTES',
    'TELEGRAM_BRIDGE_PROCESSING_STALE_MS',
    'TELEGRAM_BRIDGE_PHONE_PROMPT_TEXT',
    'TELEGRAM_BRIDGE_PHONE_NOT_FOUND_TEXT',
    'TELEGRAM_BRIDGE_PHONE_LINKED_TEXT',
  ]

  for (const snippet of requiredComposeSnippets) {
    if (!compose.includes(snippet)) {
      failures.push({
        relativePath: composePath,
        message: `missing production Telegram bridge wiring: ${snippet}`,
      })
    }
  }

  for (const snippet of forbiddenComposeSnippets) {
    if (compose.includes(snippet)) {
      failures.push({
        relativePath: composePath,
        message: `tenant-specific Telegram bridge secret must not be in Compose env: ${snippet}`,
      })
    }
  }

  for (const envName of requiredEnvNames) {
    if (!envExample.includes(`${envName}=`)) {
      failures.push({
        relativePath: envExamplePath,
        message: `missing production Telegram bridge env example: ${envName}`,
      })
    }
  }

  if (!caddyfile.includes('handle /telegram-bridge/*')) {
    failures.push({
      relativePath: caddyfilePath,
      message: 'production Caddyfile must route /telegram-bridge/*',
    })
  }

  if (!compose.includes('TELEGRAM_BRIDGE_PORT: ${TELEGRAM_BRIDGE_PORT:-3401}')) {
    failures.push({
      relativePath: composePath,
      message: 'production Caddy container must receive TELEGRAM_BRIDGE_PORT',
    })
  }

  if (!caddyfile.includes('reverse_proxy telegram-bridge:{$TELEGRAM_BRIDGE_PORT:3401}')) {
    failures.push({
      relativePath: caddyfilePath,
      message: 'production Caddyfile must proxy Telegram bridge to port 3401',
    })
  }
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

  await checkProductionSecurityHeaders(failures)
  await checkRetiredWebhookScripts(failures)
  await checkProductionObjectStorageConfig(failures)
  await checkProductionTelegramBridgeConfig(failures)

  if (failures.length > 0) {
    console.error('Code health check failed.\n')
    console.error(
      failures
        .map((failure) => {
          if ('message' in failure) {
            return `- ${failure.relativePath}: ${failure.message}`
          }

          return formatFailureMessage(failure)
        })
        .join('\n\n'),
    )
    process.exitCode = 1
    return
  }

  console.log(
    `Code health OK: checked ${relativePaths.length} files (production <= ${codeHealthConfig.limits.production}, tests <= ${codeHealthConfig.limits.test}, allowlist baselines enforced).`,
  )
}

await main()
