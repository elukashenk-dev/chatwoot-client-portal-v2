# Unified Startup Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать одну coordinated full-screen startup surface, которая покрывает tenant, session, route и initial chat startup без повторных одинаковых splash-экранов и blank frames.

**Architecture:** Добавляем root-level `StartupSurfaceProvider` и `StartupSurfaceOverlay`, а существующие providers/routes/chat loading сообщают фазы через typed reporter hook. Full-screen startup больше не принадлежит отдельным nested gates; один coordinator управляет delay, minimum visible duration и handoff grace.

**Tech Stack:** React 19, React Router 7, TypeScript, Vite, Vitest, Testing Library, existing `AppStartupScreen`.

---

## Исходная Ветка И Scope

Перед implementation создать отдельную feature branch от актуального `main`:

```bash
git switch main
git pull --ff-only
git switch -c feature/phase-pwa-unified-startup-surface
```

Implementation scope не должен включать:

- backend изменения;
- MT-9 tenant admin/branding;
- редизайн auth forms;
- unrelated chat UI polish;
- service worker behavior changes.

## File Structure

### Create

- `frontend/src/features/tenant/startup/StartupSurfaceProvider.tsx`
  - Context, phase reporter hook, priority selection, visibility timers,
    full-screen overlay.
- `frontend/src/features/tenant/startup/StartupSurfaceProvider.test.tsx`
  - Unit/component tests for delay, handoff, min visible duration and phase
    updates.

### Modify

- `frontend/src/app/App.tsx`
  - Mount `StartupSurfaceProvider` once above tenant/auth providers and render
    `StartupSurfaceOverlay` once at app root.
- `frontend/src/features/tenant/lib/TenantProvider.tsx`
  - Remove local full-screen `StartupScreenGate`.
  - Report `tenant` and `tenant_slow` phases to startup coordinator.
  - Keep explicit `online_required` state as product recovery UI.
- `frontend/src/app/layouts/PublicAuthRoute.tsx`
  - Replace local startup gate with `useStartupSurfaceReport` for public session
    checking.
- `frontend/src/app/layouts/ProtectedRoute.tsx`
  - Replace local startup gate with `useStartupSurfaceReport` for protected
    session checking.
- `frontend/src/app/AppRoutes.tsx`
  - Replace Suspense fallback `DeferredStartupScreen` with reporter-only route
    chunk fallback.
- `frontend/src/features/chat/components/ChatLoadingState.tsx`
  - Replace nested `DeferredStartupScreen` with reporter-only chat startup
    phase.
- `frontend/src/test/chatPageTestHarness.tsx`
  - Wrap chat route tests in the root startup coordinator.
- `frontend/src/index.css`
  - Align initial body background with PWA manifest background.
- `frontend/index.html`
  - Align inline initial body background with PWA manifest background.
- Tests that currently assert old nested gate behavior:
  - `frontend/src/features/tenant/lib/TenantProvider.test.tsx`
  - `frontend/src/features/auth/pages/LoginPage.test.tsx`
  - `frontend/src/features/chat/components/ChatLoadingState.test.tsx`
  - `frontend/src/features/tenant/components/StartupScreenGate.test.tsx`
  - `frontend/src/indexCss.test.ts`

### Remove Old Startup Gate

- `frontend/src/features/tenant/components/StartupScreenGate.tsx`
- `frontend/src/features/tenant/components/StartupScreenGate.test.tsx`

Delete these after `rg "StartupScreenGate|DeferredStartupScreen" frontend/src`
shows no production usage outside the old gate files. Do not leave two
parallel fullscreen startup implementations in the codebase.

---

## Task 1: Add Startup Surface Coordinator

**Files:**

- Create: `frontend/src/features/tenant/startup/StartupSurfaceProvider.tsx`
- Create: `frontend/src/features/tenant/startup/StartupSurfaceProvider.test.tsx`

- [ ] **Step 1: Write failing coordinator tests**

Create `frontend/src/features/tenant/startup/StartupSurfaceProvider.test.tsx`:

