import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const distDir = fileURLToPath(new URL('../dist/', import.meta.url))
const manifestPath = join(distDir, 'asset-manifest.json')
const chatRouteImport = 'src/features/chat/pages/ChatPage.tsx'
const maxStartupEntryBytes = 300 * 1024
const maxStartupEntryGzipBytes = 90 * 1024
const devBundleMarkers = [
  'jsxDEV',
  'react.development',
  'useEffect must not return anything besides',
  'You are using the in-browser Babel transformer',
]

function readManifest() {
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    throw new Error(`Could not read Vite asset manifest at ${manifestPath}.`, {
      cause: error,
    })
  }
}

function assertManifestEntry(value, label) {
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof value.file !== 'string' ||
    value.file.length === 0
  ) {
    throw new Error(`Vite asset manifest did not contain ${label}.`)
  }
}

function walkFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name)

    return entry.isDirectory() ? walkFiles(entryPath) : [entryPath]
  })
}

function readAsset(assetPath) {
  return readFileSync(join(distDir, assetPath))
}

function assertChatRouteIsLazy(manifest) {
  const startupEntry = manifest['index.html']
  const chatEntry = manifest[chatRouteImport]

  assertManifestEntry(startupEntry, 'the startup entry')
  assertManifestEntry(chatEntry, 'the lazy chat route entry')

  if (chatEntry.isDynamicEntry !== true) {
    throw new Error('ChatPage is not marked as a dynamic Vite entry.')
  }

  if (
    !Array.isArray(startupEntry.dynamicImports) ||
    !startupEntry.dynamicImports.includes(chatRouteImport)
  ) {
    throw new Error('Startup entry does not lazy-load the ChatPage route.')
  }

  if (
    Array.isArray(startupEntry.imports) &&
    startupEntry.imports.includes(chatRouteImport)
  ) {
    throw new Error('Startup entry statically imports the ChatPage route.')
  }

  return startupEntry
}

function assertStartupEntryBudget(startupEntry) {
  const startupEntryBytes = readAsset(startupEntry.file)
  const gzipBytes = gzipSync(startupEntryBytes).byteLength

  if (startupEntryBytes.byteLength > maxStartupEntryBytes) {
    throw new Error(
      `Startup entry is ${startupEntryBytes.byteLength} bytes, above the ${maxStartupEntryBytes} byte budget.`,
    )
  }

  if (gzipBytes > maxStartupEntryGzipBytes) {
    throw new Error(
      `Startup entry gzip size is ${gzipBytes} bytes, above the ${maxStartupEntryGzipBytes} byte budget.`,
    )
  }
}

function assertNoDevelopmentReactMarkers() {
  const jsFiles = walkFiles(distDir).filter((filePath) =>
    filePath.endsWith('.js'),
  )

  for (const filePath of jsFiles) {
    const source = readFileSync(filePath, 'utf8')
    const marker = devBundleMarkers.find((candidate) =>
      source.includes(candidate),
    )

    if (marker) {
      throw new Error(
        `Production build contains development React marker "${marker}" in ${filePath}.`,
      )
    }
  }
}

function assertDistHasAssets() {
  const files = walkFiles(distDir)
  const totalBytes = files.reduce((total, filePath) => {
    return total + statSync(filePath).size
  }, 0)

  if (totalBytes === 0) {
    throw new Error('Production build dist is empty.')
  }
}

const manifest = readManifest()
const startupEntry = assertChatRouteIsLazy(manifest)

assertStartupEntryBudget(startupEntry)
assertNoDevelopmentReactMarkers()
assertDistHasAssets()
