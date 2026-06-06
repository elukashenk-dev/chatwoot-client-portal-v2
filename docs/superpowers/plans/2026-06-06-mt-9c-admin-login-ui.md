# MT-9C Admin Login UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a separate tenant-admin email-code login UI, isolated admin session boundary, and protected `/admin/branding` console shell.

**Architecture:** Keep browser authority inside the portal backend: admin UI talks only to `/api/admin/auth/*`, stores no admin session in offline/browser storage, and never receives Chatwoot tokens. Move customer auth provider from global app scope into the customer route subtree so `/admin` is guarded by a separate admin session provider. `/admin/branding` is only a disabled shell that reflects the accepted future branding groups; it does not save branding settings.

**Tech Stack:** React 19, React Router 7, TypeScript, Vite, Tailwind utility classes, Testing Library/Vitest, Playwright route-mocked e2e, existing Fastify backend endpoints from `MT-9B`.

---

## Source Specs

Read before implementation:

- `AGENTS.md`
- `docs/superpowers/specs/2026-06-06-mt-9c-admin-login-ui-design.md`
- `docs/design/portal-ui-ux-baseline.md`
- `docs/roadmap/work-log.md`
- `docs/architecture/overview.md`
- `docs/architecture/decisions.md`

Current branch:

```bash
git status --short --branch
```

Expected before code work:

```text
## feature/phase-9-admin-login-ui
```

Commit policy:

- Do not create WIP commits by default.
- Use checkpoint commit only after implementation, review, fixes, targeted checks, required tests, and clean status.
- Do not stage `.env`, `dist`, `node_modules`, `playwright-report`, `test-results`, `.playwright-mcp`, screenshots or traces.

## File Structure

Create:

- `frontend/src/shared/ui/OtpInputGroup.tsx` - generic 6-digit OTP input moved to shared UI.
- `frontend/src/features/admin-auth/api/adminAuthClient.ts` - typed client for `/api/admin/auth/*`.
- `frontend/src/features/admin-auth/api/adminAuthClient.test.ts` - API client tests.
- `frontend/src/features/admin-auth/lib/adminSessionContext.ts` - admin session context and types.
- `frontend/src/features/admin-auth/lib/AdminSessionProvider.tsx` - online-only admin session provider.
- `frontend/src/features/admin-auth/lib/AdminSessionProvider.test.tsx` - provider behavior tests.
- `frontend/src/features/admin-auth/components/AdminEmailStep.tsx` - admin email request form.
- `frontend/src/features/admin-auth/components/AdminCodeStep.tsx` - admin OTP verification form.
- `frontend/src/features/admin-auth/pages/AdminLoginPage.tsx` - `/admin/login` page.
- `frontend/src/features/admin-auth/pages/AdminLoginPage.test.tsx` - login flow component tests.
- `frontend/src/features/admin-shell/pages/AdminBrandingPage.tsx` - `/admin/branding` shell page.
- `frontend/src/features/admin-shell/pages/AdminBrandingPage.test.tsx` - shell page tests.
- `frontend/src/app/layouts/CustomerAuthBoundary.tsx` - wraps customer routes with `AuthSessionProvider`.
- `frontend/src/app/layouts/AdminSessionBoundary.tsx` - wraps admin routes with `AdminSessionProvider`.
- `frontend/src/app/layouts/AdminPublicRoute.tsx` - redirects authenticated admin away from login.
- `frontend/src/app/layouts/AdminProtectedRoute.tsx` - protects `/admin/*`.
- `frontend/src/app/AppRoutes.admin.test.tsx` - route/session separation tests.
- `playwright.admin-ui.config.ts` - route-mocked admin UI Playwright config without backend global setup.
- `tests/e2e/admin-login-ui.spec.ts` - route-mocked browser login/logout flow.

Modify:

- `frontend/src/features/auth/components/OtpInputGroup.tsx` - replace with a re-export from shared UI.
- `frontend/src/features/auth/components/OtpVerificationFormLayout.tsx` - keep behavior, import remains through local re-export or direct shared import.
- `frontend/src/app/App.tsx` - remove global `AuthSessionProvider`.
- `frontend/src/app/AppRoutes.tsx` - add admin routes and wrap customer routes with `CustomerAuthBoundary`.
- `frontend/src/app/routePaths.ts` - add admin paths.
- `frontend/src/app/AppRoutes.profile.test.tsx` - update customer route test after moving customer auth boundary into routes.
- `frontend/src/features/auth/pages/LoginPage.test.tsx` - remove external `AuthSessionProvider` around `AppRoutes`.
- `frontend/src/features/auth/pages/RequestPages.test.tsx` - remove external `AuthSessionProvider` around `AppRoutes`.
- `frontend/src/test/chatPageTestHarness.tsx` - remove external `AuthSessionProvider` around `AppRoutes`.
- Chat route tests that directly wrap `AppRoutes` with `AuthSessionProvider`, found by `rg -n "<AuthSessionProvider>|AuthSessionContext.Provider|<AppRoutes" frontend/src -S`.
- `docs/roadmap/work-log.md` - update after implementation and verification because `MT-9C` changes stable product/runtime baseline.

Do not modify:

- backend routes/services from `MT-9B`;
- Chatwoot core;
- branding persistence/schema/assets.

---

## Task 1: Promote OTP Input To Shared UI

**Files:**

- Create: `frontend/src/shared/ui/OtpInputGroup.tsx`
- Modify: `frontend/src/features/auth/components/OtpInputGroup.tsx`
- Test: existing auth request/verify page tests

- [ ] **Step 1: Move the generic OTP component to shared UI**

Create `frontend/src/shared/ui/OtpInputGroup.tsx` by moving the current content from `frontend/src/features/auth/components/OtpInputGroup.tsx`.

The only import-path change inside the moved file is:

```ts
import { cn } from '../lib/cn'
```

Keep these public props unchanged:

```ts
type OtpInputGroupProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'type' | 'value'
> & {
  onChange: (value: string) => void
  value: string
}
```

Keep labels unchanged because e2e tests depend on them:

```ts
aria-label={
  index === 0 ? ariaLabel : `Код из письма, цифра ${index + 1}`
}
```

- [ ] **Step 2: Leave a compatibility re-export for existing auth imports**

Replace `frontend/src/features/auth/components/OtpInputGroup.tsx` with:

```ts
export { OtpInputGroup } from '../../../shared/ui/OtpInputGroup'
```

