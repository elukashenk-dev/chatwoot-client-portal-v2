import type {
  ChatMessage,
  ChatSupportAvailabilityResponse,
  ChatThreadInfoResponse,
  ChatThreadListSummary,
  ChatThreadSummary,
} from '../../../chat/types'

export const previewThread = {
  avatarUrl: null,
  id: 'private:me',
  subtitle: 'Вы и поддержка',
  title: 'Личный чат',
  type: 'private',
  unreadCount: 0,
} satisfies ChatThreadSummary & ChatThreadListSummary

export const previewMessages = [
  {
    attachments: [],
    authorName: 'Эдуард Лукашенко',
    authorRole: 'agent',
    content: 'Здравствуйте, вижу ваше обращение.',
    contentType: 'text',
    createdAt: '2026-06-05T12:55:00.000Z',
    direction: 'incoming',
    id: 101,
    status: 'sent',
  },
  {
    attachments: [],
    authorName: 'Вы',
    authorRole: 'current_user',
    content: 'И снова здравствуйте',
    contentType: 'text',
    createdAt: '2026-06-05T12:59:00.000Z',
    direction: 'outgoing',
    id: 102,
    status: 'sent',
  },
  {
    attachments: [],
    authorName: 'Эдуард Лукашенко',
    authorRole: 'agent',
    content: 'Привет, сейчас посмотрю.',
    contentType: 'text',
    createdAt: '2026-06-05T13:00:00.000Z',
    direction: 'incoming',
    id: 103,
    status: 'sent',
  },
] satisfies ChatMessage[]

const workingDayRows = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  closeTime: '17:00',
  dayOfWeek: dayOfWeek as 1 | 2 | 3 | 4 | 5,
  isClosedAllDay: false,
  isOpenAllDay: false,
  openTime: '09:00',
}))

export const previewSupportAvailability = {
  currentStatus: 'online',
  outOfOfficeMessage: null,
  reason: 'none',
  result: 'ready',
  workingHours: {
    enabled: true,
    isWithinWorkingHours: true,
    rows: [
      ...workingDayRows,
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
    ],
    timezone: 'Europe/Samara',
  },
} satisfies ChatSupportAvailabilityResponse

export const previewThreadInfo = {
  accessLabel: 'Вы и поддержка',
  activeThread: previewThread,
  curatorName: null,
  lastActivityAt: '2026-06-05T12:59:00.000Z',
  participants: [],
  reason: 'none',
  result: 'ready',
  startedAt: '2026-05-30T20:44:00.000Z',
  supportLabel: 'Поддержка',
  threadTypeLabel: 'Личный',
} satisfies ChatThreadInfoResponse