```tsx
import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  STARTUP_SURFACE_HANDOFF_GRACE_MS,
  STARTUP_SURFACE_MIN_VISIBLE_MS,
  STARTUP_SURFACE_SHOW_DELAY_MS,
  StartupSurfaceOverlay,
  StartupSurfaceProvider,
  useStartupSurfaceReport,
} from './StartupSurfaceProvider'

function Reporter({
  active,
  phase,
  statusLabel,
}: {
  active: boolean
  phase: 'tenant' | 'tenant_slow' | 'session' | 'route' | 'chat'
  statusLabel: string
}) {
  useStartupSurfaceReport({
    active,
    description: `${statusLabel} description`,
    phase,
    statusLabel,
    title: 'Открываем кабинет',
  })

  return <div>reporter {phase}</div>
}

function Harness({
  active,
  phase = 'tenant',
  statusLabel = 'Загружаем настройки',
}: {
  active: boolean
  phase?: 'tenant' | 'tenant_slow' | 'session' | 'route' | 'chat'
  statusLabel?: string
}) {
  return (
    <StartupSurfaceProvider>
      <Reporter active={active} phase={phase} statusLabel={statusLabel} />
      <div>Ready child</div>
      <StartupSurfaceOverlay />
    </StartupSurfaceProvider>
  )
}

describe('StartupSurfaceProvider', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not show the surface before the anti-flicker delay', async () => {
    vi.useFakeTimers()
    render(<Harness active />)

    expect(
      screen.queryByRole('heading', { name: 'Открываем кабинет' }),
    ).not.toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(STARTUP_SURFACE_SHOW_DELAY_MS - 1)
    })

    expect(
      screen.queryByRole('heading', { name: 'Открываем кабинет' }),
    ).not.toBeInTheDocument()
  })

  it('shows one surface after the delay', async () => {
    vi.useFakeTimers()
    render(<Harness active />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(STARTUP_SURFACE_SHOW_DELAY_MS)
    })

    expect(
      screen.getByRole('heading', { name: 'Открываем кабинет' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Загружаем настройки')).toBeInTheDocument()
  })

  it('updates the visible phase in place without duplicating headings', async () => {
    vi.useFakeTimers()
    const { rerender } = render(<Harness active />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(STARTUP_SURFACE_SHOW_DELAY_MS)
    })

    rerender(<Harness active phase="session" statusLabel="Проверяем сессию" />)

    expect(
      screen.getAllByRole('heading', { name: 'Открываем кабинет' }),
    ).toHaveLength(1)
    expect(screen.getByText('Проверяем сессию')).toBeInTheDocument()
    expect(screen.queryByText('Загружаем настройки')).not.toBeInTheDocument()
  })

  it('keeps the surface through a short handoff gap', async () => {
    vi.useFakeTimers()
    const { rerender } = render(<Harness active />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(STARTUP_SURFACE_SHOW_DELAY_MS)
    })

    rerender(<Harness active={false} />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(STARTUP_SURFACE_MIN_VISIBLE_MS)
      await vi.advanceTimersByTimeAsync(STARTUP_SURFACE_HANDOFF_GRACE_MS - 1)
    })

    expect(
      screen.getByRole('heading', { name: 'Открываем кабинет' }),
    ).toBeInTheDocument()

    rerender(<Harness active phase="session" statusLabel="Проверяем сессию" />)

    expect(screen.getByText('Проверяем сессию')).toBeInTheDocument()
  })

  it('releases after min visible duration and handoff grace', async () => {
    vi.useFakeTimers()
    const { rerender } = render(<Harness active />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(STARTUP_SURFACE_SHOW_DELAY_MS)
    })

    rerender(<Harness active={false} />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(STARTUP_SURFACE_MIN_VISIBLE_MS)
      await vi.advanceTimersByTimeAsync(STARTUP_SURFACE_HANDOFF_GRACE_MS)
    })

    expect(
      screen.queryByRole('heading', { name: 'Открываем кабинет' }),
    ).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the failing coordinator tests**

Run:

```bash
pnpm --dir frontend test -- StartupSurfaceProvider
```

Expected: FAIL because `StartupSurfaceProvider.tsx` does not exist.

- [ ] **Step 3: Implement coordinator**

Create `frontend/src/features/tenant/startup/StartupSurfaceProvider.tsx`:

```tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import {
  AppStartupScreen,
  type AppStartupScreenProps,
} from '../components/AppStartupScreen'

export const STARTUP_SURFACE_SHOW_DELAY_MS = 450
export const STARTUP_SURFACE_MIN_VISIBLE_MS = 700
export const STARTUP_SURFACE_HANDOFF_GRACE_MS = 120

export type StartupSurfacePhase =
  | 'tenant_slow'
  | 'tenant'
  | 'session'
  | 'route'
  | 'chat'
  | 'offline_cached'

export type StartupSurfaceReport = Omit<AppStartupScreenProps, 'mode'> & {
  active: boolean
  phase: StartupSurfacePhase
}

type StartupSurfaceContextValue = {
  currentSurface: AppStartupScreenProps | null
  removeReport: (id: string) => void
  updateReport: (id: string, report: StartupSurfaceReport) => void
}

