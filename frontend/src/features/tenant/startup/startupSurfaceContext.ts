import { createContext, useContext, useEffect, useId, useMemo } from 'react'

import type { AppStartupScreenProps } from '../components/AppStartupScreen'

export const STARTUP_SURFACE_SHOW_DELAY_MS = 450
export const STARTUP_SURFACE_MIN_VISIBLE_MS = 700
export const STARTUP_SURFACE_HANDOFF_GRACE_MS = 120

export type StartupSurfacePhase =
  | 'tenant_slow'
  | 'tenant'
  | 'session'
  | 'route'
  | 'chat'
  | 'offline_cached'

export type StartupSurfaceReport = Omit<AppStartupScreenProps, 'mode'> & {
  active: boolean
  phase: StartupSurfacePhase
}

export type StartupSurfaceContextValue = {
  currentSurface: AppStartupScreenProps | null
  removeReport: (id: string) => void
  updateReport: (id: string, report: StartupSurfaceReport) => void
}

export const StartupSurfaceContext =
  createContext<StartupSurfaceContextValue | null>(null)

export function useStartupSurfaceReport(report: StartupSurfaceReport) {
  const context = useContext(StartupSurfaceContext)
  const id = useId()
  const {
    active,
    description,
    phase,
    showChatPreview,
    statusLabel,
    title,
    userName,
  } = report
  const stableReport = useMemo(
    () => ({
      active,
      description,
      phase,
      showChatPreview,
      statusLabel,
      title,
      userName,
    }),
    [active, description, phase, showChatPreview, statusLabel, title, userName],
  )

  if (!context) {
    throw new Error(
      'useStartupSurfaceReport must be used inside StartupSurfaceProvider',
    )
  }

  const { removeReport, updateReport } = context

  useEffect(() => {
    updateReport(id, stableReport)
  }, [id, stableReport, updateReport])

  useEffect(
    () => () => {
      removeReport(id)
    },
    [id, removeReport],
  )
}
