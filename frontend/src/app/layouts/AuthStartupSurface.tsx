import { cn } from '../../shared/lib/cn'
import { AuthFrame } from './AuthFrame'

type AuthStartupCanvasProps = {
  fillViewport?: boolean
}

export function AuthStartupCanvas({
  fillViewport = false,
}: AuthStartupCanvasProps) {
  return (
    <section
      aria-hidden="true"
      className={cn(
        'auth-canvas-background relative flex min-h-full w-full shrink-0',
        fillViewport && 'app-shell-viewport',
      )}
    >
      <div className="auth-background-overlay absolute inset-0 z-0" />
    </section>
  )
}

export function AuthStartupSurface() {
  return (
    <AuthFrame>
      <AuthStartupCanvas />
    </AuthFrame>
  )
}
