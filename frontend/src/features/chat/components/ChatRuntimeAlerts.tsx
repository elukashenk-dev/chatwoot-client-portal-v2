import { InlineAlert } from '../../../shared/ui/InlineAlert'

type ChatRuntimeAlertsProps = {
  cachedSavedAt?: string | null
  hasQueuedSends?: boolean
  isOnline: boolean
  isRealtimeSupported: boolean
  isUsingCachedData?: boolean
  resyncStatus: 'idle' | 'resyncing' | 'error'
}

export function ChatRuntimeAlerts({
  cachedSavedAt,
  hasQueuedSends = false,
  isOnline,
  isRealtimeSupported,
  isUsingCachedData = false,
  resyncStatus,
}: ChatRuntimeAlertsProps) {
  const messages = []

  if (isOnline && resyncStatus === 'resyncing') {
    messages.push({
      message: 'Соединение восстановлено. Обновляем чат...',
      tone: 'info' as const,
    })
  } else if (isOnline && resyncStatus === 'error') {
    messages.push({
      message:
        'Не удалось обновить чат после восстановления соединения. Попробуйте еще раз.',
      tone: 'error' as const,
    })
  }

  if (isUsingCachedData) {
    messages.push({
      message: isOnline
        ? 'Показываем сохраненные данные. Обновляем чат после восстановления связи.'
        : cachedSavedAt
          ? 'Нет соединения. Показываем сохраненные данные. Обновим чат после восстановления связи.'
          : 'Нет соединения. Показываем сохраненные данные.',
      tone: 'info' as const,
    })
  }

  if (hasQueuedSends) {
    messages.push({
      message: 'Сообщения будут отправлены, когда соединение восстановится.',
      tone: 'info' as const,
    })
  }

  if (isOnline && !isRealtimeSupported) {
    messages.push({
      message:
        'Автообновление недоступно в этом браузере. При необходимости обновите чат вручную.',
      tone: 'info' as const,
    })
  }

  if (messages.length === 0) {
    return null
  }

  return (
    <div className="relative z-10 border-b border-slate-200/70 bg-white/80 px-4 py-3 backdrop-blur-sm sm:px-6">
      <div className="mx-auto flex w-full max-w-[620px] flex-col gap-2">
        {messages.map((item) => (
          <InlineAlert
            key={item.message}
            message={item.message}
            tone={item.tone}
          />
        ))}
      </div>
    </div>
  )
}
