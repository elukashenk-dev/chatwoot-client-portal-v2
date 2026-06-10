import type { ReactNode } from 'react'

import { useAppViewportLock } from './useAppViewportLock'

type AuthFrameProps = {
  children: ReactNode
}

export function AuthFrame({ children }: AuthFrameProps) {
  useAppViewportLock()

  return (
    <main className="auth-frame-background app-shell-viewport bg-slate-200 text-slate-900 antialiased">
      <div className="mx-auto flex h-full min-h-0 w-full justify-center">
        <div className="relative flex h-full min-h-0 w-full max-w-[500px] flex-col overflow-x-hidden overflow-y-auto overscroll-none bg-white">
          {children}
        </div>
      </div>
    </main>
  )
}
