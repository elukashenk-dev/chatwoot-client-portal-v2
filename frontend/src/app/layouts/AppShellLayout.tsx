import { Outlet } from 'react-router-dom'

import { useAppViewportLock } from './useAppViewportLock'

export function AppShellLayout() {
  useAppViewportLock()

  return (
    <main className="app-shell-viewport bg-slate-200 text-slate-900 antialiased">
      <div className="mx-auto flex h-full min-h-0 w-full items-center justify-center sm:p-6">
        <div className="portal-shell relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-white sm:max-w-[750px] sm:rounded-[28px] sm:shadow-shell lg:max-h-[1060px]">
          <div className="portal-corner portal-corner--tl" />
          <div className="portal-corner portal-corner--tr" />
          <div className="portal-dot-grid hidden sm:block" />

          <Outlet />
        </div>
      </div>
    </main>
  )
}
