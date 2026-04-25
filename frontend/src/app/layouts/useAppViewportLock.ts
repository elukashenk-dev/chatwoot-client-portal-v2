import { useLayoutEffect, useRef } from 'react'

const APP_VIEWPORT_HEIGHT_VAR = '--portal-app-viewport-height'
const APP_VIEWPORT_WIDTH_VAR = '--portal-app-viewport-width'
const APP_VIEWPORT_OFFSET_LEFT_VAR = '--portal-app-viewport-offset-left'
const APP_VIEWPORT_OFFSET_TOP_VAR = '--portal-app-viewport-offset-top'
const APP_SHELL_SCROLL_LOCK_CLASS = 'app-shell-scroll-lock'
const KEYBOARD_OPEN_VIEWPORT_DELTA_PX = 120
const VIEWPORT_WIDTH_RESET_DELTA_PX = 32

type VisualViewportBaseline = {
  height: number
  width: number
}

export function useAppViewportLock() {
  const baselineRef = useRef<VisualViewportBaseline | null>(null)
  const keyboardOffsetTopRef = useRef<number | null>(null)

  useLayoutEffect(() => {
    const rootElement = document.documentElement
    const bodyElement = document.body
    const visualViewport = window.visualViewport

    function syncViewportMetrics() {
      const viewportHeight = visualViewport?.height ?? window.innerHeight
      const viewportWidth = visualViewport?.width ?? window.innerWidth
      const viewportOffsetLeft = visualViewport?.offsetLeft ?? 0
      const viewportOffsetTop = visualViewport?.offsetTop ?? 0
      const baseline = baselineRef.current
      let baselineHeight = baseline?.height ?? viewportHeight

      if (
        !baseline ||
        Math.abs(baseline.width - viewportWidth) > VIEWPORT_WIDTH_RESET_DELTA_PX
      ) {
        baselineHeight = viewportHeight
        baselineRef.current = {
          height: viewportHeight,
          width: viewportWidth,
        }
        keyboardOffsetTopRef.current = null
      } else if (viewportHeight > baseline.height) {
        baselineHeight = viewportHeight
        baselineRef.current = {
          height: viewportHeight,
          width: viewportWidth,
        }
      }

      const isKeyboardOpen =
        baselineHeight - viewportHeight > KEYBOARD_OPEN_VIEWPORT_DELTA_PX
      const lockedOffsetTop =
        keyboardOffsetTopRef.current ?? viewportOffsetTop

      if (isKeyboardOpen) {
        keyboardOffsetTopRef.current = lockedOffsetTop
      } else {
        keyboardOffsetTopRef.current = null
      }

      rootElement.style.setProperty(
        APP_VIEWPORT_HEIGHT_VAR,
        `${viewportHeight}px`,
      )
      rootElement.style.setProperty(APP_VIEWPORT_WIDTH_VAR, `${viewportWidth}px`)
      rootElement.style.setProperty(
        APP_VIEWPORT_OFFSET_LEFT_VAR,
        `${viewportOffsetLeft}px`,
      )
      rootElement.style.setProperty(
        APP_VIEWPORT_OFFSET_TOP_VAR,
        `${isKeyboardOpen ? lockedOffsetTop : viewportOffsetTop}px`,
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
      baselineRef.current = null
      keyboardOffsetTopRef.current = null
    }
  }, [])
}
