# Chat Support Availability And Working Hours

## Decision

Implement support availability as portal-owned read-only chat metadata.

The approved header UI is option `A. Minimal Status`: keep the existing compact
chat header, but replace the current connection-based `Онлайн` label with real
support availability derived from Chatwoot agent presence and inbox business
hours.

Also extend `Информация о чате` with a `Часы работы` block that shows the
current support schedule for the tenant portal inbox.

## Scope

This slice includes:

- chat header support status: `На связи`, `Ответим позже`, `Вне графика`, or
  `Проверяем`;
- private chat copy change from `Только вы и поддержка` to
  `Вы и поддержка`;
- backend Chatwoot inbox metadata parsing for working hours;
- backend Chatwoot inbox member availability parsing for agents assigned to the
  configured portal inbox;
- frontend rendering in the current chat header;
- frontend rendering of working hours on the existing `Информация о чате`
  full-screen page.

The user can still send messages when support is offline or outside working
hours. This feature is informational and must not block the composer.

## Non-Goals

- no notification preferences;
- no agent profile page;
- no support center implementation;
- no tenant-admin UI for editing working hours;
- no Chatwoot core changes;
- no browser-direct Chatwoot API calls;
- no persistence migration or portal-side availability cache in the first slice.

## Source Of Truth

Chatwoot remains the source of truth for:

- portal inbox business hours;
- portal inbox timezone;
- out-of-office message;
- inbox members;
- agent `availability_status`.

The portal backend remains the only authority boundary exposed to the browser.
The browser must only call same-origin `/api` endpoints and must never receive
Chatwoot API tokens or use Chatwoot application/widget endpoints directly.

Official Chatwoot documentation describes agent availability states and business
hours/out-of-office behavior. Local Chatwoot CE `v4.13.0` source confirms the
runtime payload shape:

- `GET /api/v1/accounts/:account_id/inboxes/:portal_inbox_id` includes
  `working_hours_enabled`, `working_hours`, `timezone`, and
  `out_of_office_message`;
- `working_hours` rows include `day_of_week`, `closed_all_day`, `open_hour`,
  `open_minutes`, `close_hour`, `close_minutes`, and `open_all_day`;
- `GET /api/v1/accounts/:account_id/inbox_members/:portal_inbox_id` includes
  agent `availability_status`;
- Chatwoot CE uses `online`, `busy`, and `offline`; developer docs may describe
  `available`, so the parser should accept both `online` and `available` as
  support being available.

## Backend Contract

Add a standalone portal-owned support availability endpoint. The browser
contract is tenant/session-scoped and does not depend on a selected thread.

```text
GET /api/chat/support-availability
```

Response shape:

```ts
type ChatSupportAvailabilityResponse = {
  agentStatus: {
    busyAgentCount: number
    onlineAgentCount: number
    totalAgentCount: number
  }
  currentStatus: 'online' | 'offline' | 'outside_hours' | 'unknown'
  outOfOfficeMessage: string | null
  reason: 'none' | 'chatwoot_not_configured' | 'chatwoot_unavailable'
  result: 'ready' | 'not_ready' | 'unavailable'
  workingHours: ChatWorkingHoursInfo
}

type ChatWorkingHoursInfo = {
  enabled: boolean
  isWithinWorkingHours: boolean | null
  rows: ChatWorkingHoursRow[]
  timezone: string
}

type ChatWorkingHoursRow = {
  closeTime: string | null
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6
  isClosedAllDay: boolean
  isOpenAllDay: boolean
  openTime: string | null
}
```

`openTime` and `closeTime` use `HH:mm` in the inbox timezone. If
`working_hours_enabled` is false, return `enabled: false`,
`isWithinWorkingHours: null`, and any rows Chatwoot provides for display.

The existing `GET /api/chat/threads/:threadId/info` endpoint remains focused on
thread-specific details. The chat info page fetches support availability through
the standalone endpoint and renders both response objects in one page.

## Backend Rules

The backend must:

1. Resolve tenant from the current request host.
2. Resolve the authenticated portal user from session.
3. Use the current tenant Chatwoot runtime config, not global Chatwoot env as
   runtime authority.
4. Call Chatwoot through the backend application API only.
5. Read portal inbox metadata from the tenant configured `portalInboxId`.
6. Read inbox members only for that same portal inbox.
7. Parse agent status fail-closed: unknown statuses do not count as online.
8. Compute `isWithinWorkingHours` with the inbox timezone.
9. Return controlled portal states for Chatwoot configuration or availability
   failures.

`currentStatus` is computed as:

- `unknown`: support availability could not be loaded yet or the backend returns
  `not_ready`/`unavailable`;
