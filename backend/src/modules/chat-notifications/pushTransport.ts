import webPush from 'web-push'

import type { PushTransportSubscription } from './types.js'
import type { VapidConfig } from './vapid.js'

const CHAT_PUSH_TTL_SECONDS = 86_400

export type PushTransportResult =
  | {
      status: 'sent'
    }
  | {
      errorCode: string
      status: 'expired' | 'failed'
    }

export type PushTransport = {
  sendNotification: (
    subscription: PushTransportSubscription,
    payload: string,
  ) => Promise<PushTransportResult>
}

function readStatusCode(error: unknown) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof error.statusCode === 'number'
  ) {
    return error.statusCode
  }

  return null
}

function readErrorCode(error: unknown) {
  const statusCode = readStatusCode(error)

  if (statusCode !== null) {
    return `web_push_${statusCode}`
  }

  if (error instanceof Error && error.message) {
    return error.message.slice(0, 120)
  }

  return 'web_push_failed'
}

export function createWebPushTransport(
  vapidConfig: VapidConfig,
): PushTransport {
  webPush.setVapidDetails(
    vapidConfig.subject,
    vapidConfig.publicKey,
    vapidConfig.privateKey,
  )

  return {
    async sendNotification(subscription, payload) {
      try {
        await webPush.sendNotification(subscription, payload, {
          TTL: CHAT_PUSH_TTL_SECONDS,
          urgency: 'high',
        })

        return {
          status: 'sent',
        }
      } catch (error) {
        const statusCode = readStatusCode(error)

        return {
          errorCode: readErrorCode(error),
          status:
            statusCode === 404 || statusCode === 410 ? 'expired' : 'failed',
        }
      }
    },
  }
}
