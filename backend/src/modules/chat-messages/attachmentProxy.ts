import { isIP } from 'node:net'

import { ChatwootClientConfigurationError } from '../../integrations/chatwoot/client.js'
import { normalizeChatwootRequestTimeoutMs } from '../../integrations/chatwoot/request.js'
import { ApiError } from '../../lib/errors.js'

const ATTACHMENT_FETCH_MAX_REDIRECTS = 3
const ATTACHMENT_FETCH_UNAVAILABLE_STATUS = 502

type CreateAttachmentProxyFetcherOptions = {
  allowedOrigins: readonly string[]
  allowPrivateNetwork: boolean
  fetchFn: typeof fetch
  requestTimeoutMs?: number | undefined
}

export function createAttachmentProxyUnavailableError() {
  return new ApiError(
    ATTACHMENT_FETCH_UNAVAILABLE_STATUS,
    'attachment_unavailable',
    'Файл недоступен.',
  )
}

function normalizeHostname(hostname: string) {
  return hostname
    .toLowerCase()
    .replace(/^\[(.*)\]$/, '$1')
    .replace(/\.$/, '')
}

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split('.').map((part) => Number(part))

  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false
  }

  const [first = 0, second = 0] = parts

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  )
}

function isPrivateIpv6(hostname: string) {
  return (
    hostname === '::' ||
    hostname === '::1' ||
    hostname.startsWith('::ffff:') ||
    hostname.startsWith('fc') ||
    hostname.startsWith('fd') ||
    hostname.startsWith('fe8') ||
    hostname.startsWith('fe9') ||
    hostname.startsWith('fea') ||
    hostname.startsWith('feb')
  )
}

function isPrivateAttachmentHost(hostname: string) {
  const normalizedHostname = normalizeHostname(hostname)

  if (
    normalizedHostname === 'localhost' ||
    normalizedHostname.endsWith('.localhost')
  ) {
    return true
  }

  const ipVersion = isIP(normalizedHostname)

  if (ipVersion === 4) {
    return isPrivateIpv4(normalizedHostname)
  }

  if (ipVersion === 6) {
    return isPrivateIpv6(normalizedHostname)
  }

  return false
}

function isLoopbackAttachmentHost(hostname: string) {
  const normalizedHostname = normalizeHostname(hostname)

  return (
    normalizedHostname === 'localhost' || normalizedHostname === '127.0.0.1'
  )
}

function buildOriginUrl({
  baseUrl,
  hostname,
}: {
  baseUrl: URL
  hostname: string
}) {
  const originUrl = new URL(baseUrl.origin)
  originUrl.hostname = hostname

  return originUrl.origin
}

function normalizeAttachmentAllowedOrigins({
  allowPrivateNetwork,
  origins,
}: {
  allowPrivateNetwork: boolean
  origins: readonly string[]
}) {
  const allowedOrigins = new Set<string>()

  for (const origin of origins) {
    let originUrl: URL

    try {
      originUrl = new URL(origin)
    } catch {
      throw new ChatwootClientConfigurationError(
        'Attachment proxy allowed origins must be valid URLs.',
      )
    }

    allowedOrigins.add(originUrl.origin)

    if (allowPrivateNetwork && isLoopbackAttachmentHost(originUrl.hostname)) {
      allowedOrigins.add(
        buildOriginUrl({
          baseUrl: originUrl,
          hostname: 'localhost',
        }),
      )
      allowedOrigins.add(
        buildOriginUrl({
          baseUrl: originUrl,
          hostname: '127.0.0.1',
        }),
      )
    }
  }

  return allowedOrigins
}

