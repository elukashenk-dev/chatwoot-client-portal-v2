export type PublicChatSupportAvailabilityReason =
  | 'none'
  | 'chatwoot_not_configured'
  | 'chatwoot_unavailable'

export type PublicChatSupportAvailabilityStatus =
  | 'offline'
  | 'online'
  | 'outside_hours'
  | 'unknown'

export type PublicChatWorkingHoursRow = {
  closeTime: string | null
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6
  isClosedAllDay: boolean
  isOpenAllDay: boolean
  openTime: string | null
}

export type PublicChatWorkingHoursInfo = {
  enabled: boolean
  isWithinWorkingHours: boolean | null
  rows: PublicChatWorkingHoursRow[]
  timezone: string
}

export type PublicChatSupportAvailability = {
  currentStatus: PublicChatSupportAvailabilityStatus
  outOfOfficeMessage: string | null
  reason: PublicChatSupportAvailabilityReason
  result: 'not_ready' | 'ready' | 'unavailable'
  workingHours: PublicChatWorkingHoursInfo
}
