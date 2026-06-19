import { useLayoutEffect, useRef, type ReactNode } from 'react'

import { useAppViewportLock } from './useAppViewportLock'

type AuthFrameProps = {
  children: ReactNode
}

const TINY_AUTH_FRAME_OVERFLOW_THRESHOLD_PX = 8

function setTinyOverflowAttribute(scrollArea: HTMLElement) {
  const overflow = scrollArea.scrollHeight - scrollArea.clientHeight

  if (overflow > 0 && overflow <= TINY_AUTH_FRAME_OVERFLOW_THRESHOLD_PX) {
    scrollArea.dataset.tinyOverflow = 'true'
    return
  }

  delete scrollArea.dataset.tinyOverflow
}

function useAuthFrameTinyOverflowGuard() {
  const scrollAreaRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const scrollArea = scrollAreaRef.current

    if (!scrollArea) {
      return
    }

    const activeScrollArea: HTMLDivElement = scrollArea

    let frameId = 0
    let resizeObserver: ResizeObserver | null = null

    function syncTinyOverflowState() {
      frameId = 0
      setTinyOverflowAttribute(activeScrollArea)
    }

    function scheduleSync() {
      if (frameId) {
        cancelAnimationFrame(frameId)
      }

      frameId = requestAnimationFrame(syncTinyOverflowState)
    }

    function observeScrollableContent() {
      resizeObserver?.disconnect()

      if (typeof ResizeObserver !== 'function') {
        return
      }

      resizeObserver = new ResizeObserver(scheduleSync)
      resizeObserver.observe(activeScrollArea)

      for (const child of activeScrollArea.children) {
        resizeObserver.observe(child)
      }
    }

    const mutationObserver =
      typeof MutationObserver === 'function'
        ? new MutationObserver(() => {
            observeScrollableContent()
            scheduleSync()
          })
        : null

    observeScrollableContent()
    setTinyOverflowAttribute(activeScrollArea)
    scheduleSync()

    mutationObserver?.observe(activeScrollArea, {
      childList: true,
      subtree: true,
    })
    window.addEventListener('resize', scheduleSync)
    window.visualViewport?.addEventListener('resize', scheduleSync)

    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId)
      }

      mutationObserver?.disconnect()
      resizeObserver?.disconnect()
      window.removeEventListener('resize', scheduleSync)
      window.visualViewport?.removeEventListener('resize', scheduleSync)
      delete activeScrollArea.dataset.tinyOverflow
    }
  }, [])

  return scrollAreaRef
}

export function AuthFrame({ children }: AuthFrameProps) {
  useAppViewportLock()
  const scrollAreaRef = useAuthFrameTinyOverflowGuard()

  return (
    <main className="auth-frame-background app-shell-viewport text-slate-900 antialiased">
      <div className="mx-auto flex h-full min-h-0 w-full justify-center">
        <div
          className="auth-frame-scroll-area relative flex h-full min-h-0 w-full max-w-[500px] flex-col overflow-x-hidden overflow-y-auto overscroll-none"
          ref={scrollAreaRef}
        >
          {children}
        </div>
      </div>
    </main>
  )
}
