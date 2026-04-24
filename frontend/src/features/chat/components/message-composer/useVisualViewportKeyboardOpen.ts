import { useEffect, useState } from 'react'

const KEYBOARD_OPEN_VIEWPORT_DELTA_PX = 120

export function useVisualViewportKeyboardOpen() {
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false)

  useEffect(() => {
    if (!window.visualViewport) {
      return
    }

    const visualViewport = window.visualViewport

    function syncKeyboardState() {
      setIsKeyboardOpen(
        window.innerHeight - visualViewport.height >
          KEYBOARD_OPEN_VIEWPORT_DELTA_PX,
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