- [ ] **Step 3: Run existing OTP/auth page tests**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/auth/pages/RequestPages.test.tsx --reporter verbose
```

Expected:

```text
Test Files  1 passed
```

---

## Task 2: Add Admin Auth API Client

**Files:**

- Create: `frontend/src/features/admin-auth/api/adminAuthClient.ts`
- Create: `frontend/src/features/admin-auth/api/adminAuthClient.test.ts`

- [ ] **Step 1: Write failing API client tests**

Create `frontend/src/features/admin-auth/api/adminAuthClient.test.ts`.

Cover these cases:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  AdminApiClientError,
  getCurrentAdminSession,
  logoutAdmin,
  requestAdminLoginCode,
  verifyAdminLoginCode,
} from './adminAuthClient'

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  })
}

describe('adminAuthClient', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it('requests an admin login code with credentials', async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        delivery: 'sent',
        email: 'admin@example.test',
        expiresInSeconds: 900,
        nextStep: 'verify_code',
        purpose: 'tenant_admin_login',
        resendAvailableInSeconds: 60,
        result: 'admin_login_challenge_requested',
      }),
    )

    const response = await requestAdminLoginCode({
      email: 'Admin@Example.Test',
    })

    expect(response.email).toBe('admin@example.test')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/auth/request',
      expect.objectContaining({
        body: JSON.stringify({ email: 'Admin@Example.Test' }),
        credentials: 'include',
        method: 'POST',
      }),
    )
  })

  it('verifies an admin code and returns admin session', async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        admin: {
          chatwootAgentId: 11,
          email: 'admin@example.test',
          role: 'administrator',
        },
        session: {
          expiresAt: '2026-06-07T00:00:00.000Z',
        },
      }),
    )

    const response = await verifyAdminLoginCode({
      code: '123456',
      email: 'admin@example.test',
    })

    expect(response.admin.email).toBe('admin@example.test')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/auth/verify',
      expect.objectContaining({
        body: JSON.stringify({
          code: '123456',
          email: 'admin@example.test',
        }),
        credentials: 'include',
        method: 'POST',
      }),
    )
  })

  it('returns null for missing admin session', async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(
        {
          error: {
            code: 'TENANT_ADMIN_UNAUTHORIZED',
            message: 'Требуется вход администратора.',
          },
        },
        401,
      ),
    )

    await expect(getCurrentAdminSession()).resolves.toBeNull()
  })

  it('logs out through admin logout endpoint', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))

    await logoutAdmin()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/auth/logout',
      expect.objectContaining({
        credentials: 'include',
        method: 'POST',
      }),
    )
  })

  it('throws backend controlled messages for errors', async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(
        {
          error: {
            code: 'TENANT_ADMIN_NOT_ELIGIBLE',
            message: 'Нет прав администратора для этого портала.',
          },
        },
        403,
      ),
    )

    await expect(
      requestAdminLoginCode({ email: 'agent@example.test' }),
    ).rejects.toMatchObject<Partial<AdminApiClientError>>({
      code: 'TENANT_ADMIN_NOT_ELIGIBLE',
      message: 'Нет прав администратора для этого портала.',
      statusCode: 403,
    })
  })
})
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/admin-auth/api/adminAuthClient.test.ts --reporter verbose
```

Expected before implementation:

```text
FAIL src/features/admin-auth/api/adminAuthClient.test.ts
Cannot find module './adminAuthClient'
```

- [ ] **Step 3: Implement the admin auth client**

Create `frontend/src/features/admin-auth/api/adminAuthClient.ts`.

Use these exported types:

```ts
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'
const NETWORK_ERROR_MESSAGE =
  'Мы не смогли выполнить запрос. Попробуйте еще раз чуть позже.'

export type PublicTenantAdmin = {
  chatwootAgentId: number
  email: string
  role: 'administrator'
}

export type AdminLoginRequestResponse = {
  delivery: 'sent' | 'existing_pending'
  email: string
  expiresInSeconds: number
  nextStep: 'verify_code'
  purpose: 'tenant_admin_login'
  resendAvailableInSeconds: number
  result: 'admin_login_challenge_requested'
}

export type AdminSessionResponse = {
  admin: PublicTenantAdmin
  session: {
    expiresAt: string
  }
}
```

Use this request/error shape:

```ts
type ApiErrorResponse = {
  error?: {
    code?: string
    message?: string
  }
}

type AdminRequestOptions = {
  signal?: AbortSignal
}

export class AdminApiClientError extends Error {
  readonly code?: string
  readonly statusCode: number

  constructor({
    code,
    message,
    statusCode,
  }: {
    code?: string
    message: string
    statusCode: number
  }) {
    super(message)
    this.name = 'AdminApiClientError'
    this.code = code
    this.statusCode = statusCode
  }
}
```

Implement these functions:

```ts
export async function getCurrentAdminSession({
  signal,
}: AdminRequestOptions = {}) {
  try {
    return await request<AdminSessionResponse>('/admin/auth/me', {
      method: 'GET',
      signal,
    })
  } catch (error) {
    if (error instanceof AdminApiClientError && error.statusCode === 401) {
      return null
    }

    throw error
  }
}

export async function requestAdminLoginCode({ email }: { email: string }) {
  return request<AdminLoginRequestResponse>('/admin/auth/request', {
    body: JSON.stringify({ email }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })
}

export async function verifyAdminLoginCode({
  code,
  email,
}: {
  code: string
  email: string
}) {
  return request<AdminSessionResponse>('/admin/auth/verify', {
    body: JSON.stringify({ code, email }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })
}

export async function logoutAdmin() {
  await request<void>('/admin/auth/logout', {
    method: 'POST',
  })
}
```

The private `request<TResponse>()` must:

- call `fetch(`${API_BASE_URL}${path}`, { credentials: 'include', ...init })`;
- return `undefined as TResponse` for `204`;
- parse JSON only when `content-type` includes `application/json`;
- throw `AdminApiClientError` with backend `error.code` and `error.message`;
- throw `AdminApiClientError` with `statusCode: 0` on network failures.

