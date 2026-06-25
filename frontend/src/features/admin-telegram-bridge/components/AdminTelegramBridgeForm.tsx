import { useState, type FormEvent } from 'react'

import { InlineAlert } from '../../../shared/ui/InlineAlert'
import { setupTelegramBridge } from '../api/adminTelegramBridgeClient'

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Не удалось создать Telegram bridge.'
}

export function AdminTelegramBridgeForm() {
  const [chatwootInboxUrl, setChatwootInboxUrl] = useState('')
  const [telegramBotToken, setTelegramBotToken] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const canSubmit =
    chatwootInboxUrl.trim().length > 0 &&
    telegramBotToken.trim().length > 0 &&
    !isSubmitting

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!canSubmit) {
      return
    }

    setErrorMessage(null)
    setSuccessMessage(null)
    setIsSubmitting(true)

    try {
      await setupTelegramBridge({
        chatwootInboxUrl: chatwootInboxUrl.trim(),
        telegramBotToken: telegramBotToken.trim(),
      })
      setTelegramBotToken('')
      setSuccessMessage('Telegram bridge работает')
    } catch (error) {
      setTelegramBotToken('')
      setErrorMessage(getErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form
      className="rounded-[0.6rem] border border-slate-200 bg-white p-5 shadow-sm"
      onSubmit={(event) => {
        void handleSubmit(event)
      }}
    >
      <div className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            Chatwoot inbox URL
          </span>
          <input
            autoComplete="off"
            className="mt-2 block h-11 w-full appearance-none rounded-[0.55rem] border border-slate-200 bg-white px-3 text-sm text-slate-950 shadow-sm transition focus:border-brand-300 focus:outline-none focus:ring-4 focus:ring-brand-100 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
            disabled={isSubmitting}
            inputMode="url"
            onChange={(event) => {
              setChatwootInboxUrl(event.target.value)
              setErrorMessage(null)
              setSuccessMessage(null)
            }}
            placeholder="https://app.lancora.ru/app/accounts/1/settings/inboxes/17"
            type="url"
            value={chatwootInboxUrl}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            Telegram bot token
          </span>
          <input
            autoComplete="off"
            className="mt-2 block h-11 w-full appearance-none rounded-[0.55rem] border border-slate-200 bg-white px-3 text-sm text-slate-950 shadow-sm transition focus:border-brand-300 focus:outline-none focus:ring-4 focus:ring-brand-100 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
            disabled={isSubmitting}
            onChange={(event) => {
              setTelegramBotToken(event.target.value)
              setErrorMessage(null)
              setSuccessMessage(null)
            }}
            type="password"
            value={telegramBotToken}
          />
        </label>

        <InlineAlert message={errorMessage} tone="error" />
        <InlineAlert message={successMessage} tone="success" />

        <button
          className="inline-flex h-11 items-center justify-center rounded-[0.55rem] bg-brand-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={!canSubmit}
          type="submit"
        >
          {isSubmitting ? 'Создаем bridge' : 'Создать Telegram bridge'}
        </button>
      </div>
    </form>
  )
}
