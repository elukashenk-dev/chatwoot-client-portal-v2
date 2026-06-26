import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
} from 'react'
import { Link } from 'react-router-dom'

import { ShieldLockIcon } from '../../../../shared/ui/icons'

type PasswordlessLogoutWarningDialogProps = {
  isLoggingOut: boolean
  onCancel: () => void
  onOpenProfile: () => void
  onConfirm: () => void
  profileTo: string
}

export function PasswordlessLogoutWarningDialog({
  isLoggingOut,
  onCancel,
  onOpenProfile,
  onConfirm,
  profileTo,
}: PasswordlessLogoutWarningDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null)
  const dialogRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    cancelButtonRef.current?.focus({ preventScroll: true })
  }, [])

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
      return
    }

    if (event.key !== 'Tab') {
      return
    }

    const focusableButtons = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled)',
      ) ?? [],
    )

    if (focusableButtons.length === 0) {
      return
    }

    const firstButton = focusableButtons[0]
    const lastButton = focusableButtons.at(-1)

    if (event.shiftKey && document.activeElement === firstButton) {
      event.preventDefault()
      lastButton?.focus({ preventScroll: true })
      return
    }

    if (!event.shiftKey && document.activeElement === lastButton) {
      event.preventDefault()
      firstButton?.focus({ preventScroll: true })
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 px-5 py-6">
      <section
        aria-labelledby="passwordless-logout-warning-title"
        aria-modal="true"
        className="w-full max-w-[340px] rounded-[8px] bg-white p-5 text-slate-900 shadow-2xl"
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-brand-50 text-brand-800">
            <ShieldLockIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2
              className="text-[17px] font-semibold leading-6 tracking-normal"
              id="passwordless-logout-warning-title"
            >
              Выйти из аккаунта?
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              У вас пока не задан пароль. После выхода вы сможете снова войти
              только по коду из почты. Задать пароль можно в{' '}
              <Link
                className="font-medium text-brand-800 underline underline-offset-4 transition hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
                onClick={onOpenProfile}
                to={profileTo}
              >
                профиле
              </Link>
              .
            </p>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-[8px] px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
            disabled={isLoggingOut}
            onClick={onCancel}
            ref={cancelButtonRef}
            type="button"
          >
            Остаться
          </button>
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-[8px] bg-brand-900 px-4 text-sm font-semibold text-white transition hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={isLoggingOut}
            onClick={onConfirm}
            type="button"
          >
            Выйти
          </button>
        </div>
      </section>
    </div>
  )
}
