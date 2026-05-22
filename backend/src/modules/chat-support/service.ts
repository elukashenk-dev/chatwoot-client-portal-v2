import type { ChatwootClient } from '../../integrations/chatwoot/client.js'
import {
  ChatwootClientConfigurationError,
  ChatwootClientRequestError,
} from '../../integrations/chatwoot/client.js'
import {
  buildPublicChatSupportAvailability,
  normalizeChatwootWorkingHoursRow,
} from './availability.js'
import type {
  PublicChatSupportAvailability,
  PublicChatWorkingHoursRow,
} from './types.js'

type ChatSupportChatwootClient = Pick<
  ChatwootClient,
  'getPortalInboxDetails' | 'listPortalInboxMembers'
>

type CreateChatSupportAvailabilityServiceOptions = {
  chatwootClient: ChatSupportChatwootClient
  now?: () => Date
}

const unavailableWorkingHours: PublicChatSupportAvailability['workingHours'] = {
  enabled: false,
  isWithinWorkingHours: null,
  rows: [],
  timezone: 'UTC',
}

function normalizeWorkingHours(rows: unknown[]) {
  return rows
    .map((row) =>
      typeof row === 'object' && row !== null && !Array.isArray(row)
        ? normalizeChatwootWorkingHoursRow(row as Record<string, unknown>)
        : null,
    )
    .filter((row): row is PublicChatWorkingHoursRow => row !== null)
}

function buildUnavailableSupportAvailability({
  reason,
  result,
}: Pick<
  PublicChatSupportAvailability,
  'reason' | 'result'
>): PublicChatSupportAvailability {
  return {
    currentStatus: 'unknown',
    outOfOfficeMessage: null,
    reason,
    result,
    workingHours: unavailableWorkingHours,
  }
}

export function createChatSupportAvailabilityService({
  chatwootClient,
  now = () => new Date(),
}: CreateChatSupportAvailabilityServiceOptions) {
  return {
    async getSupportAvailability(): Promise<PublicChatSupportAvailability> {
      try {
        const [inbox, members] = await Promise.all([
          chatwootClient.getPortalInboxDetails(),
          chatwootClient.listPortalInboxMembers(),
        ])

        return buildPublicChatSupportAvailability({
          inbox: {
            outOfOfficeMessage: inbox.outOfOfficeMessage,
            timezone: inbox.timezone,
            workingHours: normalizeWorkingHours(inbox.workingHours),
            workingHoursEnabled: inbox.workingHoursEnabled,
          },
          members,
          now: now(),
        })
      } catch (error) {
        if (error instanceof ChatwootClientConfigurationError) {
          return buildUnavailableSupportAvailability({
            reason: 'chatwoot_not_configured',
            result: 'not_ready',
          })
        }

        if (error instanceof ChatwootClientRequestError) {
          return buildUnavailableSupportAvailability({
            reason: 'chatwoot_unavailable',
            result: 'unavailable',
          })
        }

        throw error
      }
    },
  }
}

export type ChatSupportAvailabilityService = ReturnType<
  typeof createChatSupportAvailabilityService
>
