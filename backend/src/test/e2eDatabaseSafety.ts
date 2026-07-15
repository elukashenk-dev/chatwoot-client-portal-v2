import { isIP } from 'node:net'

const DATABASE_SAFETY_ERROR =
  'Playwright database setup is allowed only for the isolated local portal database.'
const DATABASE_MUTATION_CONFIRMATION =
  'allow-local-playwright-database-mutations'

function normalizeHostname(rawHostname: string) {
  return rawHostname
    .trim()
    .toLowerCase()
    .replace(/^\[(.*)\]$/u, '$1')
}

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split('.').map(Number)

  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false
  }

  const [first, second] = parts

  return (
    first === 10 ||
    (first === 172 && second !== undefined && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  )
}

function isLoopbackIpv4(hostname: string) {
  const parts = hostname.split('.').map(Number)

  return (
    parts.length === 4 &&
    parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) &&
    parts[0] === 127
  )
}

function isAutomaticallyAllowedLocalHost(hostname: string) {
  if (hostname === 'localhost' || hostname === 'host.docker.internal') {
    return true
  }

  return (
    hostname === '::1' || (isIP(hostname) === 4 && isLoopbackIpv4(hostname))
  )
}

function isPrivateNonLoopbackHost(hostname: string) {
  const ipVersion = isIP(hostname)

  if (ipVersion === 4) {
    return isPrivateIpv4(hostname)
  }

  if (ipVersion === 6) {
    return hostname.startsWith('fc') || hostname.startsWith('fd')
  }

  return false
}

function isAllowedDatabaseHost(
  hostname: string,
  rawAllowedNonLoopbackHost: string | undefined,
) {
  if (isAutomaticallyAllowedLocalHost(hostname)) {
    return true
  }

  const allowedNonLoopbackHost = normalizeHostname(
    rawAllowedNonLoopbackHost ?? '',
  )

  return (
    allowedNonLoopbackHost === hostname && isPrivateNonLoopbackHost(hostname)
  )
}

export function assertE2eDatabaseSetupIsLocal({
  databaseUrl,
  expectedDatabaseName,
  expectedPort,
  mutationConfirmation,
  allowedNonLoopbackHost,
  nodeEnv,
}: {
  databaseUrl: string
  expectedDatabaseName: string
  expectedPort: number
  mutationConfirmation?: string | undefined
  allowedNonLoopbackHost?: string | undefined
  nodeEnv: 'development' | 'production' | 'test'
}) {
  let parsedUrl: URL
  let databaseName: string

  try {
    parsedUrl = new URL(databaseUrl)
    databaseName = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ''))
  } catch {
    throw new Error(DATABASE_SAFETY_ERROR)
  }

  const hostname = normalizeHostname(parsedUrl.hostname)
  const port = Number(parsedUrl.port)

  if (
    nodeEnv === 'production' ||
    mutationConfirmation !== DATABASE_MUTATION_CONFIRMATION ||
    !['postgres:', 'postgresql:'].includes(parsedUrl.protocol) ||
    parsedUrl.search !== '' ||
    parsedUrl.hash !== '' ||
    parsedUrl.port === '' ||
    !isAllowedDatabaseHost(hostname, allowedNonLoopbackHost) ||
    !expectedDatabaseName ||
    databaseName !== expectedDatabaseName ||
    !Number.isInteger(expectedPort) ||
    expectedPort <= 0 ||
    port !== expectedPort
  ) {
    throw new Error(DATABASE_SAFETY_ERROR)
  }
}
