# Статус поддержки и часы работы Implementation Plan

> **Для агентных исполнителей:** ОБЯЗАТЕЛЬНЫЙ SUB-SKILL: используйте `superpowers:subagent-driven-development` (recommended) или `superpowers:executing-plans`, чтобы выполнять этот план task-by-task. Steps используют checkbox (`- [ ]`) syntax для tracking.

**Цель:** заменить connection-based `Онлайн` в шапке чата на реальный статус поддержки из Chatwoot и добавить `Часы работы` на страницу `Информация о чате`.

**Архитектура:** Backend остается единственной authority-зоной: он читает tenant-scoped Chatwoot portal inbox и inbox members, нормализует availability/working-hours и отдает browser только portal-owned DTO. Frontend получает standalone `/api/chat/support-availability`, показывает компактный статус в `ChatHeader` и переиспользует те же данные для блока `Часы работы` в `ChatInfoPage`.

**Технологии:** Fastify, TypeScript, Vitest, React 19, Vite, Testing Library, Playwright, Chatwoot Application API.

---

## Контекст

Дизайн: `docs/superpowers/specs/2026-05-22-chat-support-availability-design.md`.

Выбранный UI:

- header option `A. Minimal Status`;
- labels: `На связи`, `Ответим позже`, `Вне графика`, `Проверяем`;
- private copy: `Только вы и поддержка` меняется на `Вы и поддержка`;
- `Информация о чате` получает read-only блок `Часы работы`.

Chatwoot source of truth:

- inbox details endpoint возвращает `working_hours_enabled`, `working_hours`, `timezone`, `out_of_office_message`;
- inbox members endpoint возвращает `availability_status`;
- CE source использует `online`, `busy`, `offline`; parser также принимает `available` как online-compatible статус.

## File Structure

Backend:

- Create `backend/src/modules/chat-support/types.ts`: public DTO types for support availability and working hours.
- Create `backend/src/modules/chat-support/availability.ts`: pure normalization and status computation, no Fastify and no network.
- Create `backend/src/modules/chat-support/availability.test.ts`: unit tests for timezone, schedule, agent status, fail-closed behavior.
- Create `backend/src/modules/chat-support/service.ts`: Chatwoot client orchestration and controlled unavailable/not-ready states.
- Create `backend/src/modules/chat-support/service.test.ts`: service tests for Chatwoot errors and state priority.
- Create `backend/src/modules/chat-support/routes.ts`: authenticated route `GET /api/chat/support-availability`.
- Create `backend/src/modules/chat-support/routes.test.ts`: route auth/session and response tests.
- Modify `backend/src/integrations/chatwoot/client.ts`: add `getPortalInboxDetails()` and `listPortalInboxMembers()`.
- Modify `backend/src/integrations/chatwoot/client.test.ts`: Chatwoot payload mapping tests.
- Modify `backend/src/app.ts`: wire `createChatSupportAvailabilityServiceForRequest` and register routes.
- Modify `backend/src/modules/chat-threads/info.ts`: private access label copy.
- Modify `backend/src/modules/chat-threads/types.ts`: private thread subtitle copy.
- Modify backend tests containing the old private copy.

Frontend:

- Modify `frontend/src/features/chat/types.ts`: add support availability DTO types.
- Modify `frontend/src/features/chat/api/chatClient.ts`: add `getChatSupportAvailability()`.
- Create `frontend/src/features/chat/lib/chatSupportAvailability.ts`: UI label/tone and grouped working-hours formatting.
- Create `frontend/src/features/chat/lib/chatSupportAvailability.test.ts`: pure formatter tests.
- Create `frontend/src/features/chat/pages/useChatSupportAvailability.ts`: fetch/poll hook with stale-response protection.
- Create `frontend/src/features/chat/pages/useChatSupportAvailability.test.tsx`: hook tests.
- Modify `frontend/src/features/chat/components/ChatHeader.tsx`: replace `isReady` presence label with support availability presentation.
- Modify `frontend/src/features/chat/components/ChatInfoPage.tsx`: render `Часы работы`.
- Modify `frontend/src/features/chat/components/ChatInfoPage.test.tsx`: hours rendering tests.
- Modify `frontend/src/features/chat/pages/ChatPage.tsx`: create hook and pass state to header/auxiliary pages.
- Modify `frontend/src/features/chat/pages/ChatAuxiliaryPages.tsx`: pass support availability to `ChatInfoPage`.
- Modify frontend tests containing the old private copy and tests that mock chat API fetches.

Browser/runtime:

- Modify `tests/e2e/chat-read-model.spec.ts`: route support availability, assert header status, assert `Часы работы` block, and keep no direct Chatwoot browser request invariant.

Docs after implementation:

- Modify `docs/roadmap/work-log.md` only after implementation, review, fixes, targeted checks, required tests and runtime validation are complete.

---

### Task 1: Backend pure availability model

**Files:**

- Create: `backend/src/modules/chat-support/types.ts`
- Create: `backend/src/modules/chat-support/availability.ts`
- Test: `backend/src/modules/chat-support/availability.test.ts`

- [ ] **Step 1: Write failing pure unit tests**

Create `backend/src/modules/chat-support/availability.test.ts`:

```ts
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
      agentStatus: {
        onlineAgentCount: 1,
        totalAgentCount: 1,
      },
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
      agentStatus: {
        busyAgentCount: 1,
        onlineAgentCount: 0,
        totalAgentCount: 2,
      },
      currentStatus: 'offline',
      workingHours: {
        enabled: false,
        isWithinWorkingHours: null,
      },
    })
  })
})
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
pnpm --dir backend test -- src/modules/chat-support/availability.test.ts
```

Expected: FAIL because `backend/src/modules/chat-support/availability.ts` does not exist.

- [ ] **Step 3: Add public backend DTO types**

Create `backend/src/modules/chat-support/types.ts`:

```ts
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
  agentStatus: {
    busyAgentCount: number
    onlineAgentCount: number
    totalAgentCount: number
  }
  currentStatus: PublicChatSupportAvailabilityStatus
  outOfOfficeMessage: string | null
  reason: PublicChatSupportAvailabilityReason
  result: 'not_ready' | 'ready' | 'unavailable'
  workingHours: PublicChatWorkingHoursInfo
}
```

- [ ] **Step 4: Add pure availability implementation**

Create `backend/src/modules/chat-support/availability.ts`:

```ts
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
    agentStatus,
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
```

- [ ] **Step 5: Run unit tests**

Run:

```bash
pnpm --dir backend test -- src/modules/chat-support/availability.test.ts
```

Expected: PASS.

---

### Task 2: Chatwoot client inbox details and members

**Files:**

- Modify: `backend/src/integrations/chatwoot/client.ts`
- Test: `backend/src/integrations/chatwoot/client.test.ts`

- [ ] **Step 1: Add failing Chatwoot client tests**

Append tests inside `describe('createChatwootClient', () => { ... })` in `backend/src/integrations/chatwoot/client.test.ts`:

