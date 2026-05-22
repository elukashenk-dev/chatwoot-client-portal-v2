import type {
  PublicChatSupportAvailability,
  PublicChatWorkingHoursRow,
} from './types.js'

export type ChatSupportInboxDetails = {
  outOfOfficeMessage: string | null
  timezone: string | null
  workingHours: PublicChatWorkingHoursRow[]
  workingHoursEnabled: boolean
}

export type ChatSupportInboxMember = {
  availabilityStatus: string | null
  id: number
  name: string | null
}

const WEEKDAY_BY_SHORT_NAME: Record<
  string,
  PublicChatWorkingHoursRow['dayOfWeek']
> = {
  Fri: 5,
  Mon: 1,
  Sat: 6,
  Sun: 0,
  Thu: 4,
  Tue: 2,
  Wed: 3,
}

function readBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null
}

function readInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

function isDayOfWeek(
  value: number,
): value is PublicChatWorkingHoursRow['dayOfWeek'] {
  return value >= 0 && value <= 6
}

function isClockPart(value: number, max: number) {
  return value >= 0 && value <= max
}

function formatClock(hour: number, minutes: number) {
  return `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function readPayloadField(
  payload: Record<string, unknown>,
  snakeName: string,
  camelName: string,
) {
  return payload[snakeName] ?? payload[camelName]
}

function clockToMinutes(value: string | null) {
  if (!value) {
    return null
  }

  const match = /^(?<hour>\d{2}):(?<minutes>\d{2})$/.exec(value)
  const hour = Number(match?.groups?.hour)
  const minutes = Number(match?.groups?.minutes)

  return Number.isInteger(hour) &&
    Number.isInteger(minutes) &&
    isClockPart(hour, 23) &&
    isClockPart(minutes, 59)
    ? hour * 60 + minutes
    : null
}

export function normalizeChatwootWorkingHoursRow(
  payload: Record<string, unknown>,
): PublicChatWorkingHoursRow | null {
  const dayOfWeek = readInteger(
    readPayloadField(payload, 'day_of_week', 'dayOfWeek'),
  )
  const isClosedAllDay = readBoolean(
    readPayloadField(payload, 'closed_all_day', 'closedAllDay'),
  )
  const isOpenAllDay = readBoolean(
    readPayloadField(payload, 'open_all_day', 'openAllDay'),
  )

  if (
    dayOfWeek === null ||
    !isDayOfWeek(dayOfWeek) ||
    isClosedAllDay === null ||
    isOpenAllDay === null ||
    (isClosedAllDay && isOpenAllDay)
  ) {
    return null
  }

  if (isClosedAllDay) {
    return {
      closeTime: null,
      dayOfWeek,
      isClosedAllDay: true,
      isOpenAllDay: false,
      openTime: null,
    }
  }

  const openHour = readInteger(
    readPayloadField(payload, 'open_hour', 'openHour'),
  )
  const openMinutes = readInteger(
    readPayloadField(payload, 'open_minutes', 'openMinutes'),
  )
  const closeHour = readInteger(
    readPayloadField(payload, 'close_hour', 'closeHour'),
  )
  const closeMinutes = readInteger(
    readPayloadField(payload, 'close_minutes', 'closeMinutes'),
  )

  if (
    openHour === null ||
    openMinutes === null ||
    closeHour === null ||
    closeMinutes === null ||
    !isClockPart(openHour, 23) ||
    !isClockPart(closeHour, 23) ||
    !isClockPart(openMinutes, 59) ||
    !isClockPart(closeMinutes, 59)
  ) {
    return null
  }

  const openTime = formatClock(openHour, openMinutes)
  const closeTime = formatClock(closeHour, closeMinutes)
  const openTotalMinutes = clockToMinutes(openTime)
  const closeTotalMinutes = clockToMinutes(closeTime)

  if (
    openTotalMinutes === null ||
    closeTotalMinutes === null ||
    openTotalMinutes >= closeTotalMinutes
  ) {
    return null
  }

  return {
    closeTime,
    dayOfWeek,
    isClosedAllDay: false,
    isOpenAllDay,
    openTime,
  }
}

export function normalizeChatwootInboxMemberAvailability(
  members: ChatSupportInboxMember[],
) {
  let busyAgentCount = 0
  let onlineAgentCount = 0

  for (const member of members) {
    switch (member.availabilityStatus) {
      case 'available':
      case 'online':
        onlineAgentCount += 1
        break
      case 'busy':
        busyAgentCount += 1
        break
      default:
        break
    }
  }

  return {
    busyAgentCount,
    onlineAgentCount,
    totalAgentCount: members.length,
  }
}

function getInboxClock(now: Date, timezone: string) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      hourCycle: 'h23',
      minute: '2-digit',
      timeZone: timezone,
      weekday: 'short',
    }).formatToParts(now)
    const weekday = parts.find((part) => part.type === 'weekday')?.value
    const hour = Number(parts.find((part) => part.type === 'hour')?.value)
    const minute = Number(parts.find((part) => part.type === 'minute')?.value)
    const dayOfWeek = weekday ? WEEKDAY_BY_SHORT_NAME[weekday] : undefined

    if (
      dayOfWeek === undefined ||
      !Number.isInteger(hour) ||
      !Number.isInteger(minute)
    ) {
      return getInboxClock(now, 'UTC')
    }

    return {
      dayOfWeek,
      minutesSinceMidnight: hour * 60 + minute,
      timezone,
    }
  } catch {
    if (timezone === 'UTC') {
      return {
        dayOfWeek: now.getUTCDay() as PublicChatWorkingHoursRow['dayOfWeek'],
        minutesSinceMidnight: now.getUTCHours() * 60 + now.getUTCMinutes(),
        timezone: 'UTC',
      }
    }

    return getInboxClock(now, 'UTC')
  }
}

function isWithinWorkingHours({
  now,
  rows,
  timezone,
}: {
  now: Date
  rows: PublicChatWorkingHoursRow[]
  timezone: string
}) {
  const inboxClock = getInboxClock(now, timezone)
  const todayRow =
    rows.find((row) => row.dayOfWeek === inboxClock.dayOfWeek) ?? null

  if (!todayRow || todayRow.isClosedAllDay) {
    return {
      isWithinWorkingHours: false,
      timezone: inboxClock.timezone,
    }
  }

  if (todayRow.isOpenAllDay) {
    return {
      isWithinWorkingHours: true,
      timezone: inboxClock.timezone,
    }
  }

  const openMinutes = clockToMinutes(todayRow.openTime)
  const closeMinutes = clockToMinutes(todayRow.closeTime)

  if (openMinutes === null || closeMinutes === null) {
    return {
      isWithinWorkingHours: false,
      timezone: inboxClock.timezone,
    }
  }

  return {
    isWithinWorkingHours:
      inboxClock.minutesSinceMidnight >= openMinutes &&
      inboxClock.minutesSinceMidnight <= closeMinutes,
    timezone: inboxClock.timezone,
  }
}

export function buildPublicChatSupportAvailability({
  inbox,
  members,
  now,
}: {
  inbox: ChatSupportInboxDetails
  members: ChatSupportInboxMember[]
  now: Date
}): PublicChatSupportAvailability {
  const timezone = inbox.timezone?.trim() || 'UTC'
  const agentStatus = normalizeChatwootInboxMemberAvailability(members)
  const workingHoursState = inbox.workingHoursEnabled
    ? isWithinWorkingHours({
        now,
        rows: inbox.workingHours,
        timezone,
      })
    : { isWithinWorkingHours: null, timezone }
  const currentStatus =
    workingHoursState.isWithinWorkingHours === false
      ? 'outside_hours'
      : agentStatus.onlineAgentCount > 0
        ? 'online'
        : 'offline'

  return {
    currentStatus,
    outOfOfficeMessage: inbox.outOfOfficeMessage?.trim() || null,
    reason: 'none',
    result: 'ready',
    workingHours: {
      enabled: inbox.workingHoursEnabled,
      isWithinWorkingHours: workingHoursState.isWithinWorkingHours,
      rows: [...inbox.workingHours].sort(
        (left, right) => left.dayOfWeek - right.dayOfWeek,
      ),
      timezone: workingHoursState.timezone,
    },
  }
}
