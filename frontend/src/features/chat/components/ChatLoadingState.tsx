import { useStartupSurfaceReport } from '../../tenant/startup/startupSurfaceContext'

type ChatLoadingStateProps = {
  userName?: string | null
}

export function ChatLoadingState({ userName }: ChatLoadingStateProps) {
  useStartupSurfaceReport({
    active: true,
    description: 'Подключаем переписку и последние сообщения.',
    phase: 'chat',
    showChatPreview: true,
    statusLabel: 'Готовим чат',
    userName,
  })

  return null
}
