import { useStartupSurfaceReport } from '../../tenant/startup/startupSurfaceContext'
import { useTenantIdentity } from '../../tenant/lib/useTenantIdentity'
import { createStartupSurfaceBrand } from '../../tenant/startup/startupSurfaceBrand'

type ChatLoadingStateProps = {
  userName?: string | null
}

export function ChatLoadingState({ userName }: ChatLoadingStateProps) {
  const { tenant } = useTenantIdentity()

  useStartupSurfaceReport({
    active: true,
    ...createStartupSurfaceBrand(tenant),
    description: 'Подключаем переписку и последние сообщения.',
    phase: 'chat',
    showChatPreview: true,
    statusLabel: 'Готовим чат',
    userName,
  })

  return null
}
