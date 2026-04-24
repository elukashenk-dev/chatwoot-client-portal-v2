import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SERVICE_WORKER_REVISION_PLACEHOLDER = '__PORTAL_SERVICE_WORKER_REVISION__'

const serviceWorkerPath = fileURLToPath(
  new URL('../dist/sw.js', import.meta.url),
)
const revision =
  process.env.PORTAL_BUILD_REVISION ||
  process.env.SOURCE_VERSION ||
  new Date().toISOString().replace(/[^0-9]/g, '')

const serviceWorkerSource = readFileSync(serviceWorkerPath, 'utf8')

if (!serviceWorkerSource.includes(SERVICE_WORKER_REVISION_PLACEHOLDER)) {
  throw new Error(
    `Could not find ${SERVICE_WORKER_REVISION_PLACEHOLDER} in ${serviceWorkerPath}.`,
  )
}

writeFileSync(
  serviceWorkerPath,
  serviceWorkerSource.replaceAll(SERVICE_WORKER_REVISION_PLACEHOLDER, revision),
)