```ts
it('reads portal inbox details with working hours metadata', async () => {
  const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
    createJsonResponse({
      channel_type: 'Channel::Api',
      id: 9,
      lock_to_single_conversation: true,
      out_of_office_message: 'Ответим в рабочее время.',
      timezone: 'Europe/Samara',
      webhook_url: 'https://portal.example.test/webhook',
      working_hours: [
        {
          close_hour: 17,
          close_minutes: 0,
          closed_all_day: false,
          day_of_week: 1,
          open_all_day: false,
          open_hour: 9,
          open_minutes: 0,
        },
        {
          closed_all_day: true,
          day_of_week: 0,
          open_all_day: false,
        },
      ],
      working_hours_enabled: true,
    }),
  )
  const client = createChatwootClient({
    env: testChatwootEnv,
    fetchFn,
  })

  await expect(client.getPortalInboxDetails()).resolves.toEqual({
    channelType: 'Channel::Api',
    id: 9,
    lockToSingleConversation: true,
    outOfOfficeMessage: 'Ответим в рабочее время.',
    timezone: 'Europe/Samara',
    webhookSecret: null,
    webhookUrl: 'https://portal.example.test/webhook',
    workingHours: [
      {
        closeHour: 17,
        closeMinutes: 0,
        closedAllDay: false,
        dayOfWeek: 1,
        openAllDay: false,
        openHour: 9,
        openMinutes: 0,
      },
      {
        closeHour: null,
        closeMinutes: null,
        closedAllDay: true,
        dayOfWeek: 0,
        openAllDay: false,
        openHour: null,
        openMinutes: null,
      },
    ],
    workingHoursEnabled: true,
  })
  expect(String(fetchFn.mock.calls[0]?.[0])).toBe(
    'http://127.0.0.1:3000/api/v1/accounts/3/inboxes/9',
  )
})

it('lists portal inbox members with availability statuses', async () => {
  const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
    createJsonResponse({
      payload: [
        {
          availability_status: 'online',
          id: 11,
          name: 'Анна Маттина',
        },
        {
          availability_status: 'busy',
          id: 12,
          name: 'Ольга Support',
        },
      ],
    }),
  )
  const client = createChatwootClient({
    env: testChatwootEnv,
    fetchFn,
  })

  await expect(client.listPortalInboxMembers()).resolves.toEqual([
    {
      availabilityStatus: 'online',
      id: 11,
      name: 'Анна Маттина',
    },
    {
      availabilityStatus: 'busy',
      id: 12,
      name: 'Ольга Support',
    },
  ])
  expect(String(fetchFn.mock.calls[0]?.[0])).toBe(
    'http://127.0.0.1:3000/api/v1/accounts/3/inbox_members/9',
  )
})
```

- [ ] **Step 2: Run failing client tests**

Run:

```bash
pnpm --dir backend test -- src/integrations/chatwoot/client.test.ts
```

Expected: FAIL because `getPortalInboxDetails` and `listPortalInboxMembers` are missing.

- [ ] **Step 3: Extend Chatwoot client types and mappers**

In `backend/src/integrations/chatwoot/client.ts`:

1. Add exported types near existing Chatwoot portal inbox types:

```ts
export type ChatwootPortalInboxWorkingHour = {
  closeHour: number | null
  closeMinutes: number | null
  closedAllDay: boolean
  dayOfWeek: number
  openAllDay: boolean
  openHour: number | null
  openMinutes: number | null
}

export type ChatwootPortalInboxDetails = ChatwootPortalInboxRouting & {
  outOfOfficeMessage: string | null
  timezone: string | null
  workingHours: ChatwootPortalInboxWorkingHour[]
  workingHoursEnabled: boolean
}

export type ChatwootPortalInboxMember = {
  availabilityStatus: string | null
  id: number
  name: string | null
}
```

2. Add mapper helpers near `mapPortalInboxRouting`:

```ts
function readBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null
}

function mapPortalInboxWorkingHour(
  payload: unknown,
): ChatwootPortalInboxWorkingHour | null {
  if (!isPlainObject(payload)) {
    return null
  }

  const dayOfWeek = readInteger(payload.day_of_week)
  const closedAllDay = readBoolean(payload.closed_all_day)
  const openAllDay = readBoolean(payload.open_all_day)

  if (dayOfWeek === null || closedAllDay === null || openAllDay === null) {
    return null
  }

  return {
    closeHour: readInteger(payload.close_hour),
    closeMinutes: readInteger(payload.close_minutes),
    closedAllDay,
    dayOfWeek,
    openAllDay,
    openHour: readInteger(payload.open_hour),
    openMinutes: readInteger(payload.open_minutes),
  }
}

function mapPortalInboxDetails(payload: unknown): ChatwootPortalInboxDetails {
  const routing = mapPortalInboxRouting(payload)

  if (!isPlainObject(payload)) {
    throw new ChatwootClientRequestError(
      'Chatwoot inbox lookup returned an unexpected response shape.',
    )
  }

  const workingHoursEnabled =
    typeof payload.working_hours_enabled === 'boolean'
      ? payload.working_hours_enabled
      : false
  const workingHours = Array.isArray(payload.working_hours)
    ? payload.working_hours
        .map(mapPortalInboxWorkingHour)
        .filter((row): row is ChatwootPortalInboxWorkingHour => row !== null)
    : []

  return {
    ...routing,
    outOfOfficeMessage: readTrimmedString(payload.out_of_office_message),
    timezone: readTrimmedString(payload.timezone),
    workingHours,
    workingHoursEnabled,
  }
}

function parseInboxMembersResponse(payload: unknown) {
  const parsedPayload = readObject(payload)
  const rawMembers = parsedPayload?.payload

  if (!Array.isArray(rawMembers)) {
    throw new ChatwootClientRequestError(
      'Chatwoot inbox members lookup returned an unexpected response shape.',
    )
  }

  return rawMembers
    .map((rawMember): ChatwootPortalInboxMember | null => {
      const member = readObject(rawMember)
      const id = readInteger(member?.id)

      if (id === null) {
        return null
      }

      return {
        availabilityStatus: readTrimmedString(member?.availability_status),
        id,
        name: readTrimmedString(member?.name),
      }
    })
    .filter((member): member is ChatwootPortalInboxMember => member !== null)
}
```

- [ ] **Step 4: Add Chatwoot client methods**

Inside the returned object from `createChatwootClient`, add:

```ts
    async getPortalInboxDetails() {
      const payload = await getPortalInboxRoutingPayload()

      return mapPortalInboxDetails(payload)
    },

    async listPortalInboxMembers() {
      const resolvedConfig = assertConfigured()
      const requestUrl = new URL(
        `/api/v1/accounts/${resolvedConfig.accountId}/inbox_members/${resolvedConfig.portalInboxId}`,
        resolvedConfig.baseUrl,
      )
      const payload = await requestJson(
        requestUrl,
        'Chatwoot inbox members lookup is unavailable.',
      )

      return parseInboxMembersResponse(payload)
    },
```

To avoid duplicating the inbox request, extract the existing body of `getPortalInboxRouting()` into a local helper before `getPortalInboxRouting()`:

