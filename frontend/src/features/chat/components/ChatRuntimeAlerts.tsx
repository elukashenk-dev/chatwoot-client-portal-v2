import { InlineAlert } from '../../../shared/ui/InlineAlert'

type ChatRuntimeAlertsProps = {
  isOnline: boolean
  isRealtimeSupported: boolean
  resyncStatus: 'idle' | 'resyncing' | 'error'
}

export function ChatRuntimeAlerts({
  isOnline,
  isRealtimeSupported,
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