- [ ] **Step 4: Run API client tests**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/admin-auth/api/adminAuthClient.test.ts --reporter verbose
```

Expected:

```text
Test Files  1 passed
```

---

## Task 3: Add Isolated Admin Session Provider

**Files:**

- Create: `frontend/src/features/admin-auth/lib/adminSessionContext.ts`
- Create: `frontend/src/features/admin-auth/lib/AdminSessionProvider.tsx`
- Create: `frontend/src/features/admin-auth/lib/AdminSessionProvider.test.tsx`

- [ ] **Step 1: Write provider tests**

Create `frontend/src/features/admin-auth/lib/AdminSessionProvider.test.tsx`.

Cover:

- initial `GET /api/admin/auth/me` success sets authenticated state;
- `401` sets unauthenticated state;
- network/server error sets error state and retry calls `/me` again;
- `setVerifiedSession()` sets authenticated state without localStorage/IndexedDB;
- `signOut()` calls `/api/admin/auth/logout` and clears state.

Test harness:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AdminSessionProvider } from './AdminSessionProvider'
import { useAdminSession } from './adminSessionContext'

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  })
}

function createAdminSessionResponse() {
  return createJsonResponse({
    admin: {
      chatwootAgentId: 11,
      email: 'admin@example.test',
      role: 'administrator',
    },
    session: {
      expiresAt: '2026-06-07T00:00:00.000Z',
    },
  })
}

function Harness() {
  const {
    admin,
    errorMessage,
    refreshSession,
    setVerifiedSession,
    signOut,
    status,
  } = useAdminSession()

  return (
    <div>
      <div data-testid="status">{status}</div>
      <div data-testid="admin-email">{admin?.email ?? 'none'}</div>
      <div data-testid="error">{errorMessage ?? 'none'}</div>
      <button onClick={() => void refreshSession()} type="button">
        refresh
      </button>
      <button
        onClick={() =>
          setVerifiedSession({
            admin: {
              chatwootAgentId: 12,
              email: 'verified@example.test',
              role: 'administrator',
            },
            session: {
              expiresAt: '2026-06-07T00:00:00.000Z',
            },
          })
        }
        type="button"
      >
        set verified
      </button>
      <button onClick={() => void signOut()} type="button">
        sign out
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Run the failing provider test**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/admin-auth/lib/AdminSessionProvider.test.tsx --reporter verbose
```

Expected before implementation:

```text
FAIL src/features/admin-auth/lib/AdminSessionProvider.test.tsx
Cannot find module './AdminSessionProvider'
```

- [ ] **Step 3: Implement admin session context**

Create `frontend/src/features/admin-auth/lib/adminSessionContext.ts`.

Use this public contract:

```ts
import { createContext, useContext } from 'react'

import type {
  AdminSessionResponse,
  PublicTenantAdmin,
} from '../api/adminAuthClient'

export type AdminSessionStatus =
  | 'checking'
  | 'unauthenticated'
  | 'authenticated'
  | 'error'

export type AdminSessionContextValue = {
  admin: PublicTenantAdmin | null
  errorMessage: string | null
  refreshSession: () => Promise<void>
  setVerifiedSession: (session: AdminSessionResponse) => void
  signOut: () => Promise<void>
  status: AdminSessionStatus
}

export const AdminSessionContext =
  createContext<AdminSessionContextValue | null>(null)

export function useAdminSession() {
  const context = useContext(AdminSessionContext)

  if (!context) {
    throw new Error('useAdminSession must be used inside AdminSessionProvider')
  }

  return context
}
```

- [ ] **Step 4: Implement provider**

Create `frontend/src/features/admin-auth/lib/AdminSessionProvider.tsx`.

Required behavior:

- status starts as `checking`;
- `getCurrentAdminSession()` success sets `authenticated`;
- `getCurrentAdminSession()` returning `null` sets `unauthenticated`;
- network/backend error sets `error` with backend/network message;
- no localStorage, IndexedDB, startup cache, service worker cache;
- cleanup prevents setState after unmount;
- `signOut()` calls `logoutAdmin()` and clears local admin state.

Implementation shape:

```tsx
import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  getCurrentAdminSession,
  logoutAdmin,
  type AdminSessionResponse,
  type PublicTenantAdmin,
} from '../api/adminAuthClient'
import {
  AdminSessionContext,
  type AdminSessionContextValue,
  type AdminSessionStatus,
} from './adminSessionContext'

type AdminSessionProviderProps = {
  children: ReactNode
}

export function AdminSessionProvider({ children }: AdminSessionProviderProps) {
  const isMountedRef = useRef(false)
  const [admin, setAdmin] = useState<PublicTenantAdmin | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [status, setStatus] = useState<AdminSessionStatus>('checking')

  const refreshSession = useCallback(async () => {
    setErrorMessage(null)
    setStatus('checking')

    try {
      const session = await getCurrentAdminSession()

      if (!isMountedRef.current) {
        return
      }

      if (!session) {
        setAdmin(null)
        setStatus('unauthenticated')
        return
      }

      setAdmin(session.admin)
      setStatus('authenticated')
    } catch (error) {
      if (!isMountedRef.current) {
        return
      }

      setAdmin(null)
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Не удалось проверить вход администратора.',
      )
      setStatus('error')
    }
  }, [])

  const setVerifiedSession = useCallback((session: AdminSessionResponse) => {
    setErrorMessage(null)
    setAdmin(session.admin)
    setStatus('authenticated')
  }, [])

  const signOut = useCallback(async () => {
    setErrorMessage(null)

    try {
      await logoutAdmin()

      if (!isMountedRef.current) {
        return
      }

      setAdmin(null)
      setStatus('unauthenticated')
    } catch (error) {
      if (!isMountedRef.current) {
        return
      }

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Не удалось выйти из админ-консоли.',
      )
      throw error
    }
  }, [])

  useEffect(() => {
    isMountedRef.current = true
    void refreshSession()

    return () => {
      isMountedRef.current = false
    }
  }, [refreshSession])

  const value = useMemo<AdminSessionContextValue>(
    () => ({
      admin,
      errorMessage,
      refreshSession,
      setVerifiedSession,
      signOut,
      status,
    }),
    [admin, errorMessage, refreshSession, setVerifiedSession, signOut, status],
  )

  return (
    <AdminSessionContext.Provider value={value}>
      {children}
    </AdminSessionContext.Provider>
  )
}
```

