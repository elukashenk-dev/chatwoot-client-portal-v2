import { routePaths } from '../../../app/routePaths'

type LoginLocationState = {
  from?: {
    hash?: string
    pathname?: string
    search?: string
  }
}

export function getPostLoginPath(state: unknown) {
  const locationState = state as LoginLocationState | null
  const fromPathname = locationState?.from?.pathname

  if (!fromPathname?.startsWith(routePaths.app.root)) {
    return routePaths.app.chat
  }

  return `${fromPathname}${locationState?.from?.search ?? ''}${locationState?.from?.hash ?? ''}`
}
