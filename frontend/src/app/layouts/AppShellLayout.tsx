import { Outlet } from 'react-router-dom'

export function AppShellLayout() {
  return (
    <main className="min-h-screen bg-slate-200 text-slate-900 antialiased">
      <div className="mx-auto flex min-h-screen w-full items-center justify-center sm:p-6">
        <div className="portal-shell relative flex min-h-screen w-full flex-col overflow-hidden bg-white sm:min-h-[920px] sm:max-w-[750px] sm:rounded-[28px] sm:shadow-shell lg:h-[calc(100vh-48px)] lg:max-h-[1060px]">
          <div className="portal-corner portal-corner--tl" />
          <div className="portal-corner portal-corner--tr" />
          <div className="portal-dot-grid hidden sm:block" />

          <Outlet />
        </div>
      </div>
    </main>
  )
}