- [ ] **Step 5: Run provider tests**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/admin-auth/lib/AdminSessionProvider.test.tsx --reporter verbose
```

Expected:

```text
Test Files  1 passed
```

---

## Task 4: Build Admin Login Page And Forms

**Files:**

- Create: `frontend/src/features/admin-auth/components/AdminEmailStep.tsx`
- Create: `frontend/src/features/admin-auth/components/AdminCodeStep.tsx`
- Create: `frontend/src/features/admin-auth/pages/AdminLoginPage.tsx`
- Create: `frontend/src/features/admin-auth/pages/AdminLoginPage.test.tsx`

- [ ] **Step 1: Write login page tests**

Create `frontend/src/features/admin-auth/pages/AdminLoginPage.test.tsx`.

Cover:

- renders `Вход в админ-консоль`;
- validates bad email before submit;
- calls `/api/admin/auth/request`;
- switches to `Подтвердите вход`;
- fills six OTP cells and calls `/api/admin/auth/verify`;
- redirects to `/admin/branding`;
- enables resend after `resendAvailableInSeconds` and sends another request;
- handles `existing_pending` as code step with info;
- handles `TENANT_ADMIN_DELIVERY_IN_PROGRESS` without switching to code step.

Use route harness:

```tsx
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Route, Routes } from 'react-router-dom'

import { renderWithRouter } from '../../../test/renderWithRouter'
import {
  AdminSessionContext,
  type AdminSessionContextValue,
} from '../lib/adminSessionContext'
import { AdminLoginPage } from './AdminLoginPage'

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  })
}

function createAdminRequestResponse(
  delivery: 'sent' | 'existing_pending' = 'sent',
) {
  return createJsonResponse({
    delivery,
    email: 'admin@example.test',
    expiresInSeconds: 900,
    nextStep: 'verify_code',
    purpose: 'tenant_admin_login',
    resendAvailableInSeconds: 60,
    result: 'admin_login_challenge_requested',
  })
}

function createAdminSessionResponse() {
  return createJsonResponse({
    admin: {
      chatwootAgentId: 11,
      email: 'admin@example.test',
      role: 'administrator',
    },
    session: {
      expiresAt: '2026-06-07T00:00:00.000Z',
    },
  })
}

function renderAdminLoginRoute() {
  const adminSession = {
    admin: null,
    errorMessage: null,
    refreshSession: vi.fn(),
    setVerifiedSession: vi.fn(),
    signOut: vi.fn(),
    status: 'unauthenticated',
  } satisfies AdminSessionContextValue

  renderWithRouter(
    <AdminSessionContext.Provider value={adminSession}>
      <Routes>
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin/branding" element={<h1>Брендинг</h1>} />
      </Routes>
    </AdminSessionContext.Provider>,
    { initialEntries: ['/admin/login'] },
  )

  return adminSession
}
```

Add helper for OTP:

```ts
async function fillOtpCode(
  user: ReturnType<typeof userEvent.setup>,
  code: string,
) {
  for (const [index, digit] of Array.from(code).entries()) {
    const label =
      index === 0 ? 'Код из письма' : `Код из письма, цифра ${index + 1}`

    await user.type(screen.getByLabelText(label), digit)
  }
}
```

For the resend test, use fake timers so the cooldown requirement is explicit:

```ts
vi.useFakeTimers()
const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

// request response has resendAvailableInSeconds: 60
expect(screen.getByRole('button', { name: /Повторить через/ })).toBeDisabled()

await vi.advanceTimersByTimeAsync(60_000)

expect(
  screen.getByRole('button', { name: 'Отправить код повторно' }),
).not.toBeDisabled()

await user.click(screen.getByRole('button', { name: 'Отправить код повторно' }))

expect(fetchMock).toHaveBeenCalledWith(
  '/api/admin/auth/request',
  expect.objectContaining({
    body: JSON.stringify({ email: 'admin@example.test' }),
    credentials: 'include',
    method: 'POST',
  }),
)
```

- [ ] **Step 2: Run failing login page test**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/admin-auth/pages/AdminLoginPage.test.tsx --reporter verbose
```

Expected before implementation:

```text
FAIL src/features/admin-auth/pages/AdminLoginPage.test.tsx
Cannot find module './AdminLoginPage'
```

- [ ] **Step 3: Implement `AdminEmailStep`**

Create `frontend/src/features/admin-auth/components/AdminEmailStep.tsx`.

Public props:

```ts
type AdminEmailStepProps = {
  email: string
  errorMessage: string | null
  isSubmitting: boolean
  onEmailChange: (email: string) => void
  onSubmit: () => void
}
```

UI requirements:

- `TextField` with label `Email администратора`;
- `PrimaryButton` label `Получить код`, loading label `Отправка...`;
- local errors:
  - empty: `Введите email`;
  - invalid: `Проверьте формат email`;
- backend error via `InlineAlert`;
- no customer login links.

- [ ] **Step 4: Implement `AdminCodeStep`**

Create `frontend/src/features/admin-auth/components/AdminCodeStep.tsx`.

Public props:

```ts
type AdminCodeStepProps = {
  code: string
  email: string
  errorMessage: string | null
  infoMessage: string | null
  isResending: boolean
  isSubmitting: boolean
  onBackToEmail: () => void
  onCodeChange: (code: string) => void
  onResend: () => void
  onSubmit: () => void
  resendAvailableInSeconds: number
}
```

UI requirements:

- heading remains controlled by page shell: `Подтвердите вход`;
- use `OtpInputGroup` from `frontend/src/shared/ui/OtpInputGroup.tsx`;
- helper text includes selected admin email;
- button label `Войти в админ-консоль`;
- resend button disabled while `resendAvailableInSeconds > 0`;
- back button label `Изменить email`;
- backend error via `InlineAlert`;
- info state via `InlineAlert` tone `info` or `success`.

- [ ] **Step 5: Implement `AdminLoginPage`**

Create `frontend/src/features/admin-auth/pages/AdminLoginPage.tsx`.

Behavior:

- use `TenantAuthShell` for tenant name/monogram only;
- title for email step: `Вход в админ-консоль`;
- description for email step: `Введите email администратора Chatwoot, чтобы получить код входа.`;
- title for code step: `Подтвердите вход`;
- description for code step: `Введите код из письма, чтобы открыть админ-консоль.`;
- call `requestAdminLoginCode({ email })`;
- if response is `sent`, show code step with info `Код отправлен на ${email}.`;
- if response is `existing_pending`, show code step with info `Код уже отправлен. Проверьте почту или дождитесь повторной отправки.`;
- store `resendAvailableInSeconds` in local state and decrement it once per second while it is above zero;
- `onResend` calls `requestAdminLoginCode({ email })` again, updates info message and resets cooldown from the response;
- call `verifyAdminLoginCode({ email, code })`;
- call `setVerifiedSession(response)`;
- navigate to `location.state?.from.pathname` only when it starts with `/admin` and is not `/admin/login`;
- otherwise navigate to `/admin/branding`;
- do not read return URL from query params.

