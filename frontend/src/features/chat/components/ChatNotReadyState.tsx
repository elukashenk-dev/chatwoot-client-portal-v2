import type { ChatContextReason } from '../types'
import { CalendarIcon, ClockIcon, RefreshIcon } from '../../../shared/ui/icons'

const notReadyCopy: Record<
  Exclude<ChatContextReason, 'none'>,
  { description: string; title: string }
> = {
  chatwoot_not_configured: {
    description:
      'Backend еще не получил полную конфигурацию Chatwoot для чтения переписки.',
    title: 'Чат временно недоступен',
  },
  chatwoot_unavailable: {
    description:
      'Мы не смогли получить состояние переписки из Chatwoot. Попробуйте обновить чат немного позже.',
    title: 'Чат временно недоступен',
  },
  contact_link_missing: {
    description:
      'Аккаунт авторизован, но связь с Chatwoot contact еще не создана для этого пользователя.',
    title: 'Чат не подключен',
  },
  conversation_mapping_unavailable: {
    description:
      'Backend не смог надежно зафиксировать основной разговор. Чат не будет открыт в неоднозначном состоянии.',
    title: 'Чат временно недоступен',
  },
  conversation_missing: {
    description:
      'Контакт найден, но в портальном inbox еще нет переписки. Первый разговор будет создан на этапе отправки сообщений.',
    title: 'Переписка пока не создана',
  },
  primary_conversation_missing: {
    description:
      'Ранее выбранная переписка больше не подтверждается backend-моделью. Обновите чат, чтобы получить актуальное состояние.',
    title: 'Переписка изменилась',
  },
}

type ChatNotReadyStateProps = {
  isUnavailable: boolean
  onRetry: () => void
  reason: ChatContextReason
}

export function ChatNotReadyState({
  isUnavailable,
  onRetry,
  reason,
}: ChatNotReadyStateProps) {
  const copy =
    reason === 'none' ? notReadyCopy.conversation_missing : notReadyCopy[reason]

  return (
    <>
      <div className="border-b border-slate-200/70 px-5 py-3 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[0.7rem] border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-400"
            disabled
            title="Календарь сообщений будет подключен после read model"
            type="button"
          >
            <CalendarIcon />
            Календарь сообщений
          </button>

          <span className="rounded-full border border-brand-100 bg-brand-50 px-2.5 py-1 text-[12px] font-medium text-brand-700">
            Переписка не готова
          </span>
        </div>
      </div>

      <section className="flex-1 overflow-hidden px-4 py-5 sm:px-6 sm:py-6">
        <div className="mx-auto flex h-full w-full max-w-[620px] flex-col">
          <div className="mb-6 rounded-[1rem] border border-slate-200 bg-slate-50/90 px-5 py-5">
            <div className="flex items-start gap-4">
              <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.8rem] bg-brand-100 text-brand-800">
                <ClockIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-[16px] font-semibold text-slate-800">
                  {copy.title}
                </h2>
                <p className="mt-1 text-[14px] leading-6 text-slate-500">
                  {copy.description}
                </p>

                {isUnavailable ? (
                  <button
                    className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-[0.7rem] border border-slate-200 bg-white px-4 text-[13px] font-medium text-slate-700 transition hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
                    onClick={onRetry}
                    type="button"
                  >
                    <RefreshIcon />
                    Повторить
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex-1 rounded-[1rem] border border-dashed border-slate-200 bg-white/60 px-5 py-8 text-center text-[14px] leading-6 text-slate-500">
            История сообщений появится здесь, когда backend подтвердит основной
            разговор.
          </div>
        </div>
      </section>
    </>
  )
}
