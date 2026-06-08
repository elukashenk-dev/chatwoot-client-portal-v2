# MT-9H Real Portal Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current hand-made admin branding preview cards with a high-fidelity, read-only copy of the customer portal screens: login, chat, chat info, settings and notification settings.

**Architecture:** Keep the admin preview backend-free and read-only. Convert the current unsaved `BrandingDraft` into a `PublicBranding`-compatible preview model, provide it through `BrandingContext`, apply the same CSS variables through `createBrandingCssProperties`, and render preview screens from real portal primitives where those primitives are presentation-safe. Do not mount full route pages that fetch customer APIs.

**Tech Stack:** React, TypeScript, Tailwind utility classes, existing portal UI primitives (`AuthShell`, `ChatTranscript`, `ChatFullScreenPanel`, notification controls), a preview-only presentational chat header, Vitest, Playwright.

---

## Current Problem

`frontend/src/features/admin-branding/components/BrandingPreviewPane.tsx` is a standalone mock. It manually renders two small cards and labels them as `Копия портала`, but it does not match the real customer portal:

- login preview does not look like the real auth page layout;
- chat preview does not use the real chat header, transcript or composer structure;
- there is no way to switch between portal screens;
- chat auxiliary pages such as `Информация о чате`, `Настройки` and `Уведомления` are absent;
- existing tests only check that edited text appears in the mock, not that the preview matches the real runtime surfaces.

## Target UX

Admin page right side becomes a real portal preview panel:

- header stays `Предпросмотр` / `Копия портала`;
- below the header there is a compact segmented control:
  - `Вход`;
  - `Чат`;
  - `Инфо`;
  - `Настройки`;
  - `Уведомления`;
- below the segmented control there is a phone-sized preview frame that visually matches the customer mobile portal;
- preview updates immediately from unsaved draft edits;
- preview uses uploaded draft asset URLs immediately after upload/replace;
- preview is read-only: no logout, send, message actions, focusable in-phone navigation buttons or customer API calls from inside the preview;
- on narrow desktop widths the right column remains usable and scrollable; the admin page still stays desktop-only as it is today.

## Non-Goals

- Do not create a live iframe of `/auth/login` or `/app/chat`; that would require real customer sessions, real customer API calls and route synchronization.
- Do not make preview controls inside the phone interactive in this slice. Screen switching is controlled by the segmented control outside the phone.
- Do not add new branding settings fields.
- Do not include profile preview in the first fix unless the user explicitly adds it later. The requested first set is login, chat and chat pages such as settings/info.

## Files

Create:

- `frontend/src/features/admin-branding/lib/previewBranding.ts`
  - converts `BrandingDraft` to `PublicBranding`;
  - creates a tenant identity context value for preview;
  - creates stable sample chat data for preview screens.
- `frontend/src/features/admin-branding/components/portal-preview/PortalPreviewFrame.tsx`
  - phone viewport, segmented control and provider wrapper.
- `frontend/src/features/admin-branding/components/portal-preview/AuthLoginPreview.tsx`
  - read-only login screen using `AuthShell` and the same auth visual classes.
- `frontend/src/features/admin-branding/components/portal-preview/ChatConversationPreview.tsx`
  - read-only chat screen using `ChatHeaderPreview`, `ChatTranscript` and static composer shell.
- `frontend/src/features/admin-branding/components/portal-preview/ChatHeaderPreview.tsx`
  - pure presentational copy of the real chat header visual structure without
    `useNavigate`, `useAuthSession`, menus, logout or focusable actions.
- `frontend/src/features/admin-branding/components/portal-preview/ChatInfoPreview.tsx`
  - chat info screen using real `ChatInfoPage` with sample data.
- `frontend/src/features/admin-branding/components/portal-preview/SettingsPreview.tsx`
  - settings screen using `ChatFullScreenPanel` and the same settings row layout.
- `frontend/src/features/admin-branding/components/portal-preview/NotificationsPreview.tsx`
  - notification settings screen using `ChatFullScreenPanel`, `NotificationCard`, `NotificationSwitch` and `NotificationActionRow` with static data.
- `frontend/src/features/admin-branding/components/portal-preview/previewData.ts`
  - sample private thread, support availability, info response, notification settings and messages.
- `frontend/src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx`
  - unit tests for screen switching, draft updates and absence of extra API calls.
- `tests/e2e/admin-branding-real-preview.spec.ts`
  - browser test for the admin preview screen selector and visual surface markers.

Modify:

- `frontend/src/features/admin-branding/components/BrandingPreviewPane.tsx`
  - replace the current manual cards with `PortalPreviewFrame`.
- `frontend/src/features/admin-shell/pages/AdminBrandingPage.tsx`
  - widen the preview column and keep preview sticky/scrollable.
- `frontend/src/features/admin-shell/pages/AdminBrandingPage.test.tsx`
  - update existing preview assertions to the new tabbed preview.
- `frontend/src/features/chat/components/ChatTranscript.tsx`
  - add an opt-in read-only mode for admin preview.
- `frontend/src/features/chat/components/chat-transcript/MessageBubble.tsx`
  - hide message action buttons, retry controls and swipe/context-menu reply behavior in read-only mode.
- `frontend/src/features/chat/components/ChatFullScreenPanel.tsx`
  - add an opt-in presentation-only back affordance for admin preview.
- `frontend/src/features/chat/components/ChatInfoPage.tsx`
  - pass the presentation-only back affordance through to `ChatFullScreenPanel`.

Do not modify backend routes for this fix.

---

## Task 1: Add Preview Branding Model And Stable Sample Data

**Files:**

- Create: `frontend/src/features/admin-branding/lib/previewBranding.ts`
- Create: `frontend/src/features/admin-branding/components/portal-preview/previewData.ts`
- Test: `frontend/src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx`

- [ ] **Step 1: Write the failing unit test for draft-to-preview branding**

Create the test file with the first test:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { BrandingDraft } from '../../lib/brandingState'
import { PortalPreviewFrame } from './PortalPreviewFrame'