const StartupSurfaceContext =
  createContext<StartupSurfaceContextValue | null>(null)

const phasePriority: Record<StartupSurfacePhase, number> = {
  tenant_slow: 60,
  tenant: 50,
  session: 40,
  route: 30,
  chat: 20,
  offline_cached: 10,
}

function selectActiveReport(reports: Map<string, StartupSurfaceReport>) {
  return [...reports.values()]
    .filter((report) => report.active)
    .sort((left, right) => phasePriority[right.phase] - phasePriority[left.phase])[0]
}

function toScreenProps(report: StartupSurfaceReport): AppStartupScreenProps {
  return {
    description: report.description,
    mode: 'screen',
    showChatPreview: report.showChatPreview,
    statusLabel: report.statusLabel,
    title: report.title,
    userName: report.userName,
  }
}

export function StartupSurfaceProvider({
  children,
}: {
  children: ReactNode
}) {
  const [reports, setReports] = useState(new Map<string, StartupSurfaceReport>())
  const [isVisible, setIsVisible] = useState(false)
  const [canRelease, setCanRelease] = useState(false)
  const [visibleSurface, setVisibleSurface] =
    useState<AppStartupScreenProps | null>(null)
  const activeReport = useMemo(() => selectActiveReport(reports), [reports])

  const updateReport = useCallback((id: string, report: StartupSurfaceReport) => {
    setReports((currentReports) => {
      const nextReports = new Map(currentReports)
      nextReports.set(id, report)
      return nextReports
    })
  }, [])

  const removeReport = useCallback((id: string) => {
    setReports((currentReports) => {
      const nextReports = new Map(currentReports)
      nextReports.delete(id)
      return nextReports
    })
  }, [])

  useEffect(() => {
    if (!activeReport || isVisible) {
      return undefined
    }

    const showTimer = window.setTimeout(() => {
      setVisibleSurface(toScreenProps(activeReport))
      setCanRelease(false)
      setIsVisible(true)
    }, STARTUP_SURFACE_SHOW_DELAY_MS)

    return () => {
      window.clearTimeout(showTimer)
    }
  }, [activeReport, isVisible])

  useEffect(() => {
    if (!activeReport || !isVisible) {
      return
    }

    setVisibleSurface(toScreenProps(activeReport))
  }, [activeReport, isVisible])

  useEffect(() => {
    if (!isVisible) {
      return undefined
    }

    const releaseTimer = window.setTimeout(() => {
      setCanRelease(true)
    }, STARTUP_SURFACE_MIN_VISIBLE_MS)

    return () => {
      window.clearTimeout(releaseTimer)
    }
  }, [isVisible])

  useEffect(() => {
    if (activeReport || !isVisible || !canRelease) {
      return undefined
    }

    const hideTimer = window.setTimeout(() => {
      setIsVisible(false)
      setVisibleSurface(null)
    }, STARTUP_SURFACE_HANDOFF_GRACE_MS)

    return () => {
      window.clearTimeout(hideTimer)
    }
  }, [activeReport, canRelease, isVisible])

  const value = useMemo(
    () => ({
      currentSurface: isVisible ? visibleSurface : null,
      removeReport,
      updateReport,
    }),
    [isVisible, removeReport, updateReport, visibleSurface],
  )

  return (
    <StartupSurfaceContext.Provider value={value}>
      {children}
    </StartupSurfaceContext.Provider>
  )
}

export function useStartupSurfaceReport(report: StartupSurfaceReport) {
  const context = useContext(StartupSurfaceContext)
  const id = useId()

  if (!context) {
    throw new Error(
      'useStartupSurfaceReport must be used inside StartupSurfaceProvider',
    )
  }

  const { removeReport, updateReport } = context

  useEffect(() => {
    updateReport(id, report)

    return () => {
      removeReport(id)
    }
  }, [
    id,
    removeReport,
    report.active,
    report.description,
    report.phase,
    report.showChatPreview,
    report.statusLabel,
    report.title,
    report.userName,
    updateReport,
  ])
}

