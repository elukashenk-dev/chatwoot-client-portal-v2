import { setTimeout as sleep } from 'node:timers/promises'

type MailpitAddress = {
  Address?: string
}

type MailpitMessageSummary = {
  Created?: string
  ID?: string
  Subject?: string
  To?: MailpitAddress[]
}

type MailpitMessagesResponse = {
  messages?: MailpitMessageSummary[]
}

type MailpitMessageResponse = {
  Text?: string
}

const MAILPIT_BASE_URL = process.env.MAILPIT_BASE_URL ?? 'http://127.0.0.1:8025'

async function fetchMailpitJson<T>(path: string): Promise<T> {
  const response = await fetch(new URL(path, MAILPIT_BASE_URL))

  if (!response.ok) {
    throw new Error(`Mailpit request failed with status ${response.status}.`)
  }

  return (await response.json()) as T
}

function isMessageForRecipient(message: MailpitMessageSummary, email: string) {
  const normalizedEmail = email.toLowerCase()

  return message.To?.some(
    (recipient) => recipient.Address?.toLowerCase() === normalizedEmail,
  )
}

function isMessageAfter(message: MailpitMessageSummary, sentAfter: Date) {
  if (!message.Created) {
    return false
  }

  return new Date(message.Created).getTime() >= sentAfter.getTime() - 1000
}

async function findMailpitMessage({
  sentAfter,
  subject,
  to,
}: {
  sentAfter: Date
  subject: string
  to: string
}) {
  const payload = await fetchMailpitJson<MailpitMessagesResponse>(
    '/api/v1/messages?limit=100',
  )

  return payload.messages?.find(
    (message) =>
      message.ID &&
      message.Subject === subject &&
      isMessageForRecipient(message, to) &&
      isMessageAfter(message, sentAfter),
  )
}

export async function waitForMailpitCode({
  sentAfter,
  subject,
  timeoutMs = 10_000,
  to,
}: {
  sentAfter: Date
  subject: string
  timeoutMs?: number
  to: string
}) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const message = await findMailpitMessage({
      sentAfter,
      subject,
      to,
    })

    if (message?.ID) {
      const messageDetails = await fetchMailpitJson<MailpitMessageResponse>(
        `/api/v1/message/${message.ID}`,
      )
      const verificationCode = messageDetails.Text?.match(/\b\d{6}\b/)?.[0]

      if (verificationCode) {
        return verificationCode
      }
    }

    await sleep(500)
  }

  throw new Error(`Timed out waiting for Mailpit code for ${to}.`)
}
