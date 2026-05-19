import type { FastifyReply, FastifyRequest } from 'fastify'

const ATTACHMENT_PROXY_RESPONSE_HEADERS = [
  'accept-ranges',
  'content-disposition',
  'content-length',
  'content-range',
  'content-type',
  'etag',
  'last-modified',
] as const

export const ATTACHMENT_PROXY_CACHE_CONTROL = 'private, no-store'

export function copyAttachmentProxyHeaders({
  headers,
  reply,
}: {
  headers: Headers
  reply: FastifyReply
}) {
  const hasContentEncoding = headers.get('content-encoding') !== null

  for (const headerName of ATTACHMENT_PROXY_RESPONSE_HEADERS) {
    if (
      hasContentEncoding &&
      (headerName === 'content-length' || headerName === 'content-range')
    ) {
      continue
    }

    const headerValue = headers.get(headerName)

    if (headerValue !== null) {
      reply.header(headerName, headerValue)
    }
  }
}

export function getRangeHeader(request: FastifyRequest) {
  const rangeHeader = request.headers.range

  return typeof rangeHeader === 'string' ? rangeHeader : null
}