Local helper:

```ts
function getSafeAdminReturnPath(state: unknown) {
  if (
    state &&
    typeof state === 'object' &&
    'from' in state &&
    state.from &&
    typeof state.from === 'object' &&
    'pathname' in state.from &&
    typeof state.from.pathname === 'string' &&
    (state.from.pathname === '/admin' ||
      state.from.pathname.startsWith('/admin/')) &&
    state.from.pathname !== '/admin/login'
  ) {
    return state.from.pathname
  }

  return '/admin/branding'
}
```

- [ ] **Step 6: Run login page tests**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/admin-auth/pages/AdminLoginPage.test.tsx --reporter verbose
```

Expected:

```text
Test Files  1 passed
```

---

## Task 5: Build Admin Branding Shell Page

**Files:**

- Create: `frontend/src/features/admin-shell/pages/AdminBrandingPage.tsx`
- Create: `frontend/src/features/admin-shell/pages/AdminBrandingPage.test.tsx`

- [ ] **Step 1: Write shell page tests**

Create `frontend/src/features/admin-shell/pages/AdminBrandingPage.test.tsx`.

Render with `AdminSessionContext.Provider` and assert:

- heading `Брендинг`;
- selected nav item `Брендинг`;
- visible future groups:
  - `Основное`;
  - `Цвета`;
  - `Фоны и изображения`;
  - `Тексты`;
  - `Чат`;
  - `Страницы портала`;
- preview pane `Предпросмотр`;
- desktop-required narrow state text `Админ-консоль доступна с широкого экрана`;
- minimum disabled future controls:
  - `Название портала`;
  - `Загрузить логотип`;
  - `Основной цвет`;
  - `Фон auth-экранов`;
  - `Фон чата`;
  - `Label поддержки`;
  - `Страница информации о чате`;
- logout button calls `signOut`.
- logout failure shows visible `InlineAlert`, keeps the user on the page, and allows retry.

- [ ] **Step 2: Run failing shell test**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/admin-shell/pages/AdminBrandingPage.test.tsx --reporter verbose
```

Expected before implementation:

```text
FAIL src/features/admin-shell/pages/AdminBrandingPage.test.tsx
Cannot find module './AdminBrandingPage'
```

- [ ] **Step 3: Implement shell page**

Create `frontend/src/features/admin-shell/pages/AdminBrandingPage.tsx`.

Content requirements:

- no real settings form submission;
- all future setting controls disabled;
- no fake save success;
- logout button calls `useAdminSession().signOut()`;
- logout errors are caught locally and displayed through `InlineAlert` without navigating away;
- narrow state available in markup with copy:
  - `Админ-консоль доступна с широкого экрана`;
  - `Настройки и предпросмотр требуют desktop ширину.`;
- narrow state wrapper uses `lg:hidden`;
- desktop console wrapper uses `hidden lg:grid` or equivalent `lg` breakpoint styles;
- desktop shell uses left nav, center work area, right preview pane;
- preview pane copy states that real portal component preview comes in next branding slice.

Suggested groups:

```ts
const brandingGroups = [
  {
    description: 'Название портала, логотип и PWA identity.',
    title: 'Основное',
  },
  {
    description: 'Основной цвет, кнопки, focus states и исходящие сообщения.',
    title: 'Цвета',
  },
  {
    description: 'Auth-фоны, фон чата, фон шапки чата и controlled overlays.',
    title: 'Фоны и изображения',
  },
  {
    description: 'Auth заголовки, help/welcome copy и label поддержки.',
    title: 'Тексты',
  },
  {
    description:
      'Шапка, пустое состояние, недоступность и читаемость сообщений.',
    title: 'Чат',
  },
  {
    description: 'Информация о чате, профиль, настройки и уведомления.',
    title: 'Страницы портала',
  },
]
```

Minimum disabled controls:

```tsx
const disabledControls = [
  'Название портала',
  'Загрузить логотип',
  'Основной цвет',
  'Фон auth-экранов',
  'Фон чата',
  'Label поддержки',
  'Страница информации о чате',
]
```

Render these as disabled `button`, `input`, `textarea` or `select` controls so tests can assert `toBeDisabled()`. Use `aria-describedby` only when helper text is present; do not add working save buttons in `MT-9C`.

- [ ] **Step 4: Run shell page tests**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/admin-shell/pages/AdminBrandingPage.test.tsx --reporter verbose
```

Expected:

```text
Test Files  1 passed
```

---

## Task 6: Add Route Boundaries And Admin Routes

**Files:**

- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/src/app/AppRoutes.tsx`
- Modify: `frontend/src/app/routePaths.ts`
- Create: `frontend/src/app/layouts/CustomerAuthBoundary.tsx`
- Create: `frontend/src/app/layouts/AdminSessionBoundary.tsx`
- Create: `frontend/src/app/layouts/AdminPublicRoute.tsx`
- Create: `frontend/src/app/layouts/AdminProtectedRoute.tsx`
- Create: `frontend/src/app/AppRoutes.admin.test.tsx`

- [ ] **Step 1: Write route separation tests**

Create `frontend/src/app/AppRoutes.admin.test.tsx`.

Cover:

- `/admin` with `/api/admin/auth/me` returning `401` redirects to `/admin/login`;
- `/admin/branding` with `/api/admin/auth/me` returning `200` renders `Брендинг`;
- `/admin/login` with `/api/admin/auth/me` returning `200` redirects to `/admin/branding`;
- `/admin` does not call `/api/auth/me`;
- `/app/chat` with only admin `/me` success and customer `/me` `401` redirects to customer login;
- `/app/chat` does not call `/api/admin/auth/me`;
- `/auth/login` still renders customer login and calls `/api/auth/me`.

Fetch assertions:

```ts
expect(fetchMock).toHaveBeenCalledWith(
  '/api/admin/auth/me',
  expect.objectContaining({
    credentials: 'include',
    method: 'GET',
  }),
)

expect(fetchMock).not.toHaveBeenCalledWith('/api/auth/me', expect.anything())
```

- [ ] **Step 2: Run failing route tests**

Run:

```bash
pnpm --dir frontend exec vitest run src/app/AppRoutes.admin.test.tsx --reporter verbose
```

Expected before implementation:

```text
FAIL src/app/AppRoutes.admin.test.tsx
Unable to find an element with the text: Вход в админ-консоль
```