```ts
async function getPortalInboxRoutingPayload() {
  const resolvedConfig = assertConfigured()
  const requestUrl = new URL(
    `/api/v1/accounts/${resolvedConfig.accountId}/inboxes/${resolvedConfig.portalInboxId}`,
    resolvedConfig.baseUrl,
  )

  return requestJson(requestUrl, 'Chatwoot portal inbox lookup is unavailable.')
}

async function getPortalInboxRouting() {
  return mapPortalInboxRouting(await getPortalInboxRoutingPayload())
}
```

- [ ] **Step 5: Run client tests**

Run:

```bash
pnpm --dir backend test -- src/integrations/chatwoot/client.test.ts
```

Expected: PASS.

---

### Task 3: Backend support availability service and route

**Files:**

- Create: `backend/src/modules/chat-support/service.ts`
- Create: `backend/src/modules/chat-support/service.test.ts`
- Create: `backend/src/modules/chat-support/routes.ts`
- Create: `backend/src/modules/chat-support/routes.test.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Write failing service tests**

Create `backend/src/modules/chat-support/service.test.ts`:

```ts
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
```

- [ ] **Step 2: Write failing route tests**

Create `backend/src/modules/chat-support/routes.test.ts`:

```ts
import cookie from '@fastify/cookie'
import Fastify from 'fastify'
import { describe, expect, it, vi } from 'vitest'
import type { MockedFunction } from 'vitest'

import { registerApiErrorHandler } from '../../lib/errors.js'
import { testEnv } from '../../test/appTestHelpers.js'
import type { AuthService } from '../auth/service.js'
import type { TenantRequestContext } from '../tenants/service.js'
import { registerChatSupportRoutes } from './routes.js'
import type { ChatSupportAvailabilityService } from './service.js'

const tenant: TenantRequestContext = {
  chatwoot: {
    accountId: 1,
    apiAccessToken: 'test-api-token',
    baseUrl: 'https://chatwoot.example.test',
    portalInboxId: 1,
    webhookSecret: 'test-webhook-secret',
  },
  displayName: 'Local Test Tenant',
  id: 1,
  isDefault: true,
  primaryDomain: 'localhost',
  publicBaseUrl: testEnv.APP_ORIGIN,
  slug: 'default',
  status: 'active',
}

function createAuthorizedCookie(app: ReturnType<typeof Fastify>) {
  return `${testEnv.SESSION_COOKIE_NAME}=${app.signCookie('session-token')}`
}

async function buildSupportRoutesTestApp({
  getSupportAvailability = vi.fn().mockResolvedValue({
    agentStatus: {
      busyAgentCount: 0,
      onlineAgentCount: 1,
      totalAgentCount: 1,
    },
    currentStatus: 'online',
    outOfOfficeMessage: null,
    reason: 'none',
    result: 'ready',
    workingHours: {
      enabled: false,
      isWithinWorkingHours: null,
      rows: [],
      timezone: 'UTC',
    },
  }),
}: {
  getSupportAvailability?: MockedFunction<
    ChatSupportAvailabilityService['getSupportAvailability']
  >
} = {}) {
  const app = Fastify({ logger: false })
  const authService = {
    getCurrentUser: vi.fn(async () => ({
      email: 'user@example.test',
      fullName: 'Portal User',
      id: 7,
    })),
  } as unknown as AuthService

  app.register(cookie, {
    hook: 'onRequest',
    secret: testEnv.SESSION_SECRET,
  })
  app.decorateRequest('tenant', null)
  app.addHook('onRequest', async (request) => {
    request.tenant = tenant
  })
  registerApiErrorHandler(app)
  registerChatSupportRoutes(app, {
    authService,
    createChatSupportAvailabilityService: () => ({
      getSupportAvailability,
    }),
    env: testEnv,
  })
  await app.ready()

  return {
    app,
    getSupportAvailability,
  }
}

describe('registerChatSupportRoutes', () => {
  it('returns authenticated support availability', async () => {
    const { app, getSupportAvailability } = await buildSupportRoutesTestApp()

    try {
      const response = await app.inject({
        headers: {
          cookie: createAuthorizedCookie(app),
        },
        method: 'GET',
        url: '/api/chat/support-availability',
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({
        currentStatus: 'online',
        result: 'ready',
      })
      expect(getSupportAvailability).toHaveBeenCalledTimes(1)
    } finally {
      await app.close()
    }
  })

  it('requires an authenticated portal session', async () => {
    const { app, getSupportAvailability } = await buildSupportRoutesTestApp()

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/chat/support-availability',
      })

      expect(response.statusCode).toBe(401)
      expect(getSupportAvailability).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })
})
```

- [ ] **Step 3: Run failing service/route tests**

Run:

```bash
pnpm --dir backend test -- src/modules/chat-support/service.test.ts src/modules/chat-support/routes.test.ts
```

Expected: FAIL because service and route files are missing.

- [ ] **Step 4: Implement service**

Create `backend/src/modules/chat-support/service.ts`:

```ts
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