const draft = {
  assets: {
    logo: {
      assetVersion: '11',
      contentType: 'image/png',
      height: null,
      id: 11,
      kind: 'logo',
      publicUrl: '/api/branding/assets/11?v=11',
      width: null,
    },
  },
  colors: {
    accent: '#14b8a6',
    authBackground: '#ecfeff',
    chatBackground: '#f8fafc',
    chatHeaderBackground: '#0f766e',
    primary: '#134e4a',
  },
  copy: {
    authSubtitle: 'Войдите в кабинет ProvGroup.',
    authTitle: 'Кабинет ProvGroup',
    chatEmptyBody: 'Напишите вопрос, мы ответим здесь.',
    chatEmptyTitle: 'Начните диалог',
    chatInfoTitle: 'О диалоге',
  },
  portalName: 'ProvGroup',
  supportLabel: 'Поддержка ProvGroup',
} satisfies BrandingDraft

describe('PortalPreviewFrame', () => {
  it('renders the login preview from the unsaved branding draft', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    render(<PortalPreviewFrame draft={draft} />)

    expect(
      screen.getByRole('tab', { name: 'Вход' }),
    ).toHaveAttribute('aria-selected', 'true')
    expect(
      screen.getByRole('heading', { name: 'Кабинет ProvGroup' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Войдите в кабинет ProvGroup.')).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: 'Логотип ProvGroup' }),
    ).toHaveAttribute('src', '/api/branding/assets/11?v=11')
    expect(fetchSpy).not.toHaveBeenCalled()

    fetchSpy.mockRestore()
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx --reporter verbose
```

Expected: fail because `PortalPreviewFrame` does not exist.

- [ ] **Step 3: Implement `previewBranding.ts`**

Create:

```ts
import type { PublicBranding } from '../../branding/api/publicBrandingClient'
import type { TenantIdentityContextValue } from '../../tenant/lib/tenantIdentityContext'
import type { BrandingDraft } from './brandingState'

export function createPreviewPublicBranding(
  draft: BrandingDraft,
): PublicBranding {
  return {
    assets: draft.assets,
    colors: draft.colors,
    copy: draft.copy,
    portalName: draft.portalName,
    supportLabel: draft.supportLabel,
    version: 1,
  }
}

export function createPreviewTenantIdentity(
  draft: BrandingDraft,
): TenantIdentityContextValue {
  return {
    errorMessage: null,
    isUsingCachedData: false,
    status: 'ready',
    tenant: {
      displayName: draft.portalName,
      primaryDomain: 'preview.portal.local',
      publicBaseUrl: 'https://preview.portal.local',
      slug: 'preview',
    },
  }
}
```

- [ ] **Step 4: Implement `previewData.ts`**

Create stable sample data:

```ts
import type {
  ChatMessage,
  ChatNotificationSettings,
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

export const previewThreads = [previewThread] satisfies ChatThreadListSummary[]

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

export const previewSupportAvailability = {
  currentStatus: 'online',
  outOfOfficeMessage: null,
  reason: 'none',
  result: 'ready',
  workingHours: {
    enabled: true,
    isWithinWorkingHours: true,
    rows: [
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
      {
        closeTime: '17:00',
        dayOfWeek: 4,
        isClosedAllDay: false,
        isOpenAllDay: false,
        openTime: '09:00',
      },
      {
        closeTime: '17:00',
        dayOfWeek: 5,
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
  supportLabel: 'Команда Бухфирма',
  threadTypeLabel: 'Личный',
} satisfies ChatThreadInfoResponse

export const previewNotificationSettings = {
  effective: {
    newMessagesEnabled: true,
    soundEnabled: true,
  },
  global: {
    newMessagesEnabled: true,
    soundEnabled: true,
  },
  overrides: {
    newMessagesEnabled: null,
    soundEnabled: null,
  },
  threadId: previewThread.id,
} satisfies ChatNotificationSettings
```

- [ ] **Step 5: Run typecheck for the new data file**

Run:

```bash
pnpm --dir frontend exec tsc --noEmit -p tsconfig.app.json
```

Expected: fail only if the sample data shape does not match current exported types. Fix type mismatches before continuing.

---

## Task 2: Build The Preview Frame And Screen Switcher

**Files:**

- Create: `frontend/src/features/admin-branding/components/portal-preview/PortalPreviewFrame.tsx`
- Modify: `frontend/src/features/admin-branding/components/BrandingPreviewPane.tsx`
- Test: `frontend/src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx`

- [ ] **Step 1: Add screen-switching test**

Append to `PortalPreviewFrame.test.tsx`:

```tsx
it('switches between portal preview screens without leaving admin preview', async () => {
  const user = userEvent.setup()
  const fetchSpy = vi.spyOn(globalThis, 'fetch')

  render(<PortalPreviewFrame draft={draft} />)

  await user.click(screen.getByRole('tab', { name: 'Чат' }))
  expect(screen.getByRole('heading', { name: 'Личный чат' })).toBeInTheDocument()

  await user.click(screen.getByRole('tab', { name: 'Инфо' }))
  expect(screen.getByRole('heading', { name: 'О диалоге' })).toBeInTheDocument()

  await user.click(screen.getByRole('tab', { name: 'Настройки' }))
  expect(screen.getByRole('heading', { name: 'Настройки' })).toBeInTheDocument()

  await user.click(screen.getByRole('tab', { name: 'Уведомления' }))
  expect(screen.getByRole('heading', { name: 'Уведомления' })).toBeInTheDocument()

  expect(fetchSpy).not.toHaveBeenCalled()
  fetchSpy.mockRestore()
})
```

Also add the missing import:

```tsx
import userEvent from '@testing-library/user-event'
```

Append a second draft-update test so the preview cannot regress into a static mock:

```tsx
it('updates all visible preview surfaces when the unsaved draft changes', async () => {
  const user = userEvent.setup()
  const updatedDraft = {
    ...draft,
    assets: {
      ...draft.assets,
      logo: {
        assetVersion: '12',
        contentType: 'image/png',
        height: null,
        id: 12,
        kind: 'logo',
        publicUrl: '/api/branding/assets/12?v=12',
        width: null,
      },
    },
    colors: {
      ...draft.colors,
      chatHeaderBackground: '#164e63',
      primary: '#0f766e',
    },
    copy: {
      ...draft.copy,
      authSubtitle: 'Используйте рабочий email.',
      authTitle: 'Вход для клиентов',
      chatInfoTitle: 'О разговоре',
    },
    portalName: 'Портал Бухфирма',
    supportLabel: 'Поддержка 24/7',
  } satisfies BrandingDraft

  const { container, rerender } = render(<PortalPreviewFrame draft={draft} />)

  rerender(<PortalPreviewFrame draft={updatedDraft} />)

  expect(
    screen.getByRole('heading', { name: 'Вход для клиентов' }),
  ).toBeInTheDocument()
  expect(screen.getByText('Используйте рабочий email.')).toBeInTheDocument()
  expect(
    screen.getByRole('img', { name: 'Логотип Портал Бухфирма' }),
  ).toHaveAttribute('src', '/api/branding/assets/12?v=12')
  expect(container.querySelector('.portal-branding-scope')).toHaveStyle({
    '--color-brand-800': '#0f766e',
    '--portal-chat-header-background-color': '#164e63',
  })

  await user.click(screen.getByRole('tab', { name: 'Инфо' }))
  expect(screen.getByRole('heading', { name: 'О разговоре' })).toBeInTheDocument()
  expect(screen.getByText('Поддержка 24/7')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx --reporter verbose
```

Expected: fail because tabs and preview screens are not implemented.

- [ ] **Step 3: Implement `PortalPreviewFrame.tsx`**

Create:

```tsx
import { useMemo, useState } from 'react'

import { BrandingContext } from '../../../branding/lib/brandingContext'
import { createBrandingCssProperties } from '../../../branding/lib/brandingCss'
import { TenantIdentityContext } from '../../../tenant/lib/tenantIdentityContext'
import type { BrandingDraft } from '../../lib/brandingState'
import {
  createPreviewPublicBranding,
  createPreviewTenantIdentity,
} from '../../lib/previewBranding'
import { AuthLoginPreview } from './AuthLoginPreview'
import { ChatConversationPreview } from './ChatConversationPreview'
import { ChatInfoPreview } from './ChatInfoPreview'
import { NotificationsPreview } from './NotificationsPreview'
import { SettingsPreview } from './SettingsPreview'

type PreviewScreen = 'auth' | 'chat' | 'info' | 'settings' | 'notifications'

type PortalPreviewFrameProps = {
  draft: BrandingDraft
}

const previewScreens = [
  { id: 'auth', label: 'Вход' },
  { id: 'chat', label: 'Чат' },
  { id: 'info', label: 'Инфо' },
  { id: 'settings', label: 'Настройки' },
  { id: 'notifications', label: 'Уведомления' },
] satisfies Array<{ id: PreviewScreen; label: string }>

export function PortalPreviewFrame({ draft }: PortalPreviewFrameProps) {
  const [activeScreen, setActiveScreen] = useState<PreviewScreen>('auth')
  const branding = useMemo(() => createPreviewPublicBranding(draft), [draft])
  const brandingValue = useMemo(
    () => ({
      branding,
      errorMessage: null,
      status: 'ready' as const,
    }),
    [branding],
  )
  const tenantIdentity = useMemo(
    () => createPreviewTenantIdentity(draft),
    [draft],
  )
  const cssProperties = useMemo(
    () => createBrandingCssProperties(branding),
    [branding],
  )

  return (
    <div className="space-y-4">
      <div
        aria-label="Экраны предпросмотра портала"
        className="grid grid-cols-2 gap-2 xl:grid-cols-5"
        role="tablist"
      >
        {previewScreens.map((screen) => (
          <button
            aria-selected={activeScreen === screen.id}
            className={[
              'min-h-9 rounded-[0.55rem] border px-2 text-[12px] font-semibold transition',
              activeScreen === screen.id
                ? 'border-brand-800 bg-brand-900 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-brand-200 hover:text-brand-900',
            ].join(' ')}
            key={screen.id}
            onClick={() => {
              setActiveScreen(screen.id)
            }}
            role="tab"
            type="button"
          >
            {screen.label}
          </button>
        ))}
      </div>

      <BrandingContext.Provider value={brandingValue}>
        <TenantIdentityContext.Provider value={tenantIdentity}>
          <div
            className="portal-branding-scope rounded-[1rem] border border-slate-200 bg-slate-100 p-3 shadow-sm"
            style={cssProperties}
          >
            <div
              aria-label="Телефонный предпросмотр портала"
              className="mx-auto h-[720px] w-full max-w-[375px] overflow-hidden rounded-[1rem] border border-slate-200 bg-white shadow-sm"
              role="region"
            >
              {activeScreen === 'auth' ? <AuthLoginPreview /> : null}
              {activeScreen === 'chat' ? <ChatConversationPreview /> : null}
              {activeScreen === 'info' ? <ChatInfoPreview /> : null}
              {activeScreen === 'settings' ? <SettingsPreview /> : null}
              {activeScreen === 'notifications' ? (
                <NotificationsPreview />
              ) : null}
            </div>
          </div>
        </TenantIdentityContext.Provider>
      </BrandingContext.Provider>
    </div>
  )
}
```

- [ ] **Step 4: Replace `BrandingPreviewPane` body**

Modify `BrandingPreviewPane.tsx` so the body becomes:

```tsx
import type { BrandingDraft } from '../lib/brandingState'
import { PortalPreviewFrame } from './portal-preview/PortalPreviewFrame'

type BrandingPreviewPaneProps = {
  draft: BrandingDraft
}

export function BrandingPreviewPane({ draft }: BrandingPreviewPaneProps) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-normal text-brand-700">
          Предпросмотр
        </p>
        <h2 className="mt-2 text-xl font-semibold">Копия портала</h2>
      </div>

      <PortalPreviewFrame draft={draft} />
    </div>
  )
}
```

- [ ] **Step 5: Run the preview test**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx --reporter verbose
```

Expected: the login test may pass after Task 3, while screen tests still fail until screen components are created in later tasks.

---

## Task 3: Implement High-Fidelity Login Preview

**Files:**

- Create: `frontend/src/features/admin-branding/components/portal-preview/AuthLoginPreview.tsx`
- Test: `frontend/src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx`

- [ ] **Step 1: Add login-specific assertions**

Extend the first test:

```tsx
expect(screen.getByPlaceholderText('name@company.ru')).toBeInTheDocument()
expect(screen.getByPlaceholderText('Введите пароль')).toBeInTheDocument()
expect(screen.getByRole('button', { name: 'Войти' })).toBeDisabled()
expect(screen.getByText('Забыли пароль?')).toBeInTheDocument()
expect(screen.getByText('Создать аккаунт')).toBeInTheDocument()
expect(screen.getByText('Нет доступа к чату?')).toBeInTheDocument()
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx --reporter verbose
```

Expected: fail because `AuthLoginPreview` is not implemented.

- [ ] **Step 3: Implement `AuthLoginPreview.tsx`**

Create:

```tsx
import { MailIcon, LockIcon, PhoneIcon } from '../../../../shared/ui/icons'
import { AuthShell } from '../../../../shared/ui/AuthShell'
import { useBranding } from '../../../branding/lib/useBranding'
import { createTenantMonogram } from '../../../tenant/lib/tenantIdentityMetadata'

export function AuthLoginPreview() {
  const { branding } = useBranding()
  const monogram = createTenantMonogram(branding.portalName)

  return (
    <div className="h-full overflow-y-auto">
      <AuthShell
        brandLogoUrl={branding.assets.logo?.publicUrl}
        brandMonogram={monogram}
        brandName={branding.portalName}
        description={branding.copy.authSubtitle}
        footerImageUrl={branding.assets.auth_footer_image?.publicUrl}
        headerImageUrl={branding.assets.auth_header_image?.publicUrl}
        title={branding.copy.authTitle}
      >
        <form className="space-y-3" aria-label="Форма входа предпросмотра">
          <label className="flex min-h-14 items-center gap-3 rounded-[0.6rem] border border-slate-200 bg-white px-4 text-slate-500">
            <MailIcon className="h-5 w-5 shrink-0 text-slate-500" />
            <input
              aria-label="Email"
              className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-slate-400"
              disabled
              placeholder="name@company.ru"
              type="email"
            />
          </label>
          <label className="flex min-h-14 items-center gap-3 rounded-[0.6rem] border border-slate-200 bg-white px-4 text-slate-500">
            <LockIcon className="h-5 w-5 shrink-0 text-slate-500" />
            <input
              aria-label="Пароль"
              className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-slate-400"
              disabled
              placeholder="Введите пароль"
              type="password"
            />
          </label>
          <button
            className="min-h-14 w-full rounded-[0.7rem] bg-brand-900 text-[16px] font-semibold text-white shadow-sm disabled:opacity-100"
            disabled
            type="button"
          >
            Войти
          </button>
        </form>

        <div className="mt-4 flex items-center justify-between gap-4 text-[13px] text-brand-700">
          <span>Забыли пароль?</span>
          <span>Создать аккаунт</span>
        </div>

        <div className="mt-auto pt-6">
          <aside className="flex items-center gap-3 rounded-[0.6rem] bg-slate-100/80 px-3.5 py-3 text-[13px] leading-5 shadow-sm">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200/80 text-brand-800">
              <PhoneIcon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-slate-800">
                Нет доступа к чату?
              </p>
              <p className="whitespace-nowrap text-slate-500">
                Поддержка: +7 (906) 12-955-12
              </p>
            </div>
          </aside>
        </div>
      </AuthShell>
    </div>
  )
}
```

- [ ] **Step 4: Run the preview test**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx --reporter verbose
```

Expected: login assertions pass.

---

## Task 4: Implement High-Fidelity Chat Preview

**Files:**

- Create: `frontend/src/features/admin-branding/components/portal-preview/ChatHeaderPreview.tsx`
- Create: `frontend/src/features/admin-branding/components/portal-preview/ChatConversationPreview.tsx`
- Modify: `frontend/src/features/chat/components/ChatTranscript.tsx`
- Modify: `frontend/src/features/chat/components/chat-transcript/MessageBubble.tsx`
- Test: `frontend/src/features/chat/components/ChatTranscript.test.tsx`
- Test: `frontend/src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx`

- [ ] **Step 1: Add chat preview assertions**

Append:

```tsx
it('renders the chat preview using portal chat primitives', async () => {
  const user = userEvent.setup()

  render(<PortalPreviewFrame draft={draft} />)
  await user.click(screen.getByRole('tab', { name: 'Чат' }))

  expect(screen.getByRole('heading', { name: 'Личный чат' })).toBeInTheDocument()
  expect(screen.getByText('Вы и поддержка')).toBeInTheDocument()
  expect(screen.getByText('Здравствуйте, вижу ваше обращение.')).toBeInTheDocument()
  expect(screen.getByText('И снова здравствуйте')).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Открыть меню чата' }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Открыть навигацию' }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: /^Действия с сообщением/ }),
  ).not.toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: 'Сообщение' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Отправить' })).toBeDisabled()
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx --reporter verbose
```

Expected: fail because `ChatConversationPreview`, `ChatHeaderPreview` and transcript read-only mode are not implemented.

- [ ] **Step 3: Add read-only mode to transcript primitives**

In `ChatTranscript.tsx`:

- add optional prop `isReadOnly?: boolean`;
- default it to `false`;
- pass it to every `MessageBubble`;
- keep current runtime behavior unchanged when the prop is omitted.

In `chat-transcript/MessageBubble.tsx`:

- add optional prop `isReadOnly?: boolean`;
- set `canReplyToMessage` to `!isReadOnly && !isLocalTextSend(message)`;
- render `RetryTextSend` only when `!isReadOnly`;
- return early from swipe pointer handlers when `canReplyToMessage` is false;
- let the existing action button and context-menu paths disappear because `canReplyToMessage` is false.

This preserves the real bubble layout while making the admin preview a presentation-only transcript.

Add focused tests in `ChatTranscript.test.tsx`:

- default runtime transcript still exposes message action controls and can call `onReplyToMessage`;
- `isReadOnly` transcript does not render `Действия с сообщением ...` or `Повторить` controls and does not call `onReplyToMessage` from swipe/click paths.

- [ ] **Step 4: Implement `ChatHeaderPreview.tsx`**

Create:

```tsx
import {
  MenuIcon,
  MoreHorizontalIcon,
} from '../../../../shared/ui/icons'
import { ChatAvatar } from '../../../chat/components/ChatAvatar'
import { ChatHeaderPresence } from '../../../chat/components/ChatHeaderPresence'
import { createTenantMonogram } from '../../../tenant/lib/tenantIdentityMetadata'
import { useBranding } from '../../../branding/lib/useBranding'
import { previewThread } from './previewData'

export function ChatHeaderPreview() {
  const { branding } = useBranding()
  const monogram = createTenantMonogram(branding.portalName)

  return (
    <header className="app-safe-top chat-header-background relative z-30 border-b border-slate-200/40 px-4 pb-2.5 text-[color:var(--portal-chat-header-foreground,#0f172a)] shadow-sm">
      <div className="flex min-h-10 items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-flex h-10 w-10 items-center justify-center rounded-chat-control text-[color:var(--portal-chat-header-muted-foreground,#475569)]"
        >
          <MenuIcon className="h-6 w-6" />
        </span>

        <ChatAvatar
          alt={previewThread.title}
          avatarUrl={previewThread.avatarUrl ?? branding.assets.logo?.publicUrl}
          className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[0.85rem] bg-brand-900 text-sm font-semibold tracking-wide text-white"
          title={previewThread.title}
        >
          {monogram}
        </ChatAvatar>

        <div className="min-w-0 flex-1 py-0.5">
          <h1 className="truncate text-[16px] font-semibold leading-tight text-[color:var(--portal-chat-header-foreground,#0f172a)]">
            {previewThread.title}
          </h1>
          <ChatHeaderPresence
            label="На связи"
            subtitle={previewThread.subtitle}
            tone="online"
          />
        </div>

        <span
          aria-hidden="true"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[color:var(--portal-chat-header-muted-foreground,#64748b)]"
        >
          <MoreHorizontalIcon className="h-5 w-5" />
        </span>
      </div>
    </header>
  )
}
```

This file intentionally does not import `useNavigate`, `useAuthSession`, `ChatMenuItem`, or any admin/customer API client.

- [ ] **Step 5: Implement `ChatConversationPreview.tsx`**

Create:

```tsx
import {
  MicrophoneIcon,
  PaperclipIcon,
  SendIcon,
} from '../../../../shared/ui/icons'
import { ChatTranscript } from '../../../chat/components/ChatTranscript'
import { ChatHeaderPreview } from './ChatHeaderPreview'
import { previewMessages } from './previewData'

export function ChatConversationPreview() {
  return (
    <section className="app-runtime-background relative flex h-full min-h-0 flex-col overflow-hidden bg-white text-slate-900">
      <ChatHeaderPreview />

      <div className="portal-shell flex min-h-0 flex-1 flex-col">
        <ChatTranscript
          activeThreadType="private"
          hasMoreOlder={false}
          historyErrorMessage={null}
          isReadOnly
          isConnectionAvailable
          isLoadingOlder={false}
          messages={previewMessages}
          onLoadOlder={() => {}}
          onReplyToMessage={() => {}}
          onRetryTextMessage={() => {}}
        />

        <div className="border-t border-slate-200/80 bg-white px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              aria-label="Отправить файл"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-brand-900"
              disabled
              type="button"
            >
              <PaperclipIcon className="h-5 w-5" />
            </button>
            <textarea
              aria-label="Сообщение"
              className="min-h-10 flex-1 resize-none rounded-[0.7rem] bg-transparent px-2 py-2 text-[14px] outline-none placeholder:text-slate-400"
              disabled
              placeholder="Сообщение..."
              rows={1}
            />
            <button
              aria-label="Голосовое сообщение"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-brand-900"
              disabled
              type="button"
            >
              <MicrophoneIcon className="h-5 w-5" />
            </button>
            <button
              aria-label="Отправить"
              className="inline-flex h-12 w-12 items-center justify-center rounded-[0.85rem] bg-brand-100 text-brand-700"
              disabled
              type="button"
            >
              <SendIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 6: Run the preview test**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx src/features/chat/components/ChatTranscript.test.tsx --reporter verbose
```

Expected: chat assertions pass.

---

## Task 5: Implement Chat Info Preview

**Files:**

- Create: `frontend/src/features/admin-branding/components/portal-preview/ChatInfoPreview.tsx`
- Modify: `frontend/src/features/chat/components/ChatFullScreenPanel.tsx`
- Modify: `frontend/src/features/chat/components/ChatInfoPage.tsx`
- Test: `frontend/src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx`

- [ ] **Step 1: Add chat info assertions**

Append:

```tsx
it('renders the chat info preview with branded title and support label', async () => {
  const user = userEvent.setup()

  render(<PortalPreviewFrame draft={draft} />)
  await user.click(screen.getByRole('tab', { name: 'Инфо' }))

  expect(screen.getByRole('heading', { name: 'О диалоге' })).toBeInTheDocument()
  expect(screen.getByText('Личный чат')).toBeInTheDocument()
  expect(screen.getByText('Поддержка ProvGroup')).toBeInTheDocument()
  expect(screen.getByText('Часы работы')).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Вернуться к чату' }),
  ).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Add presentation-only back affordance to full-screen panels**

In `ChatFullScreenPanel.tsx`:

- add optional prop `isBackActionReadOnly?: boolean`;
- default it to `false`;
- when `false`, keep the current real back `<button>` unchanged;
- when `true`, render a visually identical `<span aria-hidden="true">` with the chevron icon and no `onClick`, no `type`, no role and no focusability.

In `ChatInfoPage.tsx`:

- add optional prop `isBackActionReadOnly?: boolean`;
- pass it through to `ChatFullScreenPanel`.

Add/extend focused tests for `ChatFullScreenPanel` or `ChatInfoPage` so default runtime still renders the back button, while read-only mode renders no `Вернуться к чату` button.

- [ ] **Step 3: Implement `ChatInfoPreview.tsx`**

Create:

```tsx
import { useMemo } from 'react'

import { ChatInfoPage } from '../../../chat/components/ChatInfoPage'
import { useBranding } from '../../../branding/lib/useBranding'
import { previewSupportAvailability, previewThreadInfo } from './previewData'

export function ChatInfoPreview() {
  const { branding } = useBranding()
  const info = useMemo(
    () => ({
      ...previewThreadInfo,
      supportLabel: branding.supportLabel,
    }),
    [branding.supportLabel],
  )

  return (
    <div className="relative h-full overflow-hidden">
      <ChatInfoPage
        info={info}
        isBackActionReadOnly
        isLoading={false}
        isSupportAvailabilityLoading={false}
        onBack={() => {}}
        onRetry={() => {}}
        supportAvailability={previewSupportAvailability}
      />
    </div>
  )
}
```

- [ ] **Step 4: Run the preview test**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx src/features/chat/components/ChatFullScreenPanel.test.tsx src/features/chat/components/ChatInfoPage.test.tsx --reporter verbose
```

Expected: info assertions pass.

---

## Task 6: Implement Settings And Notifications Previews

**Files:**

- Create: `frontend/src/features/admin-branding/components/portal-preview/SettingsPreview.tsx`
- Create: `frontend/src/features/admin-branding/components/portal-preview/NotificationsPreview.tsx`
- Modify: `frontend/src/features/chat/components/ChatFullScreenPanel.tsx`
- Test: `frontend/src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx`

- [ ] **Step 1: Add settings and notifications assertions**

Append:

```tsx
it('renders settings and notification settings previews', async () => {
  const user = userEvent.setup()

  render(<PortalPreviewFrame draft={draft} />)

  await user.click(screen.getByRole('tab', { name: 'Настройки' }))
  expect(screen.getByRole('heading', { name: 'Настройки' })).toBeInTheDocument()
  expect(screen.getByText('Уведомления')).toBeInTheDocument()
  expect(screen.getByText('Сообщения, звук и push на этом устройстве')).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Вернуться к чату' }),
  ).not.toBeInTheDocument()

  await user.click(screen.getByRole('tab', { name: 'Уведомления' }))
  expect(screen.getByRole('heading', { name: 'Уведомления' })).toBeInTheDocument()
  expect(screen.getByText('Уведомления о новых сообщениях')).toBeInTheDocument()
  expect(screen.getByText('Push на этом устройстве')).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Вернуться к чату' }),
  ).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Implement `SettingsPreview.tsx`**

Create:

```tsx
import { BellIcon } from '../../../../shared/ui/icons'
import { ChatFullScreenPanel } from '../../../chat/components/ChatFullScreenPanel'

export function SettingsPreview() {
  return (
    <div className="relative h-full overflow-hidden">
      <ChatFullScreenPanel
        isBackActionReadOnly
        isLoading={false}
        onBack={() => {}}
        onRetry={() => {}}
        title="Настройки"
      >
        <div className="mx-auto max-w-md">
          <button
            className="flex min-h-14 w-full items-center gap-3 rounded-lg border border-slate-200/90 bg-white px-4 py-3 text-left text-slate-900"
            disabled
            type="button"
          >
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-800">
              <BellIcon className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-semibold leading-5">
                Уведомления
              </span>
              <span className="mt-0.5 block text-[12px] leading-4 text-slate-500">
                Сообщения, звук и push на этом устройстве
              </span>
            </span>
          </button>
        </div>
      </ChatFullScreenPanel>
    </div>
  )
}
```

- [ ] **Step 3: Implement `NotificationsPreview.tsx`**

Create:

```tsx
import { ChatFullScreenPanel } from '../../../chat/components/ChatFullScreenPanel'
import {
  NotificationActionRow,
  NotificationCard,
  NotificationSwitch,
} from '../../../chat/components/NotificationSettingsControls'

export function NotificationsPreview() {
  return (
    <div className="relative h-full overflow-hidden">
      <ChatFullScreenPanel
        isBackActionReadOnly
        isLoading={false}
        onBack={() => {}}
        onRetry={() => {}}
        title="Уведомления"
      >
        <div className="mx-auto max-w-md">
          <NotificationCard>
            <NotificationSwitch
              checked
              disabled
              label="Уведомления о новых сообщениях"
              onChange={() => {}}
            />
            <NotificationSwitch
              checked
              disabled
              label="Звук"
              onChange={() => {}}
            />
          </NotificationCard>

          <div className="mt-4">
            <NotificationCard>
              <NotificationActionRow
                actionLabel="Подключить"
                description="Push не подключен"
                disabled
                label="Push на этом устройстве"
                onAction={() => {}}
              />
            </NotificationCard>
          </div>
        </div>
      </ChatFullScreenPanel>
    </div>
  )
}
```

- [ ] **Step 4: Run the preview test**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx --reporter verbose
```

Expected: all preview-frame tests pass.

---

## Task 7: Update Admin Layout And Existing Admin Tests

**Files:**

- Modify: `frontend/src/features/admin-shell/pages/AdminBrandingPage.tsx`
- Modify: `frontend/src/features/admin-shell/pages/AdminBrandingPage.test.tsx`

- [ ] **Step 1: Update admin preview column width**

In `AdminBrandingPage.tsx`, change the desktop grid from:

```tsx
<section className="hidden min-h-full grid-cols-[15rem_minmax(0,1fr)_22rem] lg:grid">
```

to:

```tsx
<section className="hidden min-h-full grid-cols-[15rem_minmax(0,1fr)_minmax(25rem,28rem)] xl:grid-cols-[15rem_minmax(36rem,1fr)_30rem] lg:grid">
```

Change the preview aside from:

```tsx
<aside className="border-l border-slate-200 bg-white px-5 py-6">
```

to:

```tsx
<aside className="max-h-screen overflow-y-auto border-l border-slate-200 bg-white px-3 py-6 xl:px-5">
```

This keeps the 375px mobile preview readable without forcing the admin grid to overflow at the `lg` breakpoint. Verify the page at 1024px, 1280px and 1440px wide: the editor column must remain usable, the preview must stay scrollable, and the browser must not get a horizontal scrollbar.

- [ ] **Step 2: Update existing admin page assertions**

In `AdminBrandingPage.test.tsx`, replace the old preview checks:

```tsx
expect(
  screen.getAllByRole('heading', { name: 'Бухфирма' })[0],
).toBeInTheDocument()
```

with:

```tsx
expect(screen.getByRole('heading', { name: 'Копия портала' })).toBeInTheDocument()
expect(screen.getByRole('tab', { name: 'Вход' })).toHaveAttribute('aria-selected', 'true')
expect(screen.getByRole('heading', { name: 'Вход в личный кабинет' })).toBeInTheDocument()
```

In the `updates preview while editing portal name` test, assert the login preview logo/name instead of a generic card heading:

```tsx
expect(screen.getByText('Портал Бухфирма')).toBeInTheDocument()
```

Also update `tests/e2e/admin-branding-settings.spec.ts`, because it currently asserts the old mock preview:

- replace the `Продолжить` button color assertion with the real disabled login submit button `Войти`;
- keep the immediate draft checks for edited portal name, support label, auth title and auth subtitle;
- after editing `chatHeaderBackground`, switch to the `Чат` preview tab and assert the real chat heading `Личный чат` plus the chat header background color;
- after editing the support label, switch to `Инфо` and assert the updated support label is visible there.

- [ ] **Step 3: Run admin branding unit tests**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/admin-shell/pages/AdminBrandingPage.test.tsx src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx --reporter verbose
```

Expected: both files pass.

---

## Task 8: Add Playwright Coverage For The Real Preview

**Files:**

- Create: `tests/e2e/admin-branding-real-preview.spec.ts`

- [ ] **Step 1: Create e2e spec**

Create a test modeled after `tests/e2e/admin-branding-settings.spec.ts`:

```ts
import { expect, type Page, test } from '@playwright/test'

const adminEmail = 'cbr@provgroup.com'

const brandingResponse = {
  branding: {
    assets: {
      logo: {
        assetVersion: '77',
        contentType: 'image/png',
        height: null,
        id: 77,
        kind: 'logo',
        publicUrl: '/api/branding/assets/77?v=77',
        width: null,
      },
    },
    colors: {
      accent: '#14b8a6',
      authBackground: '#ecfeff',
      chatBackground: '#f8fafc',
      chatHeaderBackground: '#0f766e',
      primary: '#134e4a',
    },
    copy: {
      authSubtitle: 'Войдите в кабинет ProvGroup.',
      authTitle: 'Кабинет ProvGroup',
      chatEmptyBody: 'Напишите вопрос, мы ответим здесь.',
      chatEmptyTitle: 'Начните диалог',
      chatInfoTitle: 'О диалоге',
    },
    portalName: 'ProvGroup',
    supportLabel: 'Поддержка ProvGroup',
    version: 3,
  },
} as const

async function mockAdminPreviewRoutes(page: Page) {
  let publicBrandingRequestCount = 0

  await page.route('**/api/tenant', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        tenant: {
          displayName: 'Бухфирма',
          primaryDomain: 'buhfirma.127.0.0.1.nip.io',
          publicBaseUrl: 'http://buhfirma.127.0.0.1.nip.io:5173',
          slug: 'buhfirma',
        },
      },
      status: 200,
    })
  })
  await page.route('**/api/admin/auth/me', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        admin: {
          chatwootAgentId: 11,
          email: adminEmail,
          role: 'administrator',
        },
        session: {
          expiresAt: '2026-06-10T10:00:00.000Z',
        },
      },
      status: 200,
    })
  })
  await page.route('**/api/admin/branding', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: brandingResponse,
      status: 200,
    })
  })
  await page.route('**/api/branding', async (route) => {
    publicBrandingRequestCount += 1
    await route.fulfill({
      contentType: 'application/json',
      json: brandingResponse,
      status: 200,
    })
  })
  await page.route('**/api/branding/assets/**', async (route) => {
    await route.fulfill({
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGSc9h4NwAAAABJRU5ErkJggg==',
        'base64',
      ),
      contentType: 'image/png',
      status: 200,
    })
  })

  return {
    getPublicBrandingRequestCount: () => publicBrandingRequestCount,
  }
}

async function failIfPreviewCallsCustomerApis(page: Page) {
  const disallowedRequests: string[] = []

  for (const pattern of ['**/api/auth/**', '**/api/chat/**']) {
    await page.route(pattern, async (route) => {
      disallowedRequests.push(route.request().url())
      await route.abort()
    })
  }

  return disallowedRequests
}

test('admin preview switches between real portal screens', async ({ page }) => {
  const disallowedRequests = await failIfPreviewCallsCustomerApis(page)
  const routeState = await mockAdminPreviewRoutes(page)

  await page.goto('/admin/branding')

  await expect(page.getByRole('heading', { name: 'Копия портала' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Кабинет ProvGroup' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Логотип ProvGroup' })).toHaveAttribute(
    'src',
    '/api/branding/assets/77?v=77',
  )
  await page.waitForLoadState('networkidle')
  const publicBrandingCountAfterLoad =
    routeState.getPublicBrandingRequestCount()

  await page.getByRole('tab', { name: 'Чат' }).click()
  await expect(page.getByRole('heading', { name: 'Личный чат' })).toBeVisible()
  await expect(page.getByText('Вы и поддержка')).toBeVisible()
  await expect(page.getByText('И снова здравствуйте')).toBeVisible()

  await page.getByRole('tab', { name: 'Инфо' }).click()
  await expect(page.getByRole('heading', { name: 'О диалоге' })).toBeVisible()
  await expect(page.getByText('Поддержка ProvGroup')).toBeVisible()
  await expect(page.getByText('Часы работы')).toBeVisible()

  await page.getByRole('tab', { name: 'Настройки' }).click()
  await expect(page.getByRole('heading', { name: 'Настройки' })).toBeVisible()
  await expect(page.getByText('Сообщения, звук и push на этом устройстве')).toBeVisible()

  await page.getByRole('tab', { name: 'Уведомления' }).click()
  await expect(page.getByRole('heading', { name: 'Уведомления' })).toBeVisible()
  await expect(page.getByText('Push на этом устройстве')).toBeVisible()

  await expect(page).toHaveURL(/\/admin\/branding/)
  expect(disallowedRequests).toEqual([])
  expect(routeState.getPublicBrandingRequestCount()).toBe(
    publicBrandingCountAfterLoad,
  )
})

test('admin real preview layout does not overflow desktop widths', async ({
  page,
}) => {
  await failIfPreviewCallsCustomerApis(page)
  await mockAdminPreviewRoutes(page)

  for (const width of [1024, 1280, 1440]) {
    await page.setViewportSize({ height: 900, width })
    await page.goto('/admin/branding')

    await expect(
      page.getByRole('heading', { name: 'Копия портала' }),
    ).toBeVisible()
    await expect(
      page.getByRole('tablist', { name: 'Экраны предпросмотра портала' }),
    ).toBeVisible()
    await expect(
      page.getByRole('region', { name: 'Телефонный предпросмотр портала' }),
    ).toBeVisible()
    const hasNoHorizontalOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    )

    expect(hasNoHorizontalOverflow).toBe(true)
  }
})
```

- [ ] **Step 2: Run Playwright spec**

Run:

```bash
PLAYWRIGHT_BASE_URL=http://buhfirma.127.0.0.1.nip.io:5173 pnpm test:e2e -- tests/e2e/admin-branding-real-preview.spec.ts
```

Expected: 2 chromium tests pass.

---

## Task 9: Verification, Review And Docs

**Files:**

- Modify only if implementation changes stable baseline:
  - `docs/roadmap/work-log.md`
  - `docs/architecture/overview.md`
  - `docs/roadmap/implementation-plan.md`

- [ ] **Step 1: Run focused unit tests**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx src/features/admin-shell/pages/AdminBrandingPage.test.tsx src/features/chat/components/ChatTranscript.test.tsx src/features/chat/components/ChatFullScreenPanel.test.tsx src/features/chat/components/ChatInfoPage.test.tsx --reporter verbose
```

Expected: all tests pass.

- [ ] **Step 2: Run existing admin branding e2e tests**

Run:

```bash
PLAYWRIGHT_BASE_URL=http://buhfirma.127.0.0.1.nip.io:5173 pnpm test:e2e -- tests/e2e/admin-branding-settings.spec.ts tests/e2e/admin-branding-assets.spec.ts tests/e2e/admin-branding-real-preview.spec.ts
```

Expected: all selected Playwright tests pass.

- [ ] **Step 3: Run full verification**

Run:

```bash
pnpm lint
pnpm --dir frontend exec tsc --noEmit -p tsconfig.app.json
pnpm build
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 4: Independent code review**

Ask a read-only reviewer to check:

- preview is truly read-only and does not call customer APIs;
- transcript read-only mode does not change normal chat runtime behavior;
- no direct Chatwoot authority or object-storage keys are exposed;
- preview screens are high-fidelity enough against actual portal primitives;
- right admin column remains usable at desktop widths;
- tests protect switching, draft updates and major visual markers.

Fix Critical/Important findings before closure.

- [ ] **Step 5: Update docs only if this becomes MT-9H closure**

If this fix is the only remaining MT-9H item, update:

- `docs/roadmap/work-log.md`:
  - mark final branding preview QA fix closed;
  - set next step to production deploy/readiness if still pending, or next roadmap item if branding is fully closed.
- `docs/roadmap/implementation-plan.md`:
  - mark admin preview parity as closed inside MT-9H.
- `docs/architecture/overview.md`:
  - add one short line that admin preview uses read-only portal primitives and draft branding context.

If MT-9H still has separate deploy/manual QA work after this fix, do not mark all MT-9H closed.

- [ ] **Step 6: Checkpoint commit**

After review and verification:

```bash
git status --short --branch
git add frontend/src tests/e2e docs/roadmap docs/architecture docs/superpowers/plans/2026-06-08-mt-9h-real-portal-preview.md
git commit -m "fix: show real portal screens in branding preview"
```

Expected: one scope-only commit. Do not push remote until the user approves branding completion.

---

## Acceptance Criteria

- Admin branding preview no longer shows the old two-card mock.
- Preview has screen selector for `Вход`, `Чат`, `Инфо`, `Настройки`, `Уведомления`.
- `Вход` preview looks like the real mobile auth page and uses draft title, subtitle, logo and auth images.
- `Чат` preview looks like the real mobile chat surface and uses draft chat background, chat header background, logo, support label and sample messages.
- `Инфо` preview uses the real chat info panel layout and draft `chatInfoTitle`.
- `Настройки` preview shows the chat full-screen settings page shape.
- `Уведомления` preview shows notification switches/action row in the chat full-screen panel shape.
- Unsaved draft text/color edits update the preview immediately.
- Upload/replace/delete asset refreshes are reflected in preview through draft assets.
- Chat preview hides runtime-only message action controls and uses disabled composer controls.
- Internal preview pages render back affordances as non-focusable presentation, not real navigation buttons.
- Preview switching does not call `/api/auth/*`, `/api/chat/*`, additional `/api/branding`, Chatwoot URLs, or object storage URLs directly.
- Existing admin branding save/upload flows continue to pass.
- Playwright covers screen switching in `/admin/branding`.
