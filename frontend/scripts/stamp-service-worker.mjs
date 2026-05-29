import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SERVICE_WORKER_REVISION_PLACEHOLDER = '__PORTAL_SERVICE_WORKER_REVISION__'
const SERVICE_WORKER_ASSETS_PLACEHOLDER =
  '__PORTAL_SERVICE_WORKER_ASSETS_JSON__'

const serviceWorkerPath = fileURLToPath(
  new URL('../dist/sw.js', import.meta.url),
)
const distDir = dirname(serviceWorkerPath)
const manifestPath = join(distDir, 'asset-manifest.json')
const revision =
  process.env.PORTAL_BUILD_REVISION ||
  process.env.SOURCE_VERSION ||
  new Date().toISOString().replace(/[^0-9]/g, '')

const serviceWorkerSource = readFileSync(serviceWorkerPath, 'utf8')

function readBuildAssetUrls() {
  let manifest

  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    throw new Error(`Could not read Vite asset manifest at ${manifestPath}.`, {
      cause: error,
    })
  }

  const assetUrls = Object.values(manifest)
    .flatMap((entry) => [entry.file, ...(entry.css ?? [])])
    .filter(
      (assetPath) => typeof assetPath === 'string' && assetPath.length > 0,
    )
    .map((assetPath) => `/${assetPath}`)
  const uniqueAssetUrls = [...new Set(assetUrls)]

  if (uniqueAssetUrls.length === 0) {
    throw new Error(
      `Vite asset manifest at ${manifestPath} did not contain generated JS/CSS assets.`,
    )
  }

  assertRequiredBuildAssets({ assetUrls: uniqueAssetUrls, manifest })

  return uniqueAssetUrls
}

function assertRequiredBuildAssets({ assetUrls, manifest }) {
  const startupEntry = manifest['index.html']
  const chatEntry = manifest['src/features/chat/pages/ChatPage.tsx']

  if (!isManifestEntry(startupEntry)) {
    throw new Error(
      `Vite asset manifest at ${manifestPath} did not contain the startup entry.`,
    )
  }

  if (!isManifestEntry(chatEntry)) {
    throw new Error(
      `Vite asset manifest at ${manifestPath} did not contain the chat route entry.`,
    )
  }

  for (const [label, assetPath] of [
    ['startup entry', startupEntry.file],
    ['chat route entry', chatEntry.file],
  ]) {
    if (!assetUrls.includes(`/${assetPath}`)) {
      throw new Error(
        `Vite asset manifest at ${manifestPath} did not include the ${label} asset in the service worker asset list.`,
      )
    }
  }

  if (!assetUrls.some((assetUrl) => assetUrl.endsWith('.css'))) {
    throw new Error(
      `Vite asset manifest at ${manifestPath} did not contain generated CSS assets.`,
    )
  }

  if (!assetUrls.some((assetUrl) => assetUrl.endsWith('.js'))) {
    throw new Error(
      `Vite asset manifest at ${manifestPath} did not contain generated JS assets.`,
    )
  }
}

function isManifestEntry(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof value.file === 'string' &&
    value.file.length > 0
  )
}

if (!serviceWorkerSource.includes(SERVICE_WORKER_REVISION_PLACEHOLDER)) {
  throw new Error(
    `Could not find ${SERVICE_WORKER_REVISION_PLACEHOLDER} in ${serviceWorkerPath}.`,
  )
}

if (!serviceWorkerSource.includes(SERVICE_WORKER_ASSETS_PLACEHOLDER)) {
  throw new Error(
    `Could not find ${SERVICE_WORKER_ASSETS_PLACEHOLDER} in ${serviceWorkerPath}.`,
  )
}

const assetUrls = readBuildAssetUrls()
const stampedSource = serviceWorkerSource
  .replaceAll(SERVICE_WORKER_REVISION_PLACEHOLDER, revision)
  .replaceAll(SERVICE_WORKER_ASSETS_PLACEHOLDER, JSON.stringify(assetUrls))

writeFileSync(serviceWorkerPath, stampedSource)