export function StartupSurfaceOverlay() {
  const context = useContext(StartupSurfaceContext)

  if (!context?.currentSurface) {
    return null
  }

  return (
    <div className="fixed inset-0 z-40 bg-brand-50">
      <AppStartupScreen {...context.currentSurface} />
    </div>
  )
}
```

- [ ] **Step 4: Run coordinator tests**

Run:

```bash
pnpm --dir frontend test -- StartupSurfaceProvider
```

Expected: PASS.

- [ ] **Step 5: Commit checkpoint if executing interactively**

Only commit after review of this task:

```bash
git add frontend/src/features/tenant/startup/StartupSurfaceProvider.tsx frontend/src/features/tenant/startup/StartupSurfaceProvider.test.tsx
git commit -m "feat(frontend): add startup surface coordinator"
```

---

## Task 2: Mount Coordinator At App Root

**Files:**

- Modify: `frontend/src/app/App.tsx`

- [ ] **Step 1: Write failing root mount test through existing route tests**

Do not add a new test file yet. Existing route tests will fail after Task 3 if
the provider is missing. Confirm current app root has no coordinator:

```bash
rg "StartupSurfaceProvider|StartupSurfaceOverlay" frontend/src/app/App.tsx
```

Expected: no matches.

- [ ] **Step 2: Mount provider and overlay**

Modify `frontend/src/app/App.tsx` to:

```tsx
import { BrowserRouter } from 'react-router-dom'

import { AppRoutes } from './AppRoutes'
import { AuthSessionProvider } from '../features/auth/lib/AuthSessionProvider'
import {
  StartupSurfaceOverlay,
  StartupSurfaceProvider,
} from '../features/tenant/startup/StartupSurfaceProvider'
import { TenantProvider } from '../features/tenant/lib/TenantProvider'
import { PwaUpdateBanner } from '../pwa/PwaUpdateBanner'

function App() {
  return (
    <BrowserRouter>
      <StartupSurfaceProvider>
        <TenantProvider>
          <AuthSessionProvider>
            <PwaUpdateBanner />
            <AppRoutes />
          </AuthSessionProvider>
        </TenantProvider>
        <StartupSurfaceOverlay />
      </StartupSurfaceProvider>
    </BrowserRouter>
  )
}

export default App
```

- [ ] **Step 3: Run a typecheck slice**

Run:

```bash
pnpm --dir frontend typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit checkpoint if executing interactively**

```bash
git add frontend/src/app/App.tsx
git commit -m "feat(frontend): mount startup surface at app root"
```

---

## Task 3: Move Tenant Startup Into Coordinator

**Files:**

- Modify: `frontend/src/features/tenant/lib/TenantProvider.tsx`
- Modify: `frontend/src/features/tenant/lib/TenantProvider.test.tsx`

- [ ] **Step 1: Update tenant startup tests**

In `frontend/src/features/tenant/lib/TenantProvider.test.tsx`, update the test
that currently expects the boot splash inside `TenantProvider`. It should render
with `StartupSurfaceProvider` and `StartupSurfaceOverlay`.

Use this wrapper near test helpers:

```tsx
import {
  StartupSurfaceOverlay,
  StartupSurfaceProvider,
} from '../startup/StartupSurfaceProvider'
```

Add helper:

```tsx
function renderWithStartupSurface(children: React.ReactNode) {
  return render(
    <StartupSurfaceProvider>
      {children}
      <StartupSurfaceOverlay />
    </StartupSurfaceProvider>,
  )
}
```

Change the splash test render to:

```tsx
renderWithStartupSurface(
  <TenantProvider>
    <TenantProbe />
  </TenantProvider>,
)
```

Keep these assertions:

```tsx
expect(
  screen.queryByRole('heading', { name: 'Открываем кабинет' }),
).not.toBeInTheDocument()
expect(screen.queryByText('Загружаем настройки.')).not.toBeInTheDocument()

await advanceBootTimers(450)

expect(
  screen.getByRole('heading', { name: 'Открываем кабинет' }),
).toBeInTheDocument()
expect(screen.getByText('Загружаем настройки.')).toBeInTheDocument()
```

- [ ] **Step 2: Run tenant tests and confirm failure**

Run:

```bash
pnpm --dir frontend test -- TenantProvider
```

Expected: FAIL because `TenantProvider` still imports local
`StartupScreenGate`.

- [ ] **Step 3: Replace local tenant gate with reporter**

In `frontend/src/features/tenant/lib/TenantProvider.tsx`:

Remove:

```tsx
import { StartupScreenGate } from '../components/StartupScreenGate'
```

Add:

```tsx
import { useStartupSurfaceReport } from '../startup/StartupSurfaceProvider'
```

Before `return`, add:

```tsx
  useStartupSurfaceReport({
    active: isStartupPending,
    description:
      status === 'slow_connection'
        ? 'Связь отвечает медленно. Проверяем сохраненные данные.'
        : 'Загружаем настройки.',
    phase: status === 'slow_connection' ? 'tenant_slow' : 'tenant',
    statusLabel:
      status === 'slow_connection'
        ? 'Проверяем сохраненные данные'
        : 'Загружаем настройки',
    title: 'Открываем кабинет',
  })
```