- [ ] **Step 3: Update route paths**

Modify `frontend/src/app/routePaths.ts`:

```ts
export const routePaths = {
  root: '/',
  admin: {
    branding: '/admin/branding',
    login: '/admin/login',
    root: '/admin',
  },
  app: {
    chat: '/app/chat',
    profile: '/app/profile',
    root: '/app',
    settings: '/app/settings',
    settingsNotifications: '/app/settings/notifications',
  },
  auth: {
    login: '/auth/login',
    register: '/auth/register',
    registerSetPassword: '/auth/register/set-password',
    registerVerify: '/auth/register/verify',
    passwordResetRequest: '/auth/password-reset/request',
    passwordResetSetPassword: '/auth/password-reset/set-password',
    passwordResetVerify: '/auth/password-reset/verify',
  },
} as const
```

- [ ] **Step 4: Remove global customer auth provider from `App.tsx`**

Modify `frontend/src/app/App.tsx` to:

```tsx
import { BrowserRouter } from 'react-router-dom'

import { AppRoutes } from './AppRoutes'
import { TenantProvider } from '../features/tenant/lib/TenantProvider'
import { PwaUpdateBanner } from '../pwa/PwaUpdateBanner'

function App() {
  return (
    <BrowserRouter>
      <TenantProvider>
        <PwaUpdateBanner />
        <AppRoutes />
      </TenantProvider>
    </BrowserRouter>
  )
}

export default App
```

- [ ] **Step 5: Add customer auth boundary**

Create `frontend/src/app/layouts/CustomerAuthBoundary.tsx`:

```tsx
import { Outlet } from 'react-router-dom'

import { AuthSessionProvider } from '../../features/auth/lib/AuthSessionProvider'

export function CustomerAuthBoundary() {
  return (
    <AuthSessionProvider>
      <Outlet />
    </AuthSessionProvider>
  )
}
```

- [ ] **Step 6: Add admin session boundary**

Create `frontend/src/app/layouts/AdminSessionBoundary.tsx`:

```tsx
import { Outlet } from 'react-router-dom'

import { AdminSessionProvider } from '../../features/admin-auth/lib/AdminSessionProvider'

export function AdminSessionBoundary() {
  return (
    <AdminSessionProvider>
      <Outlet />
    </AdminSessionProvider>
  )
}
```

- [ ] **Step 7: Add admin public route**

Create `frontend/src/app/layouts/AdminPublicRoute.tsx`:

```tsx
import { Navigate, Outlet } from 'react-router-dom'

import { routePaths } from '../routePaths'
import { InlineAlert } from '../../shared/ui/InlineAlert'
import { PrimaryButton } from '../../shared/ui/PrimaryButton'
import { useAdminSession } from '../../features/admin-auth/lib/adminSessionContext'

export function AdminPublicRoute() {
  const { errorMessage, refreshSession, status } = useAdminSession()

  if (status === 'checking') {
    return null
  }

  if (status === 'error') {
    return (
      <section className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center space-y-4 px-6 py-10">
        <h1 className="text-2xl font-semibold text-slate-950">
          Сессию администратора не удалось проверить
        </h1>
        <p className="text-sm leading-6 text-slate-600">
          Проверьте подключение и повторите попытку.
        </p>
        <InlineAlert message={errorMessage} tone="error" />
        <PrimaryButton
          onClick={() => {
            void refreshSession()
          }}
          type="button"
        >
          Повторить
        </PrimaryButton>
      </section>
    )
  }

  return status === 'authenticated' ? (
    <Navigate replace to={routePaths.admin.branding} />
  ) : (
    <Outlet />
  )
}
```

- [ ] **Step 8: Add admin protected route**

Create `frontend/src/app/layouts/AdminProtectedRoute.tsx`.

Required behavior:

- `checking` renders `null`;
- `error` renders controlled retry state with `Повторить`;
- `unauthenticated` redirects to `/admin/login` with `state={{ from: location }}`;
- `authenticated` renders `<Outlet />`.

Use `PortalFrame`, `InlineAlert`, `PrimaryButton`, and `RefreshIcon` like `ProtectedRoute`, but copy must say admin:

```tsx
Сессию администратора не удалось проверить
```

- [ ] **Step 9: Wire routes in `AppRoutes.tsx`**

Add lazy imports:

```ts
const AdminLoginPage = lazyRouteComponent(() =>
  import('../features/admin-auth/pages/AdminLoginPage').then(
    (module) => module.AdminLoginPage,
  ),
)

const AdminBrandingPage = lazyRouteComponent(() =>
  import('../features/admin-shell/pages/AdminBrandingPage').then(
    (module) => module.AdminBrandingPage,
  ),
)
```

Wrap customer routes:

```tsx
<Route element={<CustomerAuthBoundary />}>
  <Route path="/auth" element={<PublicAuthRoute />}>
    ...
  </Route>

  <Route element={<ProtectedRoute />}>
    <Route path="/app" element={<AppShellLayout />}>
      ...
    </Route>
  </Route>
</Route>
```

Add admin routes before wildcard:

```tsx
<Route element={<AdminSessionBoundary />}>
  <Route element={<AdminPublicRoute />}>
    <Route
      path={routePaths.admin.login}
      element={
        <LazyRoute>
          <AdminLoginPage />
        </LazyRoute>
      }
    />
  </Route>

  <Route element={<AdminProtectedRoute />}>
    <Route
      path={routePaths.admin.root}
      element={<Navigate replace to={routePaths.admin.branding} />}
    />
    <Route
      path={routePaths.admin.branding}
      element={
        <LazyRoute>
          <AdminBrandingPage />
        </LazyRoute>
      }
    />
  </Route>
</Route>
```

- [ ] **Step 10: Update existing tests after customer auth boundary relocation**

Find affected tests:

```bash
rg -n "<AuthSessionProvider>|AuthSessionContext.Provider|<AppRoutes" frontend/src -S
```

Apply these rules:

- If a test renders `<AppRoutes />`, do not wrap it in an external `AuthSessionProvider`; `AppRoutes` now creates the customer boundary.
- If a test used `AuthSessionContext.Provider` to bypass auth around `<AppRoutes />`, replace it with fetch mocks for `/api/auth/me`.
- Tests that render components without `<AppRoutes />` can keep direct `AuthSessionProvider` or `AuthSessionContext.Provider`.
- Update fetch mock order so the first customer route request is `/api/auth/me`.
- Keep admin route tests asserting that `/admin` does not call `/api/auth/me`.

