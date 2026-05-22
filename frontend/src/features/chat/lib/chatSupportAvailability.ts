import type {
  ChatSupportAvailabilityResponse,
  ChatWorkingHoursRow,
} from '../types'

export type SupportAvailabilityTone = 'checking' | 'later' | 'online'

const DAY_LABELS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'] as const
const DISPLAY_WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const
const DISPLAY_DAY_INDEX = new Map(
  DISPLAY_WEEK_ORDER.map((dayOfWeek, index) => [dayOfWeek, index]),
)

export function getSupportAvailabilityPresentation(
  availability: ChatSupportAvailabilityResponse | null,
): {
  label: string
  tone: SupportAvailabilityTone
} {
  if (!availability || availability.result !== 'ready') {
    return {
      label: 'Проверяем',
      tone: 'checking',
    }
  }

  switch (availability.currentStatus) {
    case 'online':
      return {
        label: 'На связи',
        tone: 'online',
      }
    case 'outside_hours':
      return {
        label: 'Вне графика',
        tone: 'later',
      }
    case 'offline':
    case 'unknown':
      return {
        label: 'Ответим позже',
        tone: 'later',
      }
  }

  return {
    label: 'Проверяем',
    tone: 'checking',
  }
}

function getRowTimeLabel(row: ChatWorkingHoursRow) {
  if (row.isClosedAllDay) {
    return 'Выходной'
  }

  if (row.isOpenAllDay) {
    return 'Круглосуточно'
  }

  return row.openTime && row.closeTime
    ? `${row.openTime} - ${row.closeTime}`
    : 'Не указано'
}

function getDaysLabel(days: Array<ChatWorkingHoursRow['dayOfWeek']>) {
  const firstDay = days[0]
  const lastDay = days.at(-1)

  if (firstDay === undefined || lastDay === undefined) {
    return ''
  }

  return firstDay === lastDay
    ? DAY_LABELS[firstDay]
    : `${DAY_LABELS[firstDay]} - ${DAY_LABELS[lastDay]}`
}

export function groupWorkingHoursRows(rows: ChatWorkingHoursRow[]) {
  const groups: Array<{
    days: Array<ChatWorkingHoursRow['dayOfWeek']>
    timeLabel: string
  }> = []

  for (const row of [...rows].sort(
    (left, right) =>
      (DISPLAY_DAY_INDEX.get(left.dayOfWeek) ?? 0) -
      (DISPLAY_DAY_INDEX.get(right.dayOfWeek) ?? 0),
  )) {
    const timeLabel = getRowTimeLabel(row)
    const previousGroup = groups.at(-1)
    const previousDay = previousGroup?.days.at(-1)

    if (
      previousGroup &&
      previousDay !== undefined &&
      previousGroup.timeLabel === timeLabel &&
      (DISPLAY_DAY_INDEX.get(previousDay) ?? -1) + 1 ===
        DISPLAY_DAY_INDEX.get(row.dayOfWeek)
    ) {
      previousGroup.days.push(row.dayOfWeek)
      continue
    }

    groups.push({
      days: [row.dayOfWeek],
      timeLabel,
    })
  }

  return groups.map((group) => ({
    daysLabel: getDaysLabel(group.days),
    timeLabel: group.timeLabel,
  }))
}