Replace the provider render body with:

```tsx
  return (
    <TenantIdentityContext.Provider value={value}>
      {status === 'online_required' ? null : shouldRenderChildren ? children : null}
      {status === 'online_required' ? (
        <TenantOnlineRequiredState
          description={errorMessage ?? undefined}
          onRetry={startTenantLoad}
        />
      ) : null}
    </TenantIdentityContext.Provider>
  )
```

Keep `shouldRenderChildren` and `isStartupPending`.

- [ ] **Step 4: Run tenant tests**

Run:

```bash
pnpm --dir frontend test -- TenantProvider
```

Expected: PASS.

- [ ] **Step 5: Commit checkpoint if executing interactively**

```bash
git add frontend/src/features/tenant/lib/TenantProvider.tsx frontend/src/features/tenant/lib/TenantProvider.test.tsx
git commit -m "feat(frontend): coordinate tenant startup surface"
```

---

## Task 4: Move Session Startup Into Coordinator

**Files:**

- Modify: `frontend/src/app/layouts/PublicAuthRoute.tsx`
- Modify: `frontend/src/app/layouts/ProtectedRoute.tsx`
- Modify: `frontend/src/features/auth/pages/LoginPage.test.tsx`

- [ ] **Step 1: Update route tests to expect one coordinator-owned surface**

In `frontend/src/features/auth/pages/LoginPage.test.tsx`, add imports:

```tsx
import {
  StartupSurfaceOverlay,
  StartupSurfaceProvider,
} from '../../tenant/startup/StartupSurfaceProvider'
```

Update `renderAuthRoutes` to:

```tsx
function renderAuthRoutes(initialEntries: string[]) {
  renderWithRouter(
    <StartupSurfaceProvider>
      <AuthSessionProvider>
        <AppRoutes />
      </AuthSessionProvider>
      <StartupSurfaceOverlay />
    </StartupSurfaceProvider>,
    { initialEntries },
  )
}
```

Keep the existing tests:

- `shows the app welcome screen while protected session is checking`
- `shows the same startup screen while public auth session is checking`

The target assertion stays:

```tsx
expect(
  screen.queryByRole('heading', { name: 'Открываем кабинет' }),
).not.toBeInTheDocument()

act(() => {
  vi.advanceTimersByTime(450)
})

expect(
  screen.getByRole('heading', { name: 'Открываем кабинет' }),
).toBeInTheDocument()
expect(screen.getByText('Проверяем сессию')).toBeInTheDocument()
```

Add a regression assertion to the protected test after the timer:

```tsx
expect(
  screen.getAllByRole('heading', { name: 'Открываем кабинет' }),
).toHaveLength(1)
```

- [ ] **Step 2: Run auth page tests and confirm failure**

Run:

```bash
pnpm --dir frontend test -- LoginPage
```

Expected: FAIL because route components still use `StartupScreenGate`.

- [ ] **Step 3: Update `PublicAuthRoute`**

Replace `frontend/src/app/layouts/PublicAuthRoute.tsx` with:

```tsx
import { Navigate, useLocation } from 'react-router-dom'

import { useAuthSession } from '../../features/auth/lib/authSessionContext'
import { getPostLoginPath } from '../../features/auth/lib/postLoginRedirect'
import { useStartupSurfaceReport } from '../../features/tenant/startup/StartupSurfaceProvider'
import { AuthLayout } from './AuthLayout'

export function PublicAuthRoute() {
  const location = useLocation()
  const { status } = useAuthSession()

  useStartupSurfaceReport({
    active: status === 'checking',
    description: 'Проверяем доступ и готовим нужный экран.',
    phase: 'session',
    statusLabel: 'Проверяем сессию',
    title: 'Открываем кабинет',
  })

  if (status === 'checking') {
    return null
  }

  return status === 'authenticated' ? (
    <Navigate replace to={getPostLoginPath(location.state)} />
  ) : (
    <AuthLayout />
  )
}
```

- [ ] **Step 4: Update `ProtectedRoute`**

In `frontend/src/app/layouts/ProtectedRoute.tsx`, remove the
`StartupScreenGate` import and add:

```tsx
import { useStartupSurfaceReport } from '../../features/tenant/startup/StartupSurfaceProvider'
```

Before status-specific returns, add:

```tsx
  useStartupSurfaceReport({
    active: status === 'checking',
    description: 'Проверяем доступ и готовим защищенную зону.',
    phase: 'session',
    statusLabel: 'Проверяем сессию',
    title: 'Открываем кабинет',
  })
```

Replace the final return with:

```tsx
  if (status === 'checking') {
    return null
  }

  return status === 'authenticated' && user ? (
    <Outlet />
  ) : (
    <Navigate replace state={{ from: location }} to={routePaths.auth.login} />
  )
```

Keep the existing `error` and `session_check_required` branches above this.

- [ ] **Step 5: Run auth page tests**

Run:

```bash
pnpm --dir frontend test -- LoginPage
```

Expected: PASS.

- [ ] **Step 6: Commit checkpoint if executing interactively**

```bash
git add frontend/src/app/layouts/PublicAuthRoute.tsx frontend/src/app/layouts/ProtectedRoute.tsx frontend/src/features/auth/pages/LoginPage.test.tsx
git commit -m "feat(frontend): coordinate session startup surface"
```

---

## Task 5: Move Route Chunk Startup Into Coordinator

**Files:**

- Modify: `frontend/src/app/AppRoutes.tsx`
- Test through: `frontend/src/features/auth/pages/LoginPage.test.tsx`

- [ ] **Step 1: Add route fallback component**

In `frontend/src/app/AppRoutes.tsx`, remove:

```tsx
import { DeferredStartupScreen } from '../features/tenant/components/StartupScreenGate'
```

Add:

```tsx
import { useStartupSurfaceReport } from '../features/tenant/startup/StartupSurfaceProvider'
```

Add this component above `LazyRoute`:

```tsx
function RouteChunkStartupFallback() {
  useStartupSurfaceReport({
    active: true,
    description: 'Загружаем экран.',
    phase: 'route',
    statusLabel: 'Загружаем экран',
    title: 'Открываем кабинет',
  })

  return null
}
```

Change `LazyRoute` to:

```tsx
function LazyRoute({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteChunkStartupFallback />}>{children}</Suspense>
}
```

- [ ] **Step 2: Run auth route tests**

Run:

```bash
pnpm --dir frontend test -- LoginPage
```

Expected: PASS. This confirms Suspense fallback can render under the
coordinator without importing the old gate.

- [ ] **Step 3: Commit checkpoint if executing interactively**

```bash
git add frontend/src/app/AppRoutes.tsx
git commit -m "feat(frontend): coordinate route chunk startup"
```

---

## Task 6: Move Chat Startup Into Coordinator

**Files:**

- Modify: `frontend/src/features/chat/components/ChatLoadingState.tsx`
- Modify: `frontend/src/features/chat/components/ChatLoadingState.test.tsx`
- Modify: `frontend/src/test/chatPageTestHarness.tsx`
- Test through: `frontend/src/features/chat/pages/ChatPage.test.tsx`

- [ ] **Step 1: Rewrite chat loading test for reporter behavior**

Replace `frontend/src/features/chat/components/ChatLoadingState.test.tsx` with:

```tsx
import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ChatLoadingState } from './ChatLoadingState'
import {
  StartupSurfaceOverlay,
  StartupSurfaceProvider,
} from '../../tenant/startup/StartupSurfaceProvider'
import { TenantIdentityContext } from '../../tenant/lib/tenantIdentityContext'

const tenantContextValue = {
  errorMessage: null,
  isUsingCachedData: false,
  status: 'ready' as const,
  tenant: {
    displayName: 'ProvGroup',
    primaryDomain: 'lk.provgroup.ru',
    publicBaseUrl: 'https://lk.provgroup.ru',
    slug: 'provgroup',
  },
}

describe('ChatLoadingState', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reports chat startup to the unified surface without rendering an inline splash', async () => {
    vi.useFakeTimers()
    const { container } = render(
      <TenantIdentityContext.Provider value={tenantContextValue}>
        <StartupSurfaceProvider>
          <ChatLoadingState userName="Иван Петров" />
          <StartupSurfaceOverlay />
        </StartupSurfaceProvider>
      </TenantIdentityContext.Provider>,
    )

    expect(container.querySelector('main.app-viewport-shell')).toBeNull()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(450)
    })

    expect(
      screen.getByRole('heading', { name: 'Добро пожаловать, Иван' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Готовим чат')).toBeInTheDocument()
    expect(screen.getAllByRole('heading')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run chat loading test and confirm failure**

Run:

```bash
pnpm --dir frontend test -- ChatLoadingState
```

Expected: FAIL because `ChatLoadingState` still imports `DeferredStartupScreen`.

- [ ] **Step 3: Replace `ChatLoadingState` implementation**

Replace `frontend/src/features/chat/components/ChatLoadingState.tsx` with:

```tsx
import { useStartupSurfaceReport } from '../../tenant/startup/StartupSurfaceProvider'