const unavailableWorkingHours = {
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
    agentStatus: {
      busyAgentCount: 0,
      onlineAgentCount: 0,
      totalAgentCount: 0,
    },
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
```

- [ ] **Step 5: Implement route**

Create `backend/src/modules/chat-support/routes.ts`:

```ts
import type { FastifyInstance, FastifyRequest } from 'fastify'

import type { AppEnv } from '../../config/env.js'
import { resolveAuthenticatedPortalUser } from '../auth/currentUser.js'
import type { AuthService } from '../auth/service.js'
import type { ChatSupportAvailabilityService } from './service.js'

type RegisterChatSupportRoutesOptions = {
  authService: AuthService
  createChatSupportAvailabilityService: (
    request: FastifyRequest,
  ) => Pick<ChatSupportAvailabilityService, 'getSupportAvailability'>
  env: AppEnv
}

export function registerChatSupportRoutes(
  app: FastifyInstance,
  {
    authService,
    createChatSupportAvailabilityService,
    env,
  }: RegisterChatSupportRoutesOptions,
) {
  app.get('/api/chat/support-availability', async (request, reply) => {
    await resolveAuthenticatedPortalUser({
      authService,
      env,
      reply,
      request,
    })

    return createChatSupportAvailabilityService(
      request,
    ).getSupportAvailability()
  })
}
```

- [ ] **Step 6: Wire route in app**

Modify `backend/src/app.ts`:

1. Add imports:

```ts
import { registerChatSupportRoutes } from './modules/chat-support/routes.js'
import { createChatSupportAvailabilityService } from './modules/chat-support/service.js'
```

2. Add factory after `createChatMessagesServiceForRequest`:

```ts
const createChatSupportAvailabilityServiceForRequest = (
  request: FastifyRequest,
) =>
  createChatSupportAvailabilityService({
    chatwootClient: createChatwootClientForRequest(request),
  })
```

3. Register route after chat thread routes:

```ts
registerChatSupportRoutes(app, {
  authService,
  createChatSupportAvailabilityService:
    createChatSupportAvailabilityServiceForRequest,
  env,
})
```

- [ ] **Step 7: Run backend support tests**

Run:

```bash
pnpm --dir backend test -- src/modules/chat-support/availability.test.ts src/modules/chat-support/service.test.ts src/modules/chat-support/routes.test.ts src/integrations/chatwoot/client.test.ts
```

Expected: PASS.

---

### Task 4: Private chat copy change

**Files:**

- Modify: `backend/src/modules/chat-threads/info.ts`
- Modify: `backend/src/modules/chat-threads/types.ts`
- Modify affected backend/frontend tests with old private copy.

- [ ] **Step 1: Change backend copy source**

Modify `backend/src/modules/chat-threads/info.ts`:

```ts
export function buildChatThreadAccessLabel(threadType: ChatInfoThreadType) {
  return threadType === 'group'
    ? 'Участники группы и поддержка'
    : 'Вы и поддержка'
}
```

Modify `backend/src/modules/chat-threads/types.ts`:

```ts
export function buildPrivateThread(): PublicChatThreadSummary {
  return {
    id: PRIVATE_CHAT_THREAD_ID,
    subtitle: 'Вы и поддержка',
    title: 'Личный чат',
    type: 'private',
  }
}
```

- [ ] **Step 2: Update test fixtures**

Run:

```bash
rg -n "Только вы и поддержка" backend/src frontend/src tests
```

Update only code/test fixtures under `backend/src`, `frontend/src`, and `tests` where the phrase describes the private chat subtitle/access label. Keep historical docs/specs unchanged.

The known affected files at plan time are:

```text
backend/src/modules/chat-realtime/routes.test.ts
backend/src/modules/chat-realtime/hub.test.ts
backend/src/modules/chatwoot-webhooks/service.test.ts
backend/src/modules/chat-threads/routes.test.ts
backend/src/modules/chat-threads/service.info.test.ts
backend/src/modules/chat-threads/info.test.ts
backend/src/modules/chat-threads/service.test.ts
backend/src/modules/chat-threads/app-integration.test.ts
backend/src/modules/chat-messages/service.test.ts
backend/src/modules/chat-messages/service.search.test.ts
backend/src/modules/chat-messages/service.media.test.ts
backend/src/modules/chat-messages/service.context.test.ts
backend/src/modules/chat-messages/routes.search.test.ts
backend/src/modules/chat-messages/service.conversation-recovery.test.ts
frontend/src/features/auth/pages/LoginPage.test.tsx
frontend/src/features/chat/components/ChatInfoPage.test.tsx
frontend/src/features/chat/components/ChatSearchPage.test.tsx
frontend/src/features/chat/lib/chatSearch.test.ts
frontend/src/features/chat/pages/ChatPage.test.tsx
frontend/src/features/chat/pages/ChatPage.media.test.tsx
frontend/src/features/chat/pages/ChatPage.optimistic-send.test.tsx
frontend/src/features/chat/pages/ChatPage.runtime.test.tsx
frontend/src/features/chat/pages/ChatPage.search.test.tsx
frontend/src/features/chat/pages/ChatPage.search-context-regression.test.tsx
frontend/src/features/chat/pages/ChatPage.thread-selection.test.tsx
frontend/src/features/chat/pages/useChatInfoPanel.test.tsx
frontend/src/features/chat/pages/useChatMediaPanel.test.tsx
frontend/src/features/chat/pages/useChatSearchPanel.test.tsx
tests/e2e/chat-read-model.spec.ts
tests/e2e/chat-search-page.spec.ts
```

- [ ] **Step 3: Run targeted copy tests**

Run:

```bash
pnpm --dir backend test -- src/modules/chat-threads/info.test.ts src/modules/chat-threads/routes.test.ts src/modules/chat-threads/service.info.test.ts
pnpm --dir frontend test -- src/features/chat/components/ChatInfoPage.test.tsx src/features/chat/pages/useChatInfoPanel.test.tsx
```

Expected: PASS.

---

### Task 5: Frontend API types and presentation helpers

**Files:**

- Modify: `frontend/src/features/chat/types.ts`
- Modify: `frontend/src/features/chat/api/chatClient.ts`
- Create: `frontend/src/features/chat/lib/chatSupportAvailability.ts`
- Test: `frontend/src/features/chat/lib/chatSupportAvailability.test.ts`

- [ ] **Step 1: Write failing frontend helper tests**

Create `frontend/src/features/chat/lib/chatSupportAvailability.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  getSupportAvailabilityPresentation,
  groupWorkingHoursRows,
} from './chatSupportAvailability'
import type { ChatSupportAvailabilityResponse } from '../types'

const baseAvailability = {
  agentStatus: {
    busyAgentCount: 0,
    onlineAgentCount: 1,
    totalAgentCount: 1,
  },
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
```

- [ ] **Step 2: Run failing frontend helper tests**

Run:

```bash
pnpm --dir frontend test -- src/features/chat/lib/chatSupportAvailability.test.ts
```

Expected: FAIL because helper/types are missing.

- [ ] **Step 3: Add frontend DTO types**

Modify `frontend/src/features/chat/types.ts`:

```ts
export type ChatSupportAvailabilityStatus =
  | 'offline'
  | 'online'
  | 'outside_hours'
  | 'unknown'

export type ChatSupportAvailabilityReason =
  | 'none'
  | 'chatwoot_not_configured'
  | 'chatwoot_unavailable'

export type ChatWorkingHoursRow = {
  closeTime: string | null
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6
  isClosedAllDay: boolean
  isOpenAllDay: boolean
  openTime: string | null
}

export type ChatWorkingHoursInfo = {
  enabled: boolean
  isWithinWorkingHours: boolean | null
  rows: ChatWorkingHoursRow[]
  timezone: string
}

export type ChatSupportAvailabilityResponse = {
  agentStatus: {
    busyAgentCount: number
    onlineAgentCount: number
    totalAgentCount: number
  }
  currentStatus: ChatSupportAvailabilityStatus
  outOfOfficeMessage: string | null
  reason: ChatSupportAvailabilityReason
  result: ChatThreadResult
  workingHours: ChatWorkingHoursInfo
}
```

- [ ] **Step 4: Add API function**

Modify imports in `frontend/src/features/chat/api/chatClient.ts`:

```ts
  ChatSupportAvailabilityResponse,
```

Add function:

```ts
export async function getChatSupportAvailability() {
  return request<ChatSupportAvailabilityResponse>('/chat/support-availability')
}
```

- [ ] **Step 5: Add presentation helpers**

Create `frontend/src/features/chat/lib/chatSupportAvailability.ts`:

```ts
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
```

- [ ] **Step 6: Run frontend helper tests**

Run:

```bash
pnpm --dir frontend test -- src/features/chat/lib/chatSupportAvailability.test.ts
```

Expected: PASS.

---

### Task 6: Frontend support availability hook

**Files:**

- Create: `frontend/src/features/chat/pages/useChatSupportAvailability.ts`
- Test: `frontend/src/features/chat/pages/useChatSupportAvailability.test.tsx`

- [ ] **Step 1: Write failing hook tests**

Create `frontend/src/features/chat/pages/useChatSupportAvailability.test.tsx`:

```tsx
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getChatSupportAvailability } from '../api/chatClient'
import type { ChatSupportAvailabilityResponse } from '../types'
import { useChatSupportAvailability } from './useChatSupportAvailability'