- `outside_hours`: working hours are enabled and the current inbox-local time is
  outside the configured schedule;
- `online`: at least one inbox member is `online` or `available`;
- `offline`: no available inbox member is found.

Busy-only agents do not make support available for the portal header. They are
counted separately for diagnostics and future UI, but the first UI slice only
needs the user-facing status.

## Frontend Header UI

The header keeps the approved minimal layout:

```text
Личный чат
Вы и поддержка · На связи
```

Labels:

- `На связи`: green dot, at least one available agent and not outside hours;
- `Ответим позже`: amber dot, no available agents during working hours or when
  no working hours are configured;
- `Вне графика`: amber dot, working hours are enabled and currently closed;
- `Проверяем`: neutral dot, initial loading or controlled unknown state.

This label replaces the current connection-derived `Онлайн`. Browser
connection readiness remains handled by existing runtime alerts/composer state
and should not be presented as support presence.

The header should poll or refresh support availability while the chat is open.
Use a modest interval around Chatwoot presence TTL, for example 25-30 seconds,
and clean up the interval on unmount. Stale responses must not overwrite a
newer state after tenant/session/chat lifecycle changes.

## Chat Info Working Hours UI

Extend the existing `Информация о чате` page with a read-only `Часы работы`
section below the main details card.

The section shows:

- current status badge using the same availability decision as the header;
- compact grouped schedule rows, for example `Пн - Пт 09:00 - 17:00` and
  `Сб - Вс Выходной`;
- timezone, for example `Часовой пояс: Europe/Samara`;
- optional out-of-office message when Chatwoot provides a non-empty value and
  the inbox is currently outside working hours.

If working hours are disabled, show `Без расписания` and do not imply that
support is always online. Agent availability still controls the header label.

If support availability cannot be loaded but chat info can be loaded, the page
still renders the normal chat details and shows a compact unavailable state
inside `Часы работы`, with retry routed through the existing page retry action
or the support-availability hook.

## Existing Chat Info Copy Change

Change the private chat subtitle/access copy to:

```text
Вы и поддержка
```

This applies to:

- thread list/private summary subtitle;
- chat header subtitle for private chat;
- `Информация о чате` access row for private chat;
- affected test fixtures.

Group chat copy stays unchanged unless a test fixture depends on the old
private text.

## Multi-Tenant And Security Requirements

- Availability is tenant-scoped by the current request host and session.
- The backend must use the tenant `chatwoot_base_url`, `chatwoot_account_id`,
  `chatwoot_portal_inbox_id`, and encrypted runtime token.
- Browser responses must not include Chatwoot agent IDs unless they are needed
  for a user-facing feature; this slice only needs counts.
- Cross-tenant inbox metadata or agent availability must never be merged.
- Chatwoot failures should not break sending messages or browsing chat history.

## Error Handling

- Initial frontend state: `Проверяем`.
- Backend configuration missing: return controlled `not_ready`; frontend shows
  `Проверяем` in the header and a compact unavailable state in chat info.
- Chatwoot unavailable: return controlled `unavailable`, frontend shows
  `Проверяем` in the header and a compact retry/error state in chat info.
- Invalid working-hours rows: ignore invalid rows for schedule display and do
  not count them as open.
- Invalid timezone: fallback to `UTC` for computation and display a controlled
  fallback timezone value.

## Tests

Backend:

- parse Chatwoot inbox business-hours payload, including closed all day and
  open all day;
- compute within/outside working hours in the inbox timezone;
- parse inbox member statuses with `online` and `available` as available,
  `busy` and `offline` as not available, and unknown statuses fail-closed;
- return `outside_hours` before `online` when business hours are closed;
- preserve tenant runtime config and authenticated session boundary;
- return controlled unavailable/not-ready states on Chatwoot failures.

Frontend:

- header renders `Проверяем`, `На связи`, `Ответим позже`, and `Вне графика`;
- header no longer uses `isReady` as support presence;
- private chat copy renders `Вы и поддержка`;
- chat info page renders grouped working hours and timezone;
- chat info hides out-of-office text when blank;
- stale availability responses cannot overwrite the latest state.

Browser/runtime:

- Playwright smoke opens chat and confirms the header status is shown without
  browser-direct Chatwoot requests;
- Playwright opens `Информация о чате` and confirms the `Часы работы` block is
  visible for a configured tenant.

Required checks:

- backend targeted tests for Chatwoot client parsing and availability service;
- frontend targeted component/hook tests;
- frontend typecheck/build;
- targeted Playwright e2e or a documented readiness blocker;
- `git diff --check`.
