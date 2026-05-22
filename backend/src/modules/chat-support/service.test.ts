import { describe, expect, it, vi } from 'vitest'

import {
  ChatwootClientConfigurationError,
  ChatwootClientRequestError,
} from '../../integrations/chatwoot/client.js'
import { createChatSupportAvailabilityService } from './service.js'

function createChatwootClientStub() {
  return {
    getPortalInboxDetails: vi.fn().mockResolvedValue({
      outOfOfficeMessage: 'Ответим в рабочее время.',
      timezone: 'Europe/Samara',
      workingHours: [
        {
          closeHour: 18,
          closeMinutes: 0,
          closedAllDay: false,
          dayOfWeek: 5,
          openAllDay: false,
          openHour: 9,
          openMinutes: 0,
        },
      ],
      workingHoursEnabled: true,
    }),
    listPortalInboxMembers: vi
      .fn()
      .mockResolvedValue([
        { availabilityStatus: 'online', id: 1, name: 'Анна Маттина' },
      ]),
  }
}

describe('createChatSupportAvailabilityService', () => {
  it('returns ready support availability from Chatwoot inbox state', async () => {
    const chatwootClient = createChatwootClientStub()
    const service = createChatSupportAvailabilityService({
      chatwootClient,
      now: () => new Date('2026-05-22T08:00:00.000Z'),
    })

    await expect(service.getSupportAvailability()).resolves.toMatchObject({
      currentStatus: 'online',
      reason: 'none',
      result: 'ready',
      workingHours: {
        enabled: true,
        isWithinWorkingHours: true,
        timezone: 'Europe/Samara',
      },
    })
    expect(chatwootClient.getPortalInboxDetails).toHaveBeenCalledTimes(1)
    expect(chatwootClient.listPortalInboxMembers).toHaveBeenCalledTimes(1)
  })

  it('returns controlled not-ready state when Chatwoot is not configured', async () => {
    const chatwootClient = createChatwootClientStub()
    chatwootClient.getPortalInboxDetails.mockRejectedValueOnce(
      new ChatwootClientConfigurationError(),
    )
    const service = createChatSupportAvailabilityService({
      chatwootClient,
      now: () => new Date('2026-05-22T08:00:00.000Z'),
    })

    await expect(service.getSupportAvailability()).resolves.toMatchObject({
      currentStatus: 'unknown',
      reason: 'chatwoot_not_configured',
      result: 'not_ready',
    })
  })

  it('returns controlled unavailable state when Chatwoot request fails', async () => {
    const chatwootClient = createChatwootClientStub()
    chatwootClient.listPortalInboxMembers.mockRejectedValueOnce(
      new ChatwootClientRequestError(
        'Chatwoot inbox members lookup is unavailable.',
      ),
    )
    const service = createChatSupportAvailabilityService({
      chatwootClient,
      now: () => new Date('2026-05-22T08:00:00.000Z'),
    })

    await expect(service.getSupportAvailability()).resolves.toMatchObject({
      currentStatus: 'unknown',
      reason: 'chatwoot_unavailable',
      result: 'unavailable',
    })
  })
})
