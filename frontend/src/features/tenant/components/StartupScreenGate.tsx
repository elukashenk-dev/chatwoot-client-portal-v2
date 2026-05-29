import { useEffect, useState, type ReactNode } from 'react'

import {
  AppStartupScreen,
  type AppStartupScreenProps,
} from './AppStartupScreen'

export const STARTUP_SCREEN_SHOW_DELAY_MS = 450
export const STARTUP_SCREEN_MIN_VISIBLE_MS = 700

type StartupScreenGateProps = {
  active: boolean
  children?: ReactNode
  fallback: AppStartupScreenProps
  minVisibleMs?: number
  showAfterMs?: number
}

export function StartupScreenGate({
  active,
  children = null,
  fallback,
  minVisibleMs = STARTUP_SCREEN_MIN_VISIBLE_MS,
  showAfterMs = STARTUP_SCREEN_SHOW_DELAY_MS,
}: StartupScreenGateProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [canRelease, setCanRelease] = useState(false)
  const [visibleFallback, setVisibleFallback] =
    useState<AppStartupScreenProps | null>(null)

  useEffect(() => {
    if (!active || isVisible) {
      return undefined
    }

    const showTimer = window.setTimeout(() => {
      setVisibleFallback(fallback)
      setCanRelease(false)
      setIsVisible(true)
    }, showAfterMs)

    return () => {
      window.clearTimeout(showTimer)
    }
  }, [active, fallback, isVisible, showAfterMs])

  useEffect(() => {
    if (!active || !isVisible) {
      return undefined
    }

    const updateTimer = window.setTimeout(() => {
      setVisibleFallback(fallback)
    }, 0)

    return () => {
      window.clearTimeout(updateTimer)
    }
  }, [active, fallback, isVisible])

  useEffect(() => {
    if (!isVisible) {
      return undefined
    }

    const releaseTimer = window.setTimeout(() => {
      setCanRelease(true)
    }, minVisibleMs)

    return () => {
      window.clearTimeout(releaseTimer)
    }
  }, [isVisible, minVisibleMs])

  useEffect(() => {
    if (active || !isVisible || !canRelease) {
      return undefined
    }

    const cleanupTimer = window.setTimeout(() => {
      setIsVisible(false)
      setVisibleFallback(null)
    }, 0)

    return () => {
      window.clearTimeout(cleanupTimer)
    }
  }, [active, canRelease, isVisible])

  if (active) {
    return isVisible ? <AppStartupScreen {...fallback} /> : null
  }

  if (isVisible && !canRelease) {
    return visibleFallback ? <AppStartupScreen {...visibleFallback} /> : null
  }

  return <>{children}</>
}

export function DeferredStartupScreen(props: AppStartupScreenProps) {
  return <StartupScreenGate active fallback={props} />
}
