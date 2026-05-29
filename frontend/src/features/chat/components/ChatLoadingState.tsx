import { AppStartupScreen } from '../../tenant/components/AppStartupScreen'

type ChatLoadingStateProps = {
  userName?: string | null
}

export function ChatLoadingState({ userName }: ChatLoadingStateProps) {
  return (
    <AppStartupScreen
      description="Подключаем переписку и последние сообщения."
      showChatPreview
      statusLabel="Готовим чат"
      title="Открываем кабинет"
      userName={userName}
    />
  )
}