Minimum files to inspect and update:

```text
frontend/src/app/AppRoutes.profile.test.tsx
frontend/src/features/auth/pages/LoginPage.test.tsx
frontend/src/features/auth/pages/RequestPages.test.tsx
frontend/src/test/chatPageTestHarness.tsx
frontend/src/features/chat/pages/ChatPage.thread-selection.test.tsx
frontend/src/features/chat/pages/ChatPage.unread-indicators.test.tsx
frontend/src/features/chat/pages/ChatPage.media.test.tsx
frontend/src/features/chat/pages/ChatPage.runtime.test.tsx
frontend/src/features/chat/pages/ChatPage.optimistic-send.test.tsx
frontend/src/features/chat/pages/ChatPage.search.test.tsx
frontend/src/features/chat/pages/ChatPage.offline-cache.testSupport.tsx
```

After updating, this command should not show `AppRoutes` manually wrapped by `AuthSessionProvider` or `AuthSessionContext.Provider`:

```bash
rg -n "<AuthSessionProvider>\\s*\\n\\s*<AppRoutes|<AuthSessionContext\\.Provider[\\s\\S]*<AppRoutes" frontend/src -S
```

Expected: no matches.

- [ ] **Step 11: Run route tests**

Run:

```bash
pnpm --dir frontend exec vitest run \
  src/app/AppRoutes.admin.test.tsx \
  src/app/AppRoutes.profile.test.tsx \
  src/features/auth/pages/LoginPage.test.tsx \
  src/features/auth/pages/RequestPages.test.tsx \
  src/features/chat/pages/ChatPage.thread-selection.test.tsx \
  src/features/chat/pages/ChatPage.unread-indicators.test.tsx \
  src/features/chat/pages/ChatPage.media.test.tsx \
  src/features/chat/pages/ChatPage.runtime.test.tsx \
  src/features/chat/pages/ChatPage.optimistic-send.test.tsx \
  src/features/chat/pages/ChatPage.search.test.tsx \
  --reporter verbose
```

Expected:

```text
Test Files  10 passed
```

---

## Task 7: Add Playwright Admin Login Smoke

**Files:**

- Create: `playwright.admin-ui.config.ts`
- Create: `tests/e2e/admin-login-ui.spec.ts`

- [ ] **Step 1: Add route-mocked Playwright config without global setup**

Create `playwright.admin-ui.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173'

export default defineConfig({
  expect: {
    timeout: 5000,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list'], ['html', { open: 'never' }]],
  retries: process.env.CI ? 2 : 0,
  testDir: './tests/e2e',
  timeout: 30_000,
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
```

This config intentionally has no `globalSetup`, because this route-mocked UI smoke must not require local Postgres, backend migrations, Chatwoot or Mailpit.

- [ ] **Step 2: Add route-mocked e2e test**

Create `tests/e2e/admin-login-ui.spec.ts`.

Use route mocks so the test proves browser UI/routing without depending on real Mailpit admin email:

```ts
import { expect, type Page, test } from '@playwright/test'

async function mockAdminUiRoutes(page: Page) {
  let isAdminAuthenticated = false

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
    if (!isAdminAuthenticated) {
      await route.fulfill({
        contentType: 'application/json',
        json: {
          error: {
            code: 'TENANT_ADMIN_UNAUTHORIZED',
            message: 'Требуется вход администратора.',
          },
        },
        status: 401,
      })
      return
    }

    await route.fulfill({
      contentType: 'application/json',
      json: {
        admin: {
          chatwootAgentId: 11,
          email: 'admin@example.test',
          role: 'administrator',
        },
        session: {
          expiresAt: '2026-06-07T00:00:00.000Z',
        },
      },
      status: 200,
    })
  })

  await page.route('**/api/admin/auth/request', async (route) => {
    expect(route.request().method()).toBe('POST')
    expect(await route.request().postDataJSON()).toEqual({
      email: 'admin@example.test',
    })

    await route.fulfill({
      contentType: 'application/json',
      json: {
        delivery: 'sent',
        email: 'admin@example.test',
        expiresInSeconds: 900,
        nextStep: 'verify_code',
        purpose: 'tenant_admin_login',
        resendAvailableInSeconds: 0,
        result: 'admin_login_challenge_requested',
      },
      status: 200,
    })
  })

  await page.route('**/api/admin/auth/verify', async (route) => {
    expect(route.request().method()).toBe('POST')
    expect(await route.request().postDataJSON()).toEqual({
      code: '123456',
      email: 'admin@example.test',
    })
    isAdminAuthenticated = true

    await route.fulfill({
      contentType: 'application/json',
      json: {
        admin: {
          chatwootAgentId: 11,
          email: 'admin@example.test',
          role: 'administrator',
        },
        session: {
          expiresAt: '2026-06-07T00:00:00.000Z',
        },
      },
      status: 200,
    })
  })

  await page.route('**/api/admin/auth/logout', async (route) => {
    expect(route.request().method()).toBe('POST')
    isAdminAuthenticated = false
    await route.fulfill({ status: 204 })
  })
}

test('logs into admin console through email code UI and logs out', async ({
  page,
}) => {
  await mockAdminUiRoutes(page)

  await page.goto('/admin/login')
  await expect(
    page.getByRole('heading', { name: 'Вход в админ-консоль' }),
  ).toBeVisible()

  await page.getByLabel('Email администратора').fill('admin@example.test')
  await page.getByRole('button', { name: 'Получить код' }).click()

  await expect(
    page.getByRole('heading', { name: 'Подтвердите вход' }),
  ).toBeVisible()

  for (const [index, digit] of Array.from('123456').entries()) {
    const label =
      index === 0 ? 'Код из письма' : `Код из письма, цифра ${index + 1}`

    await page.getByLabel(label, { exact: true }).fill(digit)
  }

  await page.getByRole('button', { name: 'Войти в админ-консоль' }).click()

  await expect(page).toHaveURL(/\/admin\/branding$/)
  await expect(page.getByRole('heading', { name: 'Брендинг' })).toBeVisible()
  await expect(page.getByText('Фоны и изображения')).toBeVisible()
  await expect(page.getByText('Страницы портала')).toBeVisible()

  await page.getByRole('button', { name: 'Выйти' }).click()
  await expect(page).toHaveURL(/\/admin\/login$/)
})

test('shows controlled mobile state for admin branding shell', async ({
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 })
  await mockAdminUiRoutes(page)
  await page.goto('/admin/login')
  await page.getByLabel('Email администратора').fill('admin@example.test')
  await page.getByRole('button', { name: 'Получить код' }).click()

  for (const [index, digit] of Array.from('123456').entries()) {
    const label =
      index === 0 ? 'Код из письма' : `Код из письма, цифра ${index + 1}`

    await page.getByLabel(label, { exact: true }).fill(digit)
  }

  await page.getByRole('button', { name: 'Войти в админ-консоль' }).click()

  await expect(page).toHaveURL(/\/admin\/branding$/)
  await expect(
    page.getByRole('heading', {
      name: 'Админ-консоль доступна с широкого экрана',
    }),
  ).toBeVisible()
  await expect(
    page.getByText('Настройки и предпросмотр требуют desktop ширину.'),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Выйти' })).toBeVisible()
  await expect(page.getByText('Фоны и изображения')).not.toBeVisible()
})
```

