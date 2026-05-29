import {
  AppStartupScreen,
  type AppStartupScreenMode,
} from './AppStartupScreen'

type TenantSplashScreenProps = {
  description?: string
  mode?: AppStartupScreenMode
  statusLabel?: string
  title?: string
}

export function TenantSplashScreen({
  description = 'Загружаем настройки.',
  mode = 'screen',
  statusLabel = 'Открываем кабинет',
  title = 'Открываем кабинет',
}: TenantSplashScreenProps) {
  return (
    <AppStartupScreen
      description={description}
      mode={mode}
      statusLabel={statusLabel}
      title={title}
    />
  )
}
