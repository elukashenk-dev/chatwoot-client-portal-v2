import { useEffect, useRef, useState } from 'react'

const KEYBOARD_OPEN_VIEWPORT_DELTA_PX = 120
const VIEWPORT_WIDTH_RESET_DELTA_PX = 32

type VisualViewportBaseline = {
  height: number
  width: number
}

export function useVisualViewportKeyboardOpen() {
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false)
  const baselineRef = useRef<VisualViewportBaseline | null>(null)

  useEffect(() => {
    if (!window.visualViewport) {
      return
    }

    const visualViewport = window.visualViewport

    function syncKeyboardState() {
      const viewportHeight = visualViewport.height
      const viewportWidth = visualViewport.width
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
      } else if (viewportHeight > baseline.height) {
        baselineHeight = viewportHeight
        baselineRef.current = {
          height: viewportHeight,
          width: viewportWidth,
        }
      }

      setIsKeyboardOpen(
        baselineHeight - viewportHeight > KEYBOARD_OPEN_VIEWPORT_DELTA_PX,
      )
    }

    syncKeyboardState()

    visualViewport.addEventListener('resize', syncKeyboardState)
    visualViewport.addEventListener('scroll', syncKeyboardState)
    window.addEventListener('resize', syncKeyboardState)

    return () => {
      visualViewport.removeEventListener('resize', syncKeyboardState)
      visualViewport.removeEventListener('scroll', syncKeyboardState)
      window.removeEventListener('resize', syncKeyboardState)
    }
  }, [])

  return isKeyboardOpen
}
