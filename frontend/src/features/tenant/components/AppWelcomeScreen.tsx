import {
  AppStartupScreen,
  type AppStartupScreenProps,
} from './AppStartupScreen'

type AppWelcomeScreenProps = AppStartupScreenProps

export function AppWelcomeScreen({
  mode = 'inline',
  ...props
}: AppWelcomeScreenProps) {
  return <AppStartupScreen mode={mode} {...props} />
}
