import { AppWelcomeScreen } from '../../tenant/components/AppWelcomeScreen'

type ChatLoadingStateProps = {
  userName?: string | null
}

export function ChatLoadingState({ userName }: ChatLoadingStateProps) {
  return (
    <AppWelcomeScreen
      description="Подключаем переписку и последние сообщения."
      showChatPreview
      statusLabel="Готовим чат"
      title="Открываем кабинет"
      userName={userName}
    />
  )
}
