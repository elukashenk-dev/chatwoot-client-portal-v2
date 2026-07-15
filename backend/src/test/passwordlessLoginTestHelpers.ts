import { vi } from 'vitest'

import type { EmailMessage } from '../integrations/email/smtp.js'
import { normalizeEmail } from '../lib/email.js'

export type ChatwootTestContact = {
  customAttributes?: Record<string, unknown>
  email: string
  id: number
  name: string | null
}

export function createJsonResponse(payload: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(payload), {
    headers: {
      'content-type': 'application/json',
    },
    status: init?.status ?? 200,
    ...init,
  })
}

export function createDeferred<T>() {
  let reject!: (reason?: unknown) => void
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return {
    promise,
    reject,
    resolve,
  }
}

export function extractCode(text: string) {
  const match = text.match(/\b\d{6}\b/)

  if (!match) {
    throw new Error('Expected a six-digit login code.')
  }

  return match[0]
}

export function extractLatestCode(
  mock: ReturnType<typeof vi.fn<(message: EmailMessage) => Promise<void>>>,
) {
  const latestMessage = mock.mock.calls[mock.mock.calls.length - 1]?.[0]

  return extractCode(latestMessage?.text ?? '')
}

export function createWrongCode(code: string) {
  return code === '000000' ? '111111' : '000000'
}

export async function waitForMockCall(
  mock: ReturnType<typeof vi.fn>,
  callCount: number,
) {
  let lastCallCount = 0

  for (let attempt = 0; attempt < 100; attempt += 1) {
    lastCallCount = mock.mock.calls.length

    if (lastCallCount >= callCount) {
      return
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 25)
    })
  }

  throw new Error(`Expected ${callCount} mock calls, saw ${lastCallCount}.`)
}

export function createChatwootFetchWithContacts(
  getContacts: () => ChatwootTestContact[],
) {
  return vi.fn<typeof fetch>(async (input) => {
    const requestUrl =
      input instanceof Request ? new URL(input.url) : new URL(String(input))
    const contactIdMatch = requestUrl.pathname.match(/\/contacts\/(\d+)$/)

    if (contactIdMatch) {
      const contactId = Number(contactIdMatch[1])
      const contact = getContacts().find(
        (candidate) => candidate.id === contactId,
      )

      if (!contact) {
        return createJsonResponse({ error: 'not found' }, { status: 404 })
      }

      return createJsonResponse({
        payload: {
          custom_attributes: contact.customAttributes ?? {},
          email: contact.email,
          id: contact.id,
          name: contact.name,
          phone_number: null,
        },
      })
    }

    const query = normalizeEmail(requestUrl.searchParams.get('q') ?? '')
    const matches = getContacts().filter(
      (contact) => normalizeEmail(contact.email) === query,
    )

    return createJsonResponse({
      payload: matches,
    })
  })
}
