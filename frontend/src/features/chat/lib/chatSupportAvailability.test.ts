import { describe, expect, it } from 'vitest'

import {
  getSupportAvailabilityPresentation,
  groupWorkingHoursRows,
} from './chatSupportAvailability'
import type { ChatSupportAvailabilityResponse } from '../types'

const baseAvailability = {
  currentStatus: 'online',
  outOfOfficeMessage: null,
  reason: 'none',
  result: 'ready',
  workingHours: {
    enabled: true,
    isWithinWorkingHours: true,
    rows: [],
    timezone: 'Europe/Samara',
  },
} satisfies ChatSupportAvailabilityResponse

describe('chat support availability presentation', () => {
  it('maps backend statuses to header labels and tones', () => {
    expect(getSupportAvailabilityPresentation(baseAvailability)).toEqual({
      label: 'На связи',
      tone: 'online',
    })
    expect(
      getSupportAvailabilityPresentation({
        ...baseAvailability,
        currentStatus: 'offline',
      }),
    ).toEqual({
      label: 'Ответим позже',
      tone: 'later',
    })
    expect(
      getSupportAvailabilityPresentation({
        ...baseAvailability,
        currentStatus: 'outside_hours',
      }),
    ).toEqual({
      label: 'Вне графика',
      tone: 'later',
    })
    expect(getSupportAvailabilityPresentation(null)).toEqual({
      label: 'Проверяем',
      tone: 'checking',
    })
  })

  it('groups consecutive working-hour rows with the same display value', () => {
    expect(
      groupWorkingHoursRows([
        {
          closeTime: null,
          dayOfWeek: 6,
          isClosedAllDay: true,
          isOpenAllDay: false,
          openTime: null,
        },
        {
          closeTime: null,
          dayOfWeek: 0,
          isClosedAllDay: true,
          isOpenAllDay: false,
          openTime: null,
        },
        {
          closeTime: '17:00',
          dayOfWeek: 1,
          isClosedAllDay: false,
          isOpenAllDay: false,
          openTime: '09:00',
        },
        {
          closeTime: '17:00',
          dayOfWeek: 2,
          isClosedAllDay: false,
          isOpenAllDay: false,
          openTime: '09:00',
        },
        {
          closeTime: '17:00',
          dayOfWeek: 3,
          isClosedAllDay: false,
          isOpenAllDay: false,
          openTime: '09:00',
        },
      ]),
    ).toEqual([
      {
        daysLabel: 'Пн - Ср',
        timeLabel: '09:00 - 17:00',
      },
      {
        daysLabel: 'Сб - Вс',
        timeLabel: 'Выходной',
      },
    ])
  })
})
