import { Outlet } from 'react-router-dom'

import { useAppViewportLock } from './useAppViewportLock'

export function AppShellLayout() {
  useAppViewportLock()

  return (
    <main className="app-shell-viewport bg-slate-200 text-slate-900 antialiased">
      <div className="mx-auto flex h-full min-h-0 w-full items-center justify-center">
        <div className="portal-shell relative flex h-full min-h-0 w-full max-w-[500px] flex-col overflow-hidden bg-white">
          <div className="portal-corner portal-corner--tl" />
          <div className="portal-corner portal-corner--tr" />

          <Outlet />
        </div>
      </div>
    </main>
  )
}
