import { DeferredStartupScreen } from '../../tenant/components/StartupScreenGate'

type ChatLoadingStateProps = {
  userName?: string | null
}

export function ChatLoadingState({ userName }: ChatLoadingStateProps) {
  return (
    <DeferredStartupScreen
      description="Подключаем переписку и последние сообщения."
      showChatPreview
      statusLabel="Готовим чат"
      title="Открываем кабинет"
      userName={userName}
    />
  )
}
