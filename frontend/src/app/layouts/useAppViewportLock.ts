import { useLayoutEffect } from 'react'

const APP_VIEWPORT_HEIGHT_VAR = '--portal-app-viewport-height'
const APP_VIEWPORT_WIDTH_VAR = '--portal-app-viewport-width'
const APP_VIEWPORT_OFFSET_LEFT_VAR = '--portal-app-viewport-offset-left'
const APP_VIEWPORT_OFFSET_TOP_VAR = '--portal-app-viewport-offset-top'
const APP_SHELL_SCROLL_LOCK_CLASS = 'app-shell-scroll-lock'
const VIEWPORT_JITTER_THRESHOLD_PX = 8

type ViewportMetrics = {
  height: number
  offsetLeft: number
  offsetTop: number
  width: number
}

function hasMeaningfulViewportChange(
  previous: ViewportMetrics | null,
  next: ViewportMetrics,
) {
  if (!previous) {
    return true
  }

  return (
    Math.abs(next.height - previous.height) >= VIEWPORT_JITTER_THRESHOLD_PX ||
    Math.abs(next.width - previous.width) >= VIEWPORT_JITTER_THRESHOLD_PX ||
    Math.abs(next.offsetLeft - previous.offsetLeft) >=
      VIEWPORT_JITTER_THRESHOLD_PX ||
    Math.abs(next.offsetTop - previous.offsetTop) >=
      VIEWPORT_JITTER_THRESHOLD_PX
  )
}

export function useAppViewportLock() {
  useLayoutEffect(() => {
    const rootElement = document.documentElement
    const bodyElement = document.body
    const visualViewport = window.visualViewport
    let activeMetrics: ViewportMetrics | null = null

    function syncViewportMetrics() {
      const nextMetrics = {
        height: visualViewport?.height ?? window.innerHeight,
        offsetLeft: visualViewport?.offsetLeft ?? 0,
        offsetTop: visualViewport?.offsetTop ?? 0,
        width: visualViewport?.width ?? window.innerWidth,
      }

      if (!hasMeaningfulViewportChange(activeMetrics, nextMetrics)) {
        return
      }

      activeMetrics = nextMetrics

      rootElement.style.setProperty(
        APP_VIEWPORT_HEIGHT_VAR,
        `${nextMetrics.height}px`,
      )
      rootElement.style.setProperty(
        APP_VIEWPORT_WIDTH_VAR,
        `${nextMetrics.width}px`,
      )
      rootElement.style.setProperty(
        APP_VIEWPORT_OFFSET_LEFT_VAR,
        `${nextMetrics.offsetLeft}px`,
      )
      rootElement.style.setProperty(
        APP_VIEWPORT_OFFSET_TOP_VAR,
        `${nextMetrics.offsetTop}px`,
      )
    }

    rootElement.classList.add(APP_SHELL_SCROLL_LOCK_CLASS)
    bodyElement.classList.add(APP_SHELL_SCROLL_LOCK_CLASS)
    syncViewportMetrics()

    visualViewport?.addEventListener('resize', syncViewportMetrics)
    visualViewport?.addEventListener('scroll', syncViewportMetrics)
    window.addEventListener('resize', syncViewportMetrics)

    return () => {
      visualViewport?.removeEventListener('resize', syncViewportMetrics)
      visualViewport?.removeEventListener('scroll', syncViewportMetrics)
      window.removeEventListener('resize', syncViewportMetrics)
      rootElement.classList.remove(APP_SHELL_SCROLL_LOCK_CLASS)
      bodyElement.classList.remove(APP_SHELL_SCROLL_LOCK_CLASS)
      rootElement.style.removeProperty(APP_VIEWPORT_HEIGHT_VAR)
      rootElement.style.removeProperty(APP_VIEWPORT_WIDTH_VAR)
      rootElement.style.removeProperty(APP_VIEWPORT_OFFSET_LEFT_VAR)
      rootElement.style.removeProperty(APP_VIEWPORT_OFFSET_TOP_VAR)
    }
  }, [])
}
