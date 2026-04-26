import type { ReactNode } from 'react'

type PortalFrameProps = {
  children: ReactNode
}

export function PortalFrame({ children }: PortalFrameProps) {
  return (
    <main className="app-viewport-shell bg-slate-200 text-slate-900 antialiased">
      <div className="app-viewport-shell mx-auto flex w-full items-center justify-center sm:p-6">
        <div className="portal-shell app-viewport-shell relative flex w-full flex-col overflow-hidden bg-white sm:min-h-[920px] sm:max-w-[750px] sm:rounded-[28px] sm:shadow-shell lg:h-[calc(100vh-48px)] lg:max-h-[1060px]">
          <div className="portal-corner portal-corner--tl" />
          <div className="portal-corner portal-corner--tr" />
          <div className="portal-dot-grid hidden sm:block" />

          <div className="app-safe-bottom app-safe-top relative z-10 flex flex-1 items-center justify-center px-6 sm:px-10 sm:pt-8">
            {children}
          </div>
        </div>
      </div>
    </main>
  )
}