- [ ] **Step 3: Run focused Playwright test**

Make sure frontend dev server is running in a separate terminal/session. If it is not running, start it and keep it open:

```bash
pnpm --dir frontend dev -- --host 0.0.0.0
```

Readiness URL:

```text
http://127.0.0.1:5173/admin/login
```

Then run:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173 pnpm exec playwright test --config playwright.admin-ui.config.ts tests/e2e/admin-login-ui.spec.ts
```

Expected:

```text
2 passed
```

If the dev server cannot start or the browser cannot run, record the blocker in the final implementation response and run the Vitest/browser route tests instead. Do not silently skip browser validation.

---

## Task 8: Final Verification And Review

**Files:**

- Review all touched files.
- No new source files outside the file list unless review finds a concrete reason.

- [ ] **Step 1: Run focused frontend tests**

Run:

```bash
pnpm --dir frontend exec vitest run \
  src/features/admin-auth/api/adminAuthClient.test.ts \
  src/features/admin-auth/lib/AdminSessionProvider.test.tsx \
  src/features/admin-auth/pages/AdminLoginPage.test.tsx \
  src/features/admin-shell/pages/AdminBrandingPage.test.tsx \
  src/app/AppRoutes.admin.test.tsx \
  src/app/AppRoutes.profile.test.tsx \
  src/features/auth/pages/LoginPage.test.tsx \
  src/features/auth/pages/RequestPages.test.tsx \
  src/features/chat/pages/ChatPage.thread-selection.test.tsx \
  src/features/chat/pages/ChatPage.unread-indicators.test.tsx \
  src/features/chat/pages/ChatPage.media.test.tsx \
  src/features/chat/pages/ChatPage.runtime.test.tsx \
  src/features/chat/pages/ChatPage.optimistic-send.test.tsx \
  src/features/chat/pages/ChatPage.search.test.tsx \
  --reporter verbose
```

Expected:

```text
Test Files  14 passed
```

- [ ] **Step 2: Run frontend lint**

Run:

```bash
pnpm --dir frontend lint
```

Expected:

```text
No ESLint errors
```

- [ ] **Step 3: Run frontend build**

Run:

```bash
pnpm --dir frontend build
```

Expected:

```text
tsc -b && vite build ... completed with exit code 0
```

- [ ] **Step 4: Run focused e2e**

Run:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173 pnpm exec playwright test --config playwright.admin-ui.config.ts tests/e2e/admin-login-ui.spec.ts
```

Expected:

```text
2 passed
```

- [ ] **Step 5: Update work-log after successful closure**

After implementation, review and checks pass, update
`docs/roadmap/work-log.md`:

- add one concise current-baseline bullet for completed `MT-9C` admin login UI
  and route/session boundary;
- keep it as a stable baseline map, without test command details;
- replace the single `Recommended Next Step` block with the next active branding
  settings foundation step;
- keep exactly one `Recommended Next Step` block at the end of the file.

- [ ] **Step 6: Run whitespace check**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 7: Manual code review checklist**

Review these invariants before final response:

- `/admin` uses `AdminSessionProvider`, not customer `AuthSessionProvider`.
- `/auth` and `/app` still use customer `AuthSessionProvider`.
- `/admin/login` never opens customer auth flows.
- `/admin/branding` never writes tenant settings.
- admin session is not stored in localStorage, IndexedDB, service worker cache or startup cache.
- admin API client talks only to `/api/admin/auth/*`.
- browser code does not reference Chatwoot tokens.
- login and admin copy are Russian.
- future branding groups include backgrounds and portal pages.

- [ ] **Step 8: Commit checkpoint after closure flow**

Only after review and checks pass:

```bash
git status --short --branch
git add frontend/src/shared/ui/OtpInputGroup.tsx \
  frontend/src/features/auth/components/OtpInputGroup.tsx \
  frontend/src/features/admin-auth \
  frontend/src/features/admin-shell \
  frontend/src/app/App.tsx \
  frontend/src/app/AppRoutes.tsx \
  frontend/src/app/routePaths.ts \
  frontend/src/app/layouts/CustomerAuthBoundary.tsx \
  frontend/src/app/layouts/AdminSessionBoundary.tsx \
  frontend/src/app/layouts/AdminPublicRoute.tsx \
  frontend/src/app/layouts/AdminProtectedRoute.tsx \
  frontend/src/app/AppRoutes.admin.test.tsx \
  playwright.admin-ui.config.ts \
  tests/e2e/admin-login-ui.spec.ts \
  docs/roadmap/work-log.md
git diff --cached --check
git commit -m "feat: add mt-9c admin login ui"
```

Expected commit scope:

- frontend admin login UI;
- admin route/session boundary;
- `/admin/branding` shell;
- focused tests and e2e.

Do not include generated output.

---

## Acceptance Mapping

- `/admin/login` email-code login: Tasks 2, 3, 4, 6, 7.
- `/admin` redirects to `/admin/branding`: Task 6.
- `/admin` and `/admin/branding` protected by admin session: Tasks 3 and 6.
- Customer session alone cannot open `/admin`: Task 6 route tests.
- Admin session alone does not open customer `/app`: Task 6 route tests.
- Admin logout returns to `/admin/login`: Tasks 3, 5, 7.
- Russian login/admin copy: Tasks 4 and 5.
- Security-sensitive copy system-owned: Tasks 2 and 4 use backend messages.
- Accepted admin-console structure: Task 5.
- Narrow controlled state: Task 5.
- No branding persistence/assets/Chatwoot browser authority: Tasks 2, 5, 8 review.
