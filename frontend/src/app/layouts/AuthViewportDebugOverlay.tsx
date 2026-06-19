import { useEffect, useState } from 'react'

type ViewportDebugSnapshot = {
  auth: string
  body: string
  doc: string
  event: string
  shell: string
  scrollables: string
  viewport: string
}

function formatNumber(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) {
    return 'n/a'
  }

  return value.toFixed(1)
}

function formatElementMetrics(element: Element | null) {
  if (!(element instanceof HTMLElement)) {
    return 'missing'
  }

  const rect = element.getBoundingClientRect()
  const style = window.getComputedStyle(element)

  return [
    `top=${formatNumber(rect.top)}`,
    `bottom=${formatNumber(rect.bottom)}`,
    `h=${formatNumber(rect.height)}`,
    `client=${element.clientHeight}`,
    `scroll=${element.scrollHeight}`,
    `topScroll=${formatNumber(element.scrollTop)}`,
    `overflowY=${style.overflowY}`,
    `tiny=${element.dataset.tinyOverflow ?? 'no'}`,
  ].join(' ')
}

function collectViewportDebugSnapshot(event: string): ViewportDebugSnapshot {
  const rootElement = document.documentElement
  const bodyElement = document.body
  const visualViewport = window.visualViewport
  const shellElement = document.querySelector('.app-shell-viewport')
  const authScrollArea = document.querySelector('.auth-frame-scroll-area')
  const scrollables = Array.from(document.querySelectorAll('body, body *'))
    .filter((element): element is HTMLElement => {
      if (!(element instanceof HTMLElement)) {
        return false
      }

      return element.scrollHeight > element.clientHeight || element.scrollTop > 0
    })
    .slice(0, 6)
    .map((element) => {
      const className =
        typeof element.className === 'string'
          ? `.${element.className.trim().replace(/\s+/g, '.')}`
          : ''
      const label = `${element.tagName.toLowerCase()}${className}`

      return `${label} ${element.scrollTop}/${element.clientHeight}/${element.scrollHeight}`
    })
    .join(' | ')

  return {
    auth: formatElementMetrics(authScrollArea),
    body: [
      `client=${bodyElement.clientHeight}`,
      `scroll=${bodyElement.scrollHeight}`,
      `top=${formatNumber(bodyElement.scrollTop)}`,
      `overflowY=${window.getComputedStyle(bodyElement).overflowY}`,
    ].join(' '),
    doc: [
      `client=${rootElement.clientHeight}`,
      `scroll=${rootElement.scrollHeight}`,
      `top=${formatNumber(rootElement.scrollTop)}`,
      `overflowY=${window.getComputedStyle(rootElement).overflowY}`,
    ].join(' '),
    event,
    shell: formatElementMetrics(shellElement),
    scrollables: scrollables || 'none',
    viewport: [
      `inner=${window.innerWidth}x${window.innerHeight}`,
      `scrollY=${formatNumber(window.scrollY)}`,
      `vv=${formatNumber(visualViewport?.width)}x${formatNumber(
        visualViewport?.height,
      )}`,
      `vvOffset=${formatNumber(visualViewport?.offsetLeft)},${formatNumber(
        visualViewport?.offsetTop,
      )}`,
      `vvPage=${formatNumber(visualViewport?.pageLeft)},${formatNumber(
        visualViewport?.pageTop,
      )}`,
      `scale=${formatNumber(visualViewport?.scale)}`,
      `standalone=${
        window.matchMedia?.('(display-mode: standalone)').matches ? 'yes' : 'no'
      }`,
    ].join(' '),
  }
}

export function AuthViewportDebugOverlay() {
  const [snapshot, setSnapshot] = useState<ViewportDebugSnapshot>(() =>
    collectViewportDebugSnapshot('initial'),
  )

  useEffect(() => {
    let frameId = 0

    function sync(event: string) {
      if (frameId) {
        cancelAnimationFrame(frameId)
      }

      frameId = requestAnimationFrame(() => {
        frameId = 0
        setSnapshot(collectViewportDebugSnapshot(event))
      })
    }

    function handleWindowScroll() {
      sync('window.scroll')
    }

    function handleWindowResize() {
      sync('window.resize')
    }

    function handleVisualViewportScroll() {
      sync('visualViewport.scroll')
    }

    function handleVisualViewportResize() {
      sync('visualViewport.resize')
    }

    function handleTouchMove() {
      sync('touchmove')
    }

    window.addEventListener('scroll', handleWindowScroll, { passive: true })
    window.addEventListener('resize', handleWindowResize)
    window.addEventListener('touchmove', handleTouchMove, { passive: true })
    window.visualViewport?.addEventListener(
      'scroll',
      handleVisualViewportScroll,
    )
    window.visualViewport?.addEventListener(
      'resize',
      handleVisualViewportResize,
    )
    sync('mounted')

    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId)
      }

      window.removeEventListener('scroll', handleWindowScroll)
      window.removeEventListener('resize', handleWindowResize)
      window.removeEventListener('touchmove', handleTouchMove)
      window.visualViewport?.removeEventListener(
        'scroll',
        handleVisualViewportScroll,
      )
      window.visualViewport?.removeEventListener(
        'resize',
        handleVisualViewportResize,
      )
    }
  }, [])

  return (
    <aside
      aria-label="Viewport debug"
      className="fixed inset-x-2 bottom-2 z-[9999] max-h-[46vh] overflow-auto rounded-md bg-black/80 p-2 font-mono text-[10px] leading-snug text-white shadow-2xl"
    >
      <div>event: {snapshot.event}</div>
      <div>viewport: {snapshot.viewport}</div>
      <div>doc: {snapshot.doc}</div>
      <div>body: {snapshot.body}</div>
      <div>shell: {snapshot.shell}</div>
      <div>auth: {snapshot.auth}</div>
      <div>scrollables: {snapshot.scrollables}</div>
    </aside>
  )
}
