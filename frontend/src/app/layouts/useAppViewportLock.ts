import { useLayoutEffect } from 'react'

const APP_VIEWPORT_HEIGHT_VAR = '--portal-app-viewport-height'
const APP_VIEWPORT_OFFSET_TOP_VAR = '--portal-app-viewport-offset-top'
const APP_SHELL_SCROLL_LOCK_CLASS = 'app-shell-scroll-lock'

export function useAppViewportLock() {
  useLayoutEffect(() => {
    const rootElement = document.documentElement
    const bodyElement = document.body
    const visualViewport = window.visualViewport

    function syncViewportMetrics() {
      const viewportHeight = visualViewport?.height ?? window.innerHeight
      const viewportOffsetTop = visualViewport?.offsetTop ?? 0

      rootElement.style.setProperty(
        APP_VIEWPORT_HEIGHT_VAR,
        `${viewportHeight}px`,
      )
      rootElement.style.setProperty(
        APP_VIEWPORT_OFFSET_TOP_VAR,
        `${viewportOffsetTop}px`,
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
      rootElement.style.removeProperty(APP_VIEWPORT_OFFSET_TOP_VAR)
    }
  }, [])
}