function assertAllowedAttachmentUrl({
  allowedOrigins,
  allowPrivateNetwork,
  value,
}: {
  allowedOrigins: ReadonlySet<string>
  allowPrivateNetwork: boolean
  value: string
}) {
  let attachmentUrl: URL

  try {
    attachmentUrl = new URL(value)
  } catch {
    throw createAttachmentProxyUnavailableError()
  }

  if (
    attachmentUrl.protocol !== 'http:' &&
    attachmentUrl.protocol !== 'https:'
  ) {
    throw createAttachmentProxyUnavailableError()
  }

  if (!allowPrivateNetwork && isPrivateAttachmentHost(attachmentUrl.hostname)) {
    throw createAttachmentProxyUnavailableError()
  }

  if (!allowedOrigins.has(attachmentUrl.origin)) {
    throw createAttachmentProxyUnavailableError()
  }

  return attachmentUrl
}

function isRedirectStatus(status: number) {
  return status >= 300 && status < 400
}

async function cancelResponseBody(response: Response) {
  try {
    await response.body?.cancel()
  } catch {
    // Best effort cleanup for redirect/error responses before the proxy moves on.
  }
}

function wrapAttachmentBodyWithTimeout({
  body,
  clearTimeout,
}: {
  body: ReadableStream<Uint8Array>
  clearTimeout: () => void
}) {
  const reader = body.getReader()

  return new ReadableStream<Uint8Array>({
    async cancel(reason) {
      clearTimeout()
      await reader.cancel(reason)
    },
    async pull(controller) {
      try {
        const chunk = await reader.read()

        if (chunk.done) {
          clearTimeout()
          controller.close()
          return
        }

        controller.enqueue(chunk.value)
      } catch (error) {
        clearTimeout()
        controller.error(error)
      }
    },
  })
}

export function createAttachmentProxyFetcher({
  allowedOrigins,
  allowPrivateNetwork,
  fetchFn,
  requestTimeoutMs,
}: CreateAttachmentProxyFetcherOptions) {
  const normalizedRequestTimeoutMs =
    normalizeChatwootRequestTimeoutMs(requestTimeoutMs)
  const normalizedAllowedOrigins = normalizeAttachmentAllowedOrigins({
    allowPrivateNetwork,
    origins: allowedOrigins,
  })

  async function fetchAttachmentWithTimeout({
    headers,
    url,
  }: {
    headers: Headers
    url: URL
  }) {
    const abortController = new AbortController()
    let didClearTimeout = false
    const timeout = setTimeout(
      () =>
        abortController.abort(
          new Error('Chatwoot attachment fetch timed out.'),
        ),
      normalizedRequestTimeoutMs,
    )
    const clearAttachmentTimeout = () => {
      if (!didClearTimeout) {
        didClearTimeout = true
        clearTimeout(timeout)
      }
    }

    try {
      const response = await fetchFn(url.href, {
        headers,
        redirect: 'manual',
        signal: abortController.signal,
      })

      if (!response.ok || !response.body) {
        clearAttachmentTimeout()
        return response
      }

      return new Response(
        wrapAttachmentBodyWithTimeout({
          body: response.body,
          clearTimeout: clearAttachmentTimeout,
        }),
        response,
      )
    } catch {
      clearAttachmentTimeout()
      throw createAttachmentProxyUnavailableError()
    }
  }

  return async function fetchAllowedAttachment({
    headers,
    initialUrl,
  }: {
    headers: Headers
    initialUrl: string
  }) {
    let currentUrl = assertAllowedAttachmentUrl({
      allowedOrigins: normalizedAllowedOrigins,
      allowPrivateNetwork,
      value: initialUrl,
    })

    for (
      let redirectCount = 0;
      redirectCount <= ATTACHMENT_FETCH_MAX_REDIRECTS;
      redirectCount += 1
    ) {
      const response = await fetchAttachmentWithTimeout({
        headers,
        url: currentUrl,
      })

      if (!isRedirectStatus(response.status)) {
        return response
      }

      const location = response.headers.get('location')
      await cancelResponseBody(response)

      if (!location) {
        throw createAttachmentProxyUnavailableError()
      }

      currentUrl = assertAllowedAttachmentUrl({
        allowedOrigins: normalizedAllowedOrigins,
        allowPrivateNetwork,
        value: new URL(location, currentUrl).href,
      })
    }

    throw createAttachmentProxyUnavailableError()
  }
}
