import { InlineAlert } from '../../../shared/ui/InlineAlert'

type ChatRuntimeAlertsProps = {
  connectionStatus: 'connecting' | 'offline' | 'online'
  isChatAvailable?: boolean
  isRealtimeSupported: boolean
  queuedSendCount?: number
  resyncStatus: 'idle' | 'resyncing' | 'error'
}

function getQueuedMessageWord(count: number) {
  const absoluteCount = Math.abs(count)
  const lastTwoDigits = absoluteCount % 100
  const lastDigit = absoluteCount % 10

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return 'сообщений'
  }

  if (lastDigit === 1) {
    return 'сообщение'
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return 'сообщения'
  }

  return 'сообщений'
}

export function ChatRuntimeAlerts({
  connectionStatus,
  isChatAvailable = false,
  isRealtimeSupported,
  queuedSendCount = 0,
  resyncStatus,
}: ChatRuntimeAlertsProps) {
  let notice: {
    message: string
    tone: 'error' | 'info' | 'warning'
  } | null = null

  if (connectionStatus === 'online' && resyncStatus === 'resyncing') {
    notice = {
      message: 'Связь восстановилась. Обновляем чат...',
      tone: 'info',
    }
  } else if (connectionStatus === 'online' && resyncStatus === 'error') {
    notice = {
      message:
        'Не удалось обновить чат. Проверьте соединение и попробуйте снова.',
      tone: 'error',
    }
  } else if (connectionStatus === 'offline') {
    notice =
      queuedSendCount > 0
        ? {
            message: `Нет связи. ${queuedSendCount} ${getQueuedMessageWord(
              queuedSendCount,
            )} в очереди. Отправим, когда связь восстановится.`,
            tone: 'warning',
          }
        : {
            message: isChatAvailable
              ? 'Нет связи. Показываем сохраненные сообщения.'
              : 'Нет связи. Чат откроется после восстановления связи.',
            tone: 'warning',
          }
  } else if (connectionStatus === 'online' && !isRealtimeSupported) {
    notice = {
      message:
        'Автообновление недоступно в этом браузере. При необходимости обновите чат вручную.',
      tone: 'info',
    }
  }

  if (!notice) {
    return null
  }

  return (
    <div className="relative z-10 border-b border-slate-200/70 bg-white/80 px-4 py-3 backdrop-blur-sm sm:px-6">
      <div className="mx-auto w-full max-w-[620px]">
        <InlineAlert message={notice.message} tone={notice.tone} />
      </div>
    </div>
  )
}
