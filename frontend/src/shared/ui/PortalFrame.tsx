import type { ReactNode } from 'react'

type PortalFrameProps = {
  children: ReactNode
}

export function PortalFrame({ children }: PortalFrameProps) {
  return (
    <main className="app-viewport-shell portal-frame-background bg-slate-200 text-slate-900 antialiased">
      <div className="app-viewport-shell mx-auto flex w-full items-center justify-center">
        <div className="portal-shell app-viewport-shell relative flex w-full max-w-[500px] flex-col overflow-hidden bg-white">
          <div className="app-safe-bottom app-safe-top relative z-10 flex flex-1 items-center justify-center px-6 sm:px-10 sm:pt-8">
            {children}
          </div>
        </div>
      </div>
    </main>
  )
}