type ChatLoadingStateProps = {
  userName?: string | null
}

export function ChatLoadingState({ userName }: ChatLoadingStateProps) {
  useStartupSurfaceReport({
    active: true,
    description: 'Подключаем переписку и последние сообщения.',
    phase: 'chat',
    showChatPreview: true,
    statusLabel: 'Готовим чат',
    userName,
  })

  return null
}
```

- [ ] **Step 4: Wrap chat page route harness in coordinator**

In `frontend/src/test/chatPageTestHarness.tsx`, add imports:

```tsx
import {
  StartupSurfaceOverlay,
  StartupSurfaceProvider,
} from '../features/tenant/startup/StartupSurfaceProvider'
```

Change `renderChatRoute` to:

```tsx
export function renderChatRoute(ui: ReactElement = <AppRoutes />) {
  renderWithRouter(
    <StartupSurfaceProvider>
      <TenantIdentityContext.Provider value={tenantContextValue}>
        <AuthSessionProvider>{ui}</AuthSessionProvider>
      </TenantIdentityContext.Provider>
      <StartupSurfaceOverlay />
    </StartupSurfaceProvider>,
    { initialEntries: ['/app/chat'] },
  )
}
```

- [ ] **Step 5: Run chat loading and chat page tests**

Run:

```bash
pnpm --dir frontend test -- ChatLoadingState ChatPage.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit checkpoint if executing interactively**

```bash
git add frontend/src/features/chat/components/ChatLoadingState.tsx frontend/src/features/chat/components/ChatLoadingState.test.tsx frontend/src/test/chatPageTestHarness.tsx
git commit -m "feat(frontend): coordinate chat startup surface"
```

---

## Task 7: Remove Old Startup Gate

**Files:**

- Delete: `frontend/src/features/tenant/components/StartupScreenGate.tsx`
- Delete: `frontend/src/features/tenant/components/StartupScreenGate.test.tsx`

- [ ] **Step 1: Search old gate usage**

Run:

```bash
rg "StartupScreenGate|DeferredStartupScreen" frontend/src
```

Expected after Tasks 1-6: only `StartupScreenGate.tsx` and
`StartupScreenGate.test.tsx`, or no matches.

- [ ] **Step 2: Delete old gate after search shows no production imports**

If the only matches are the old gate file and its test, delete both files:

```bash
rm frontend/src/features/tenant/components/StartupScreenGate.tsx
rm frontend/src/features/tenant/components/StartupScreenGate.test.tsx
```

- [ ] **Step 3: Run search again**

Run:

```bash
rg "StartupScreenGate|DeferredStartupScreen" frontend/src
```

Expected: command exits with no matches.

- [ ] **Step 4: Run targeted frontend tests**

Run:

```bash
pnpm --dir frontend test -- StartupSurfaceProvider TenantProvider LoginPage ChatLoadingState
```

Expected: PASS.

- [ ] **Step 5: Commit checkpoint if executing interactively**

```bash
git add frontend/src/features/tenant/components frontend/src/features/tenant/startup frontend/src/app frontend/src/features/auth frontend/src/features/chat
git commit -m "refactor(frontend): remove nested startup gate"
```

---

## Task 8: Align Initial Background With Manifest

**Files:**

- Modify: `frontend/src/index.css`
- Modify: `frontend/index.html`
- Modify: `frontend/src/indexCss.test.ts`

- [ ] **Step 1: Update CSS test**

In `frontend/src/indexCss.test.ts`, add an assertion that the initial body
background uses `#f3f7fc`.

Use this assertion inside the existing CSS content test:

```ts
expect(css).toContain('body {')
expect(css).toContain('background: #f3f7fc;')
```

- [ ] **Step 2: Run CSS test and confirm failure**

Run:

```bash
pnpm --dir frontend test -- indexCss
```

Expected: FAIL because body background is still `#ffffff`.

- [ ] **Step 3: Update CSS and HTML initial body background**

In `frontend/src/index.css`, change:

```css
body {
  background: #ffffff;
  margin: 0;
}
```

to:

```css
body {
  background: #f3f7fc;
  margin: 0;
}
```

In `frontend/index.html`, change inline startup style:

```html
<style>
  body {
    background: #f3f7fc;
  }
</style>
```

- [ ] **Step 4: Run CSS test**

Run:

```bash
pnpm --dir frontend test -- indexCss
```

Expected: PASS.

- [ ] **Step 5: Commit checkpoint if executing interactively**

```bash
git add frontend/src/index.css frontend/index.html frontend/src/indexCss.test.ts
git commit -m "fix(frontend): align startup background with pwa splash"
```

---

