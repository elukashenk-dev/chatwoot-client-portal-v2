import { describe, expect, it } from 'vitest'

import {
  buildPublicChatSupportAvailability,
  normalizeChatwootInboxMemberAvailability,
  normalizeChatwootWorkingHoursRow,
} from './availability.js'

describe('chat support availability normalization', () => {
  it('normalizes valid Chatwoot working-hour rows', () => {
    expect(
      normalizeChatwootWorkingHoursRow({
        close_hour: 17,
        close_minutes: 30,
        closed_all_day: false,
        day_of_week: 1,
        open_all_day: false,
        open_hour: 9,
        open_minutes: 15,
      }),
    ).toEqual({
      closeTime: '17:30',
      dayOfWeek: 1,
      isClosedAllDay: false,
      isOpenAllDay: false,
      openTime: '09:15',
    })
  })

  it('normalizes closed-all-day and open-all-day rows', () => {
    expect(
      normalizeChatwootWorkingHoursRow({
        closed_all_day: true,
        day_of_week: 0,
        open_all_day: false,
      }),
    ).toEqual({
      closeTime: null,
      dayOfWeek: 0,
      isClosedAllDay: true,
      isOpenAllDay: false,
      openTime: null,
    })

    expect(
      normalizeChatwootWorkingHoursRow({
        close_hour: 23,
        close_minutes: 59,
        closed_all_day: false,
        day_of_week: 2,
        open_all_day: true,
        open_hour: 0,
        open_minutes: 0,
      }),
    ).toEqual({
      closeTime: '23:59',
      dayOfWeek: 2,
      isClosedAllDay: false,
      isOpenAllDay: true,
      openTime: '00:00',
    })
  })

  it('drops invalid working-hour rows fail-closed', () => {
    expect(
      normalizeChatwootWorkingHoursRow({
        close_hour: 18,
        close_minutes: 0,
        closed_all_day: false,
        day_of_week: 9,
        open_all_day: false,
        open_hour: 9,
        open_minutes: 0,
      }),
    ).toBeNull()

    expect(
      normalizeChatwootWorkingHoursRow({
        close_hour: 9,
        close_minutes: 0,
        closed_all_day: false,
        day_of_week: 1,
        open_all_day: false,
        open_hour: 18,
        open_minutes: 0,
      }),
    ).toBeNull()
  })

  it('accepts online and available agent statuses as online-compatible', () => {
    expect(
      normalizeChatwootInboxMemberAvailability([
        { availabilityStatus: 'online', id: 1, name: 'Анна' },
        { availabilityStatus: 'available', id: 2, name: 'Ольга' },
        { availabilityStatus: 'busy', id: 3, name: 'Петр' },
        { availabilityStatus: 'offline', id: 4, name: 'Иван' },
        { availabilityStatus: 'strange', id: 5, name: 'Мария' },
      ]),
    ).toEqual({
      busyAgentCount: 1,
      onlineAgentCount: 2,
      totalAgentCount: 5,
    })
  })

  it('returns outside_hours before online when business hours are closed', () => {
    expect(
      buildPublicChatSupportAvailability({
        inbox: {
          outOfOfficeMessage: 'Ответим в рабочее время.',
          timezone: 'Europe/Samara',
          workingHours: [
            {
              closeTime: null,
              dayOfWeek: 5,
              isClosedAllDay: true,
              isOpenAllDay: false,
              openTime: null,
            },
          ],
          workingHoursEnabled: true,
        },
        members: [{ availabilityStatus: 'online', id: 1, name: 'Анна' }],
        now: new Date('2026-05-22T08:00:00.000Z'),
      }),
    ).toMatchObject({
      currentStatus: 'outside_hours',
      outOfOfficeMessage: 'Ответим в рабочее время.',
      result: 'ready',
      workingHours: {
        enabled: true,
        isWithinWorkingHours: false,
        timezone: 'Europe/Samara',
      },
    })
  })

  it('returns online during open business hours', () => {
    expect(
      buildPublicChatSupportAvailability({
        inbox: {
          outOfOfficeMessage: null,
          timezone: 'Europe/Samara',
          workingHours: [
            {
              closeTime: '18:00',
              dayOfWeek: 5,
              isClosedAllDay: false,
              isOpenAllDay: false,
              openTime: '09:00',
            },
          ],
          workingHoursEnabled: true,
        },
        members: [{ availabilityStatus: 'available', id: 1, name: 'Анна' }],
        now: new Date('2026-05-22T08:00:00.000Z'),
      }),
    ).toMatchObject({
      currentStatus: 'online',
      workingHours: {
        isWithinWorkingHours: true,
      },
    })
  })

  it('returns offline when no available agents exist', () => {
    expect(
      buildPublicChatSupportAvailability({
        inbox: {
          outOfOfficeMessage: null,
          timezone: 'UTC',
          workingHours: [],
          workingHoursEnabled: false,
        },
        members: [
          { availabilityStatus: 'busy', id: 1, name: 'Анна' },
          { availabilityStatus: 'offline', id: 2, name: 'Ольга' },
        ],
        now: new Date('2026-05-22T08:00:00.000Z'),
      }),
    ).toMatchObject({
      currentStatus: 'offline',
      workingHours: {
        enabled: false,
        isWithinWorkingHours: null,
      },
    })
  })
})
