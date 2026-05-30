import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import {
  AppStartupScreen,
  type AppStartupScreenProps,
} from '../components/AppStartupScreen'
import {
  STARTUP_SURFACE_HANDOFF_GRACE_MS,
  STARTUP_SURFACE_MIN_VISIBLE_MS,
  STARTUP_SURFACE_SHOW_DELAY_MS,
  StartupSurfaceContext,
  type StartupSurfacePhase,
  type StartupSurfaceReport,
} from './startupSurfaceContext'

const phasePriority: Record<StartupSurfacePhase, number> = {
  tenant_slow: 60,
  tenant: 50,
  session: 40,
  route: 30,
  chat: 20,
  offline_cached: 10,
}

function selectActiveReport(reports: Map<string, StartupSurfaceReport>) {
  return [...reports.values()]
    .filter((report) => report.active)
    .sort(
      (left, right) => phasePriority[right.phase] - phasePriority[left.phase],
    )[0]
}

function toScreenProps(report: StartupSurfaceReport): AppStartupScreenProps {
  return {
    description: report.description,
    mode: 'screen',
    showChatPreview: report.showChatPreview,
    statusLabel: report.statusLabel,
    title: report.title,
    userName: report.userName,
  }
}

export function StartupSurfaceProvider({ children }: { children: ReactNode }) {
  const [reports, setReports] = useState(
    new Map<string, StartupSurfaceReport>(),
  )
  const [isVisible, setIsVisible] = useState(false)
  const [canRelease, setCanRelease] = useState(false)
  const [visibleSurface, setVisibleSurface] =
    useState<AppStartupScreenProps | null>(null)
  const activeReport = useMemo(() => selectActiveReport(reports), [reports])

  const updateReport = useCallback(
    (id: string, report: StartupSurfaceReport) => {
      setReports((currentReports) => {
        const nextReports = new Map(currentReports)
        nextReports.set(id, report)
        return nextReports
      })
    },
    [],
  )

  const removeReport = useCallback((id: string) => {
    setReports((currentReports) => {
      const nextReports = new Map(currentReports)
      nextReports.delete(id)
      return nextReports
    })
  }, [])

  useEffect(() => {
    if (!activeReport || isVisible) {
      return undefined
    }

    const showTimer = window.setTimeout(() => {
      setVisibleSurface(toScreenProps(activeReport))
      setCanRelease(false)
      setIsVisible(true)
    }, STARTUP_SURFACE_SHOW_DELAY_MS)

    return () => {
      window.clearTimeout(showTimer)
    }
  }, [activeReport, isVisible])

  useEffect(() => {
    if (!activeReport || !isVisible) {
      return undefined
    }

    const updateTimer = window.setTimeout(() => {
      setVisibleSurface(toScreenProps(activeReport))
    }, 0)

    return () => {
      window.clearTimeout(updateTimer)
    }
  }, [activeReport, isVisible])

  useEffect(() => {
    if (!isVisible) {
      return undefined
    }

    const releaseTimer = window.setTimeout(() => {
      setCanRelease(true)
    }, STARTUP_SURFACE_MIN_VISIBLE_MS)

    return () => {
      window.clearTimeout(releaseTimer)
    }
  }, [isVisible])

  useEffect(() => {
    if (activeReport || !isVisible || !canRelease) {
      return undefined
    }

    const hideTimer = window.setTimeout(() => {
      setIsVisible(false)
      setVisibleSurface(null)
    }, STARTUP_SURFACE_HANDOFF_GRACE_MS)

    return () => {
      window.clearTimeout(hideTimer)
    }
  }, [activeReport, canRelease, isVisible])

  const value = useMemo(
    () => ({
      currentSurface: isVisible ? visibleSurface : null,
      removeReport,
      updateReport,
    }),
    [isVisible, removeReport, updateReport, visibleSurface],
  )

  return (
    <StartupSurfaceContext.Provider value={value}>
      {children}
    </StartupSurfaceContext.Provider>
  )
}

export function StartupSurfaceOverlay() {
  const context = useContext(StartupSurfaceContext)

  if (!context?.currentSurface) {
    return null
  }

  return (
    <div className="fixed inset-0 z-40 bg-brand-50">
      <AppStartupScreen {...context.currentSurface} />
    </div>
  )
}
