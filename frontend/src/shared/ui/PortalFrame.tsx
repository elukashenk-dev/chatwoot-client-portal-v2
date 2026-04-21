import type { ReactNode } from 'react'

type PortalFrameProps = {
  children: ReactNode
  footer?: ReactNode
}

export function PortalFrame({ children, footer }: PortalFrameProps) {
  return (
    <main className="min-h-screen bg-slate-200 text-slate-900 antialiased">
      <div className="mx-auto flex min-h-screen w-full items-center justify-center sm:p-6">
        <div className="portal-shell relative flex min-h-screen w-full flex-col overflow-hidden bg-white sm:min-h-[920px] sm:max-w-[750px] sm:rounded-[28px] sm:shadow-shell lg:h-[calc(100vh-48px)] lg:max-h-[1060px]">
          <div className="portal-corner portal-corner--tl" />
          <div className="portal-corner portal-corner--tr" />
          <div className="portal-dot-grid hidden sm:block" />

          <div className="relative z-10 flex flex-1 items-center justify-center px-6 pb-24 pt-6 sm:px-10 sm:pb-28 sm:pt-8">
            {children}
          </div>

          {footer ? (
            <div className="absolute inset-x-0 bottom-0 z-10 px-4 pb-5 pt-4 sm:px-6">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  )
}
