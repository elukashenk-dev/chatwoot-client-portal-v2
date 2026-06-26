import { useEffect, useState } from 'react'

import { DownloadIcon } from '../shared/ui/icons'
import {
  PWA_INSTALL_MANUAL_INSTRUCTIONS_EVENT,
  usePwaInstallPrompt,
} from './installPromptContext'

export function PwaInstallBanner() {
  const { dismiss, install, state } = usePwaInstallPrompt()
  const [showIosInstructions, setShowIosInstructions] = useState(false)

  useEffect(() => {
    function handleManualInstructionsRequest() {
      setShowIosInstructions(true)
    }

    window.addEventListener(
      PWA_INSTALL_MANUAL_INSTRUCTIONS_EVENT,
      handleManualInstructionsRequest,
    )

    return () => {
      window.removeEventListener(
        PWA_INSTALL_MANUAL_INSTRUCTIONS_EVENT,
        handleManualInstructionsRequest,
      )
    }
  }, [])

  if (state.status !== 'available') {
    return null
  }

  async function handleInstall() {
    const result = await install()

    if (result === 'manual') {
      setShowIosInstructions(true)
    }
  }

  function handleDismiss() {
    setShowIosInstructions(false)
    dismiss()
  }

  return (
    <section
      aria-label="Установка приложения"
      className="relative z-20 mx-auto mb-2 w-full max-w-[620px] px-3 sm:px-6"
    >
      <div className="chat-floating-header-surface rounded-[10px] border px-3 py-3 text-[color:var(--portal-chat-header-foreground,#0f172a)] shadow-sm">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-white/70 text-brand-800">
            <DownloadIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold leading-5">
              Установите кабинет
            </h2>
            <p className="mt-0.5 text-xs leading-5 text-slate-600">
              Чат будет быстрее открываться и останется доступен при плохой
              связи.
            </p>

            {showIosInstructions ? (
              <ol className="mt-2 space-y-1 text-xs leading-5 text-slate-600">
                <li>Откройте портал в Safari.</li>
                <li>Нажмите «Поделиться».</li>
                <li>Выберите «На экран Домой».</li>
                <li>Нажмите «Добавить».</li>
              </ol>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {showIosInstructions ? (
            <button
              className="min-h-9 rounded-[9px] bg-brand-800 px-3 text-sm font-medium text-white transition hover:bg-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
              onClick={handleDismiss}
              type="button"
            >
              Понятно
            </button>
          ) : (
            <>
              <button
                className="min-h-9 rounded-[9px] px-3 text-sm font-medium text-slate-600 transition hover:bg-white/55 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
                onClick={handleDismiss}
                type="button"
              >
                Позже
              </button>
              <button
                className="inline-flex min-h-9 items-center gap-2 rounded-[9px] bg-brand-800 px-3 text-sm font-medium text-white transition hover:bg-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
                onClick={() => {
                  void handleInstall()
                }}
                type="button"
              >
                <DownloadIcon className="h-4 w-4" />
                Установить
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