vi.mock('../api/chatClient', async () => {
  const actual =
    await vi.importActual<typeof import('../api/chatClient')>(
      '../api/chatClient',
    )

  return {
    ...actual,
    getChatSupportAvailability: vi.fn(),
  }
})

const getChatSupportAvailabilityMock = vi.mocked(getChatSupportAvailability)

function createAvailability(
  currentStatus: ChatSupportAvailabilityResponse['currentStatus'] = 'online',
): ChatSupportAvailabilityResponse {
  return {
    agentStatus: {
      busyAgentCount: 0,
      onlineAgentCount: currentStatus === 'online' ? 1 : 0,
      totalAgentCount: 1,
    },
    currentStatus,
    outOfOfficeMessage: null,
    reason: 'none',
    result: 'ready',
    workingHours: {
      enabled: false,
      isWithinWorkingHours: null,
      rows: [],
      timezone: 'UTC',
    },
  }
}

function createDeferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })

  return {
    promise,
    resolve,
  }
}

describe('useChatSupportAvailability', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('loads support availability and marks browser online', async () => {
    const markBrowserOnline = vi.fn()
    getChatSupportAvailabilityMock.mockResolvedValueOnce(
      createAvailability('online'),
    )

    const { result } = renderHook(() =>
      useChatSupportAvailability({
        handleConnectionUnavailableError: vi.fn(() => false),
        handleUnauthorizedChatError: vi.fn(async () => false),
        isBrowserOnline: true,
        isMountedRef: { current: true },
        markBrowserOnline,
      }),
    )

    await waitFor(() => {
      expect(result.current.state.availability?.currentStatus).toBe('online')
    })

    expect(result.current.state.isLoading).toBe(false)
    expect(markBrowserOnline).toHaveBeenCalledTimes(1)
  })

  it('ignores stale support availability responses', async () => {
    const firstRequest = createDeferred<ChatSupportAvailabilityResponse>()
    const secondRequest = createDeferred<ChatSupportAvailabilityResponse>()
    getChatSupportAvailabilityMock
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise)

    const { result } = renderHook(() =>
      useChatSupportAvailability({
        handleConnectionUnavailableError: vi.fn(() => false),
        handleUnauthorizedChatError: vi.fn(async () => false),
        isBrowserOnline: false,
        isMountedRef: { current: true },
        markBrowserOnline: vi.fn(),
      }),
    )

    act(() => {
      void result.current.loadSupportAvailability()
      void result.current.loadSupportAvailability()
    })

    await act(async () => {
      firstRequest.resolve(createAvailability('offline'))
      await Promise.resolve()
    })
    expect(result.current.state.availability).toBeNull()

    await act(async () => {
      secondRequest.resolve(createAvailability('outside_hours'))
      await Promise.resolve()
    })
    expect(result.current.state.availability?.currentStatus).toBe(
      'outside_hours',
    )
  })

  it('polls while browser is online', async () => {
    vi.useFakeTimers()
    getChatSupportAvailabilityMock.mockResolvedValue(
      createAvailability('online'),
    )

    renderHook(() =>
      useChatSupportAvailability({
        handleConnectionUnavailableError: vi.fn(() => false),
        handleUnauthorizedChatError: vi.fn(async () => false),
        isBrowserOnline: true,
        isMountedRef: { current: true },
        markBrowserOnline: vi.fn(),
      }),
    )

    await act(async () => {
      await Promise.resolve()
    })
    expect(getChatSupportAvailabilityMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(getChatSupportAvailabilityMock).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Run failing hook tests**

Run:

```bash
pnpm --dir frontend test -- src/features/chat/pages/useChatSupportAvailability.test.tsx
```

Expected: FAIL because hook is missing.

- [ ] **Step 3: Implement hook**

Create `frontend/src/features/chat/pages/useChatSupportAvailability.ts`:

```ts
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

import { getChatSupportAvailability } from '../api/chatClient'
import type { ChatSupportAvailabilityResponse } from '../types'

const SUPPORT_AVAILABILITY_POLL_MS = 30_000

type UseChatSupportAvailabilityOptions = {
  handleConnectionUnavailableError: (error: unknown) => boolean
  handleUnauthorizedChatError: (error: unknown) => Promise<boolean>
  isBrowserOnline: boolean
  isMountedRef: RefObject<boolean>
  markBrowserOnline: () => void
}

export type ChatSupportAvailabilityState = {
  availability: ChatSupportAvailabilityResponse | null
  isLoading: boolean
}

export function useChatSupportAvailability({
  handleConnectionUnavailableError,
  handleUnauthorizedChatError,
  isBrowserOnline,
  isMountedRef,
  markBrowserOnline,
}: UseChatSupportAvailabilityOptions) {
  const requestSequenceRef = useRef(0)
  const [state, setState] = useState<ChatSupportAvailabilityState>({
    availability: null,
    isLoading: true,
  })

  const isCurrentRequest = useCallback(
    (requestId: number) =>
      isMountedRef.current && requestSequenceRef.current === requestId,
    [isMountedRef],
  )

  const loadSupportAvailability = useCallback(async () => {
    const requestId = requestSequenceRef.current + 1
    requestSequenceRef.current = requestId
    setState((currentState) => ({
      ...currentState,
      isLoading: currentState.availability === null,
    }))

    try {
      const availability = await getChatSupportAvailability()

      if (!isCurrentRequest(requestId)) {
        return
      }

      markBrowserOnline()
      setState({
        availability,
        isLoading: false,
      })
    } catch (error) {
      if (!isCurrentRequest(requestId)) {
        return
      }

      if (await handleUnauthorizedChatError(error)) {
        if (isCurrentRequest(requestId)) {
          setState((currentState) => ({
            ...currentState,
            isLoading: false,
          }))
        }
        return
      }

      handleConnectionUnavailableError(error)

      if (!isCurrentRequest(requestId)) {
        return
      }

      setState((currentState) => ({
        ...currentState,
        isLoading: false,
      }))
    }
  }, [
    handleConnectionUnavailableError,
    handleUnauthorizedChatError,
    isCurrentRequest,
    markBrowserOnline,
  ])

  useEffect(() => {
    if (!isBrowserOnline) {
      return
    }

    void loadSupportAvailability()
    const intervalId = window.setInterval(() => {
      void loadSupportAvailability()
    }, SUPPORT_AVAILABILITY_POLL_MS)

    return () => {
      window.clearInterval(intervalId)
      requestSequenceRef.current += 1
    }
  }, [isBrowserOnline, loadSupportAvailability])

  return {
    loadSupportAvailability,
    state,
  }
}
```

- [ ] **Step 4: Run hook tests**

Run:

```bash
pnpm --dir frontend test -- src/features/chat/pages/useChatSupportAvailability.test.tsx
```

Expected: PASS.

---

### Task 7: Header status UI wiring

**Files:**

- Modify: `frontend/src/features/chat/components/ChatHeader.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.tsx`
- Test: `frontend/src/features/chat/pages/ChatPage.test.tsx`

- [ ] **Step 1: Add failing ChatPage header status test**

In `frontend/src/features/chat/pages/ChatPage.test.tsx`, update `privateThread.subtitle` to `Вы и поддержка` and add a default support availability fetch response to the test setup that boots chat.

Add this helper near other helpers:

```ts
function createSupportAvailabilityResponse(
  currentStatus: 'offline' | 'online' | 'outside_hours' | 'unknown' = 'online',
) {
  return createJsonResponse({
    agentStatus: {
      busyAgentCount: 0,
      onlineAgentCount: currentStatus === 'online' ? 1 : 0,
      totalAgentCount: 1,
    },
    currentStatus,
    outOfOfficeMessage: null,
    reason: 'none',
    result: 'ready',
    workingHours: {
      enabled: false,
      isWithinWorkingHours: null,
      rows: [],
      timezone: 'UTC',
    },
  })
}
```

Add test:

```tsx
it('renders real support availability instead of connection readiness', async () => {
  fetchMock.mockImplementation(async (input) => {
    const url = String(input)

    if (url === '/api/auth/me') {
      return createAuthenticatedUserResponse()
    }

    if (url === '/api/tenant') {
      return createTenantResponse()
    }

    if (url === '/api/chat/threads') {
      return createJsonResponse(createThreadsResponse())
    }

    if (url === '/api/chat/messages?threadId=private%3Ame') {
      return createJsonResponse(createReadySnapshot())
    }

    if (url === '/api/chat/support-availability') {
      return createSupportAvailabilityResponse('outside_hours')
    }

    return createJsonResponse({}, 404)
  })

  renderChatRoute()

  await waitFor(() => {
    expect(
      screen.getByRole('heading', { name: 'Личный чат' }),
    ).toBeInTheDocument()
  }, CHAT_PAGE_LOAD_TIMEOUT)

  expect(screen.getByText('Вы и поддержка')).toBeInTheDocument()
  expect(
    screen.getByRole('status', { name: 'Вне графика' }),
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('status', { name: 'Онлайн' }),
  ).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run failing ChatPage test**

Run:

```bash
pnpm --dir frontend test -- src/features/chat/pages/ChatPage.test.tsx
```

Expected: FAIL because `ChatHeader` still derives `Онлайн` from `isReady`.

- [ ] **Step 3: Wire support hook into ChatPage**

Modify `frontend/src/features/chat/pages/ChatPage.tsx`:

1. Import hook:

```ts
import { useChatSupportAvailability } from './useChatSupportAvailability'
```

2. Create hook after browser connection state handlers are available:

```ts
const supportAvailability = useChatSupportAvailability({
  handleConnectionUnavailableError,
  handleUnauthorizedChatError,
  isBrowserOnline,
  isMountedRef,
  markBrowserOnline,
})
```

3. Pass state to header:

```tsx
      <ChatHeader
        activeThread={headerThread}
        supportAvailability={supportAvailability.state.availability}
        ...
      />
```

Remove `isReady={isReady}` from `ChatHeader` props.

- [ ] **Step 4: Update ChatHeader props and rendering**

Modify `frontend/src/features/chat/components/ChatHeader.tsx`:

1. Replace type import:

```ts
import type {
  ChatSupportAvailabilityResponse,
  ChatThreadSummary,
} from '../types'
import { getSupportAvailabilityPresentation } from '../lib/chatSupportAvailability'
```

2. Replace prop:

```ts
supportAvailability: ChatSupportAvailabilityResponse | null
```

3. Remove `isReady` from destructuring.

4. Replace presence label:

```ts
const supportPresence = getSupportAvailabilityPresentation(supportAvailability)
```

5. Replace dot/status classes:

```tsx
            <span
              aria-hidden="true"
              className={cn(
                'h-1.5 w-1.5 shrink-0 rounded-full',
                supportPresence.tone === 'online'
                  ? 'bg-[#46a266] shadow-[0_0_0_2px_rgb(70_162_102_/_0.14)]'
                  : supportPresence.tone === 'later'
                    ? 'bg-[#d6932c] shadow-[0_0_0_2px_rgb(214_147_44_/_0.14)]'
                    : 'bg-slate-400 shadow-[0_0_0_2px_rgb(148_163_184_/_0.16)]',
              )}
            />
            <span
              aria-label={supportPresence.label}
              className={cn(
                'shrink-0 font-normal',
                supportPresence.tone === 'online'
                  ? 'text-[#3f8a57]'
                  : supportPresence.tone === 'later'
                    ? 'text-[#a76712]'
                    : 'text-slate-500',
              )}
              role="status"
              title={supportPresence.label}
            >
              {supportPresence.label}
            </span>
```

- [ ] **Step 5: Update tests that mock chat boot fetches**

Any frontend test that boots `ChatPage` and has strict `fetchMock` call counts must account for `GET /api/chat/support-availability`.

Use this default response where tests do not care about the label:

```ts
if (url === '/api/chat/support-availability') {
  return createSupportAvailabilityResponse('online')
}
```

For sequential `mockResolvedValueOnce` tests, insert the support availability response after initial chat messages are loaded.

- [ ] **Step 6: Run targeted frontend page tests**

Run:

```bash
pnpm --dir frontend test -- src/features/chat/pages/ChatPage.test.tsx src/features/chat/pages/ChatPage.runtime.test.tsx src/features/chat/pages/ChatPage.search.test.tsx src/features/chat/pages/ChatPage.media.test.tsx
```

Expected: PASS.

---

### Task 8: Working hours in ChatInfoPage

**Files:**

- Modify: `frontend/src/features/chat/components/ChatInfoPage.tsx`
- Modify: `frontend/src/features/chat/pages/ChatAuxiliaryPages.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.tsx`
- Test: `frontend/src/features/chat/components/ChatInfoPage.test.tsx`
- Test: `frontend/src/features/chat/pages/useChatInfoPanel.test.tsx`

- [ ] **Step 1: Add failing ChatInfoPage tests**

In `frontend/src/features/chat/components/ChatInfoPage.test.tsx`, update private copy to `Вы и поддержка`.

Add helper:

```ts
const supportAvailability = {
  agentStatus: {
    busyAgentCount: 0,
    onlineAgentCount: 0,
    totalAgentCount: 1,
  },
  currentStatus: 'outside_hours',
  outOfOfficeMessage: 'Ответим в рабочее время.',
  reason: 'none',
  result: 'ready',
  workingHours: {
    enabled: true,
    isWithinWorkingHours: false,
    rows: [
      {
        closeTime: '18:00',
        dayOfWeek: 1,
        isClosedAllDay: false,
        isOpenAllDay: false,
        openTime: '09:00',
      },
      {
        closeTime: '18:00',
        dayOfWeek: 2,
        isClosedAllDay: false,
        isOpenAllDay: false,
        openTime: '09:00',
      },
      {
        closeTime: null,
        dayOfWeek: 6,
        isClosedAllDay: true,
        isOpenAllDay: false,
        openTime: null,
      },
    ],
    timezone: 'Europe/Samara',
  },
} satisfies ChatSupportAvailabilityResponse
```

Add test:

```tsx
it('renders working hours and out-of-office state', () => {
  render(
    <ChatInfoPage
      info={privateInfo}
      isLoading={false}
      onBack={vi.fn()}
      onRetry={vi.fn()}
      supportAvailability={supportAvailability}
    />,
  )

  expect(screen.getByText('Часы работы')).toBeInTheDocument()
  expect(screen.getByText('Вне графика')).toBeInTheDocument()
  expect(screen.getByText('Пн - Вт')).toBeInTheDocument()
  expect(screen.getByText('09:00 - 18:00')).toBeInTheDocument()
  expect(screen.getByText('Сб')).toBeInTheDocument()
  expect(screen.getByText('Выходной')).toBeInTheDocument()
  expect(screen.getByText('Часовой пояс: Europe/Samara')).toBeInTheDocument()
  expect(screen.getByText('Ответим в рабочее время.')).toBeInTheDocument()
})

it('renders disabled working-hours state', () => {
  render(
    <ChatInfoPage
      info={privateInfo}
      isLoading={false}
      onBack={vi.fn()}
      onRetry={vi.fn()}
      supportAvailability={{
        ...supportAvailability,
        currentStatus: 'offline',
        outOfOfficeMessage: null,
        workingHours: {
          enabled: false,
          isWithinWorkingHours: null,
          rows: [],
          timezone: 'UTC',
        },
      }}
    />,
  )

  expect(screen.getByText('Без расписания')).toBeInTheDocument()
  expect(screen.queryByText('Ответим в рабочее время.')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run failing ChatInfoPage tests**

Run:

```bash
pnpm --dir frontend test -- src/features/chat/components/ChatInfoPage.test.tsx
```

Expected: FAIL because `ChatInfoPage` does not accept/render support availability.

- [ ] **Step 3: Update ChatInfoPage props and render section**

Modify `frontend/src/features/chat/components/ChatInfoPage.tsx`:

1. Import helpers/types:

```ts
import {
  getSupportAvailabilityPresentation,
  groupWorkingHoursRows,
} from '../lib/chatSupportAvailability'
import type {
  ChatSupportAvailabilityResponse,
  ChatThreadInfoResponse,
} from '../types'
```

2. Add prop:

```ts
supportAvailability: ChatSupportAvailabilityResponse | null
```

3. Add component below `DetailRow`:

```tsx
function WorkingHoursSection({
  supportAvailability,
}: {
  supportAvailability: ChatSupportAvailabilityResponse | null
}) {
  const presentation = getSupportAvailabilityPresentation(supportAvailability)

  if (!supportAvailability || supportAvailability.result !== 'ready') {
    return (
      <section className="mt-5 overflow-hidden rounded-lg border border-slate-200/90 bg-white">
        <div className="flex min-h-11 items-center justify-between gap-3 border-b border-slate-200/80 px-4 py-3">
          <h2 className="text-[13px] font-semibold text-slate-900">
            Часы работы
          </h2>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500">
            Проверяем
          </span>
        </div>
        <p className="px-4 py-3 text-[13px] leading-5 text-slate-500">
          Не удалось загрузить расписание поддержки.
        </p>
      </section>
    )
  }

  const groupedRows = groupWorkingHoursRows(
    supportAvailability.workingHours.rows,
  )
  const showOutOfOfficeMessage =
    supportAvailability.currentStatus === 'outside_hours' &&
    supportAvailability.outOfOfficeMessage

  return (
    <section className="mt-5 overflow-hidden rounded-lg border border-slate-200/90 bg-white">
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-slate-200/80 px-4 py-3">
        <h2 className="text-[13px] font-semibold text-slate-900">
          Часы работы
        </h2>
        <span
          className={[
            'rounded-full px-2 py-1 text-[11px] font-semibold',
            presentation.tone === 'online'
              ? 'bg-green-50 text-green-700'
              : presentation.tone === 'later'
                ? 'bg-amber-50 text-amber-700'
                : 'bg-slate-100 text-slate-500',
          ].join(' ')}
        >
          {presentation.label}
        </span>
      </div>
      <div className="px-4 py-3">
        {supportAvailability.workingHours.enabled && groupedRows.length > 0 ? (
          <dl className="space-y-2">
            {groupedRows.map((row) => (
              <div
                className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 text-[13px] leading-5"
                key={`${row.daysLabel}-${row.timeLabel}`}
              >
                <dt className="text-slate-500">{row.daysLabel}</dt>
                <dd className="font-medium text-slate-900">{row.timeLabel}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-[13px] leading-5 text-slate-500">Без расписания</p>
        )}
        <p className="mt-3 text-[12px] leading-4 text-slate-500">
          Часовой пояс: {supportAvailability.workingHours.timezone}
        </p>
        {showOutOfOfficeMessage ? (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] leading-5 text-amber-800">
            {supportAvailability.outOfOfficeMessage}
          </p>
        ) : null}
      </div>
    </section>
  )
}
```

4. Render after details card and before participants:

```tsx
<WorkingHoursSection supportAvailability={supportAvailability} />
```

- [ ] **Step 4: Pass support availability into auxiliary page**

Modify `frontend/src/features/chat/pages/ChatAuxiliaryPages.tsx`:

1. Import type:

```ts
import type {
  ChatSearchResult,
  ChatSupportAvailabilityResponse,
  ChatThreadSummary,
} from '../types'
```

2. Add prop:

```ts
supportAvailability: ChatSupportAvailabilityResponse | null
```

3. Pass into `ChatInfoPage`:

```tsx
<ChatInfoPage
  info={chatInfoPanel.state.info}
  isLoading={chatInfoPanel.state.isLoading}
  onBack={chatInfoPanel.closeChatInfo}
  onRetry={() => {
    void chatInfoPanel.retryChatInfo()
  }}
  supportAvailability={supportAvailability}
/>
```

Modify `frontend/src/features/chat/pages/ChatPage.tsx`:

```tsx
      <ChatAuxiliaryPages
        ...
        supportAvailability={supportAvailability.state.availability}
      />
```

- [ ] **Step 5: Update existing ChatInfoPage call sites/tests**

Every `ChatInfoPage` render in tests must pass:

```tsx
supportAvailability={null}
```

Where the test checks working hours, pass a concrete `supportAvailability`.

- [ ] **Step 6: Run targeted info tests**

Run:

```bash
pnpm --dir frontend test -- src/features/chat/components/ChatInfoPage.test.tsx src/features/chat/pages/useChatInfoPanel.test.tsx src/features/chat/pages/ChatPage.test.tsx
```

Expected: PASS.

---

### Task 9: Backend and frontend integration cleanup

**Files:**

- Modify any tests still failing because of `/api/chat/support-availability`.
- Modify any types/imports failing typecheck.

- [ ] **Step 1: Run backend targeted test set**

Run:

```bash
pnpm --dir backend test -- src/modules/chat-support/availability.test.ts src/modules/chat-support/service.test.ts src/modules/chat-support/routes.test.ts src/integrations/chatwoot/client.test.ts src/modules/chat-threads/info.test.ts src/modules/chat-threads/routes.test.ts src/modules/chat-threads/service.info.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run frontend targeted test set**

Run:

```bash
pnpm --dir frontend test -- src/features/chat/lib/chatSupportAvailability.test.ts src/features/chat/pages/useChatSupportAvailability.test.tsx src/features/chat/components/ChatInfoPage.test.tsx src/features/chat/pages/ChatPage.test.tsx src/features/chat/pages/ChatPage.runtime.test.tsx src/features/chat/pages/ChatPage.search.test.tsx src/features/chat/pages/ChatPage.media.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run typecheck/build**

Run:

```bash
pnpm --dir backend build
pnpm --dir frontend typecheck
pnpm --dir frontend build
```

Expected: all PASS.

---

### Task 10: Playwright smoke coverage

**Files:**

- Modify: `tests/e2e/chat-read-model.spec.ts`

- [ ] **Step 1: Add support availability route helper**

In `tests/e2e/chat-read-model.spec.ts`, update `privateThread.subtitle` to `Вы и поддержка`.

Add helper near `routeStoppedRealtime`:

```ts
async function routeSupportAvailability(
  page: Page,
  {
    currentStatus = 'online',
  }: {
    currentStatus?: 'offline' | 'online' | 'outside_hours' | 'unknown'
  } = {},
) {
  await page.route('**/api/chat/support-availability', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        agentStatus: {
          busyAgentCount: 0,
          onlineAgentCount: currentStatus === 'online' ? 1 : 0,
          totalAgentCount: 1,
        },
        currentStatus,
        outOfOfficeMessage:
          currentStatus === 'outside_hours' ? 'Ответим в рабочее время.' : null,
        reason: 'none',
        result: 'ready',
        workingHours: {
          enabled: true,
          isWithinWorkingHours: currentStatus !== 'outside_hours',
          rows: [
            {
              closeTime: '18:00',
              dayOfWeek: 1,
              isClosedAllDay: false,
              isOpenAllDay: false,
              openTime: '09:00',
            },
            {
              closeTime: '18:00',
              dayOfWeek: 2,
              isClosedAllDay: false,
              isOpenAllDay: false,
              openTime: '09:00',
            },
            {
              closeTime: null,
              dayOfWeek: 6,
              isClosedAllDay: true,
              isOpenAllDay: false,
              openTime: null,
            },
          ],
          timezone: 'Europe/Samara',
        },
      }),
      contentType: 'application/json',
      status: 200,
    })
  })
}
```

- [ ] **Step 2: Use helper in chat e2e tests**

Call `await routeSupportAvailability(page)` in chat-read-model tests that open `/app/chat`.

For the existing `opens group chat info from the chat menu and returns to the transcript` test, use:

```ts
await routeSupportAvailability(page, { currentStatus: 'outside_hours' })
```

Add assertions after the chat is visible:

```ts
await expect(page.getByRole('status', { name: 'Вне графика' })).toBeVisible()
```

Add assertions inside `infoPage`:

```ts
await expect(infoPage.getByText('Часы работы')).toBeVisible()
await expect(infoPage.getByText('Пн - Вт')).toBeVisible()
await expect(infoPage.getByText('09:00 - 18:00')).toBeVisible()
await expect(infoPage.getByText('Часовой пояс: Europe/Samara')).toBeVisible()
await expect(infoPage.getByText('Ответим в рабочее время.')).toBeVisible()
```

- [ ] **Step 3: Run Playwright smoke**

Run with the local portal services already started:

```bash
pnpm test:e2e -- chat-read-model.spec.ts
```

Expected: PASS.

If local services are not running, start/restart the portal services according to repository rules, then rerun the command. Do not restart Chatwoot core unless a separate explicit reason exists.

---

### Task 11: Code review, fixes, and final checks

**Files:**

- Review all changed files.
- Modify files only for findings discovered in this task.

- [ ] **Step 1: Run focused code review**

Review for these specific risks:

- browser cannot call Chatwoot directly;
- endpoint is authenticated;
- tenant Chatwoot config is used from request context;
- unknown Chatwoot agent statuses fail closed;
- working-hours computation uses inbox timezone;
- `outside_hours` wins over agent online;
- header no longer uses `isReady` as support presence;
- old private copy is gone from runtime code/tests under `backend/src`, `frontend/src`, `tests`;
- polling interval is cleaned up on unmount and stale responses are ignored.

- [ ] **Step 2: Fix review findings**

For each finding, write or update the smallest targeted test first, then change code. Run the exact test file after each fix.

- [ ] **Step 3: Run required checks**

Run:

```bash
pnpm --dir backend test -- src/modules/chat-support/availability.test.ts src/modules/chat-support/service.test.ts src/modules/chat-support/routes.test.ts src/integrations/chatwoot/client.test.ts src/modules/chat-threads/info.test.ts src/modules/chat-threads/routes.test.ts src/modules/chat-threads/service.info.test.ts
pnpm --dir frontend test -- src/features/chat/lib/chatSupportAvailability.test.ts src/features/chat/pages/useChatSupportAvailability.test.tsx src/features/chat/components/ChatInfoPage.test.tsx src/features/chat/pages/ChatPage.test.tsx src/features/chat/pages/ChatPage.runtime.test.tsx src/features/chat/pages/ChatPage.search.test.tsx src/features/chat/pages/ChatPage.media.test.tsx
pnpm --dir backend build
pnpm --dir frontend typecheck
pnpm --dir frontend build
pnpm test:e2e -- chat-read-model.spec.ts
git diff --check
```

Expected: all PASS.

- [ ] **Step 4: Update work-log after green closure**

Only after implementation, review, fixes and checks are complete, update `docs/roadmap/work-log.md`:

- add one short completed baseline bullet under `Chat Thread Planning` for support availability and working hours;
- replace `Recommended Next Step` with the next chat-menu slice, likely `Отключить уведомления`, unless the user chooses a different next step.

Do not list test counts, commands, smoke details or minor fixes in work-log.

- [ ] **Step 5: Final checkpoint commit**

Run:

```bash
git status --short
git add backend/src frontend/src tests/e2e docs/roadmap/work-log.md
git diff --cached --check
git commit -m "feat: show chat support availability"
```

Expected: commit contains only current feature files and no `.env`, generated outputs, reports, `dist`, `node_modules`, `playwright-report`, or `test-results`.

---

## Self-Review

- Spec coverage: covered backend authority boundary, frontend route/state boundary, no persistence migration, `A. Minimal Status`, private copy, agent availability, working hours in chat info, polling, multi-tenant constraints, error handling and tests.
- Red-flag scan: clear; all steps include concrete files, commands and snippets.
- Type consistency: backend public DTOs and frontend DTOs use the same field names: `currentStatus`, `workingHours`, `agentStatus`, `outOfOfficeMessage`, `reason`, `result`.
