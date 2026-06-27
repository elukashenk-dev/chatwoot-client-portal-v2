import type { ChatThreadReason } from '../types'
import { ClockIcon, RefreshIcon } from '../../../shared/ui/icons'

const notReadyCopy: Record<
  Exclude<ChatThreadReason, 'none'>,
  { description: string; title: string }
> = {
  chatwoot_not_configured: {
    description:
      'Портал еще не получил полную конфигурацию сервиса поддержки для чтения переписки.',
    title: 'Чат временно недоступен',
  },
  chatwoot_unavailable: {
    description:
      'Мы не смогли получить состояние переписки из сервиса поддержки. Попробуйте обновить чат немного позже.',
    title: 'Чат временно недоступен',
  },
  contact_link_missing: {
    description:
      'Аккаунт авторизован, но профиль поддержки еще не связан с этим пользователем.',
    title: 'Чат не подключен',
  },
  conversation_mapping_unavailable: {
    description:
      'Backend не смог надежно зафиксировать выбранный разговор. Чат не будет открыт в неоднозначном состоянии.',
    title: 'Чат временно недоступен',
  },
  conversation_missing: {
    description:
      'Контакт найден, но в портальном inbox еще нет переписки. Первый разговор будет создан на этапе отправки сообщений.',
    title: 'Переписка пока не создана',
  },
  thread_access_denied: {
    description:
      'У вашей учетной записи нет доступа к выбранному чату. Обновите список чатов или обратитесь в поддержку.',
    title: 'Нет доступа к чату',
  },
  thread_invalid: {
    description:
      'Выбранный чат больше не подтверждается backend-моделью. Обновите чат, чтобы получить актуальное состояние.',
    title: 'Чат изменился',
  },
}

type ChatNotReadyStateProps = {
  isUnavailable: boolean
  onRetry: () => void
  reason: ChatThreadReason
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
            История сообщений появится здесь, когда backend подтвердит выбранный
            разговор.
          </div>
        </div>
      </section>
    </>
  )
}