## Task 9: Add Route-Level Regression Coverage For One Surface

**Files:**

- Modify: `frontend/src/features/auth/pages/LoginPage.test.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.test.tsx`

- [ ] **Step 1: Add auth route regression**

In `frontend/src/features/auth/pages/LoginPage.test.tsx`, add a test near the
existing startup tests:

```tsx
it('keeps one startup heading while checking public auth session', () => {
  vi.useFakeTimers()
  fetchMock.mockReturnValueOnce(new Promise(() => {}))

  renderAuthRoutes(['/auth/login'])

  act(() => {
    vi.advanceTimersByTime(450)
  })

  expect(
    screen.getAllByRole('heading', { name: 'Открываем кабинет' }),
  ).toHaveLength(1)
  expect(screen.getByText('Проверяем сессию')).toBeInTheDocument()
})
```

- [ ] **Step 2: Add chat route regression**

In `frontend/src/features/chat/pages/ChatPage.test.tsx`, add this
startup-focused test after `mockInitialReadyChatResponses` and before the first
ready transcript test:

```tsx
it('shows one unified startup surface while initial chat runtime is loading', async () => {
  vi.useFakeTimers()
  fetchMock
    .mockResolvedValueOnce(createAuthenticatedUserResponse())
    .mockReturnValueOnce(new Promise<Response>(() => {}))

  renderChatRoute()

  await act(async () => {
    await vi.advanceTimersByTimeAsync(450)
  })

  expect(
    screen.getAllByRole('heading', { name: 'Добро пожаловать, Portal' }),
  ).toHaveLength(1)
  expect(screen.getByText('Готовим чат')).toBeInTheDocument()
})
```

- [ ] **Step 3: Run route regression tests**

Run:

```bash
pnpm --dir frontend test -- LoginPage ChatPage.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Commit checkpoint if executing interactively**

```bash
git add frontend/src/features/auth/pages/LoginPage.test.tsx frontend/src/features/chat/pages/ChatPage.test.tsx
git commit -m "test(frontend): cover unified startup route flows"
```

---

## Task 10: Final Verification And Review

**Files:**

- All changed frontend files.

- [ ] **Step 1: Search for old nested startup imports**

Run:

```bash
rg "StartupScreenGate|DeferredStartupScreen" frontend/src
```

Expected: no matches.

- [ ] **Step 2: Run targeted frontend tests**

Run:

```bash
pnpm --dir frontend test -- StartupSurfaceProvider TenantProvider LoginPage ChatLoadingState ChatPage.test.tsx indexCss
```

Expected: PASS.

- [ ] **Step 3: Run frontend typecheck**

Run:

```bash
pnpm --dir frontend typecheck
```

Expected: PASS.

- [ ] **Step 4: Run frontend build**

Run:

```bash
pnpm --dir frontend build
```

Expected: PASS and service worker stamping completes.

- [ ] **Step 5: Run root lint/code-health**

Run:

```bash
pnpm lint
```

Expected: PASS.

- [ ] **Step 6: Run whitespace check**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 7: Code review checklist**

Review changed files and verify:

- one root `StartupSurfaceOverlay` exists;
- tenant/session/route/chat phases report into coordinator;
- no provider/route renders its own full-screen startup screen;
- explicit tenant/auth recovery screens still render without startup spinner;
- protected content is not visible before `status === 'authenticated'`;
- body background and manifest background are aligned;
- `ChatLoadingState` no longer forces `title="Открываем кабинет"`;
- no unrelated auth form, backend or service worker behavior changed.

- [ ] **Step 8: Work-log decision**

Do not update `docs/roadmap/work-log.md` for this slice unless the completed
implementation is deployed or accepted as a durable PWA startup baseline
change. If it is accepted as a durable baseline, add one short bullet under
`Chat Thread Planning` or `UI/UX Baseline` and keep a single
`Recommended Next Step` block at the end.

- [ ] **Step 9: Final commit checkpoint**

Commit only after implementation, review, fixes and checks:

```bash
git status --short
git add frontend/src frontend/index.html docs/roadmap/work-log.md
git commit -m "feat(frontend): unify startup surface"
```

If `docs/roadmap/work-log.md` was not changed, omit it from `git add`.

---

## Required Closure Flow

Before declaring implementation complete:

1. Implementation tasks are complete.
2. A code review of affected startup/frontend areas is done.
3. Findings from review are fixed or explicitly deferred.
4. Targeted tests pass after fixes.
5. Required frontend checks pass or blocker is recorded.
6. `docs/roadmap/work-log.md` is updated only if this becomes durable baseline.
7. A checkpoint commit is offered.
