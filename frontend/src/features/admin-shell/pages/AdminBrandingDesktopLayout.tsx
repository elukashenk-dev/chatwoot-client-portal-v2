import {
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'

import { BrandingPreviewPane } from '../../admin-branding/components/BrandingPreviewPane'
import type { BrandingDraft } from '../../admin-branding/lib/brandingState'
import { InlineAlert } from '../../../shared/ui/InlineAlert'
import { ChevronLeftIcon, LogOutIcon } from '../../../shared/ui/icons'

const brandingSections = [
  {
    id: 'main',
    title: 'Основное',
  },
  {
    id: 'colors',
    title: 'Цвета',
  },
  {
    id: 'assets',
    title: 'Изображения',
  },
  {
    id: 'auth',
    title: 'Auth-экран',
  },
]

const expandedAdminSidebarWidthRem = 15
const collapsedAdminSidebarWidthRem = 4.5
const previewWidth = {
  default: 28,
  max: 36,
  min: 25,
  step: 1,
} as const

type AdminBrandingDesktopLayoutProps = {
  adminEmail: string
  children: ReactNode
  draft: BrandingDraft | null
  isSigningOut: boolean
  logoutError: string | null
  onLogout: () => void
}

function clampPreviewWidth(value: number) {
  return Math.min(previewWidth.max, Math.max(previewWidth.min, value))
}

export function AdminBrandingDesktopLayout({
  adminEmail,
  children,
  draft,
  isSigningOut,
  logoutError,
  onLogout,
}: AdminBrandingDesktopLayoutProps) {
  const [isAdminNavCollapsed, setIsAdminNavCollapsed] = useState(false)
  const [previewWidthRem, setPreviewWidthRem] = useState<number>(
    previewWidth.default,
  )
  const adminSidebarWidthRem = isAdminNavCollapsed
    ? collapsedAdminSidebarWidthRem
    : expandedAdminSidebarWidthRem
  const desktopGridTemplateColumns = `${adminSidebarWidthRem}rem minmax(0,1fr) ${previewWidthRem}rem`

  function adjustPreviewWidth(delta: number) {
    setPreviewWidthRem((currentWidth) =>
      clampPreviewWidth(currentWidth + delta),
    )
  }

  function handlePreviewResizeKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      adjustPreviewWidth(previewWidth.step)
      return
    }

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      adjustPreviewWidth(-previewWidth.step)
      return
    }

    if (event.key === 'Home') {
      event.preventDefault()
      setPreviewWidthRem(previewWidth.min)
      return
    }

    if (event.key === 'End') {
      event.preventDefault()
      setPreviewWidthRem(previewWidth.max)
    }
  }

  function handlePreviewResizePointerDown(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault()

    const resizeElement = event.currentTarget
    const startX = event.clientX
    const startWidth = previewWidthRem
    const pixelsPerRem =
      Number.parseFloat(
        window.getComputedStyle(document.documentElement).fontSize,
      ) || 16

    resizeElement.setPointerCapture?.(event.pointerId)

    function handlePointerMove(nextEvent: globalThis.PointerEvent) {
      const deltaRem = (startX - nextEvent.clientX) / pixelsPerRem

      setPreviewWidthRem(clampPreviewWidth(startWidth + deltaRem))
    }

    function stopPreviewResize(nextEvent: globalThis.PointerEvent) {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopPreviewResize)
      window.removeEventListener('pointercancel', stopPreviewResize)

      if (resizeElement.hasPointerCapture?.(nextEvent.pointerId)) {
        resizeElement.releasePointerCapture(nextEvent.pointerId)
      }
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopPreviewResize, { once: true })
    window.addEventListener('pointercancel', stopPreviewResize, { once: true })
  }

  return (
    <section
      aria-label="Макет админки брендинга"
      className="hidden h-screen min-h-0 overflow-hidden bg-slate-100 lg:grid"
      style={{
        gridTemplateColumns: desktopGridTemplateColumns,
        isolation: 'isolate',
      }}
    >
      <aside
        aria-label="Админ-консоль"
        className={[
          'sticky top-0 h-screen overflow-y-auto border-r border-slate-200 bg-white py-6 transition-[padding] duration-200',
          isAdminNavCollapsed ? 'px-3' : 'px-5',
        ].join(' ')}
        data-admin-branding-sidebar
      >
        {isAdminNavCollapsed ? (
          <div className="flex min-h-full flex-col items-center justify-between gap-4">
            <button
              aria-label="Развернуть меню админки"
              className="inline-flex h-10 w-10 items-center justify-center rounded-[0.6rem] border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50"
              onClick={() => {
                setIsAdminNavCollapsed(false)
              }}
              title="Развернуть меню админки"
              type="button"
            >
              <ChevronLeftIcon className="h-4 w-4 rotate-180" />
            </button>

            <button
              aria-label="Выйти"
              className="inline-flex h-10 w-10 items-center justify-center rounded-[0.6rem] border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
              disabled={isSigningOut}
              onClick={onLogout}
              title="Выйти"
              type="button"
            >
              <LogOutIcon className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-normal text-brand-700">
                  Админ-консоль
                </p>
                <h1 className="mt-2 text-2xl font-semibold">Брендинг</h1>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {adminEmail}
                </p>
              </div>

              <button
                aria-label="Свернуть меню админки"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.6rem] border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50"
                onClick={() => {
                  setIsAdminNavCollapsed(true)
                }}
                title="Свернуть меню админки"
                type="button"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
            </div>

            <nav aria-label="Разделы админки" className="mt-8 space-y-2">
              {brandingSections.map((section) => (
                <a
                  className="block rounded-[0.6rem] px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
                  href={`#${section.id}`}
                  key={section.title}
                >
                  {section.title}
                </a>
              ))}
            </nav>

            <div className="mt-8 space-y-3">
              <InlineAlert message={logoutError} tone="error" />
              <button
                className="inline-flex w-full items-center justify-center gap-2 rounded-[0.6rem] border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                disabled={isSigningOut}
                onClick={onLogout}
                type="button"
              >
                <LogOutIcon className="h-4 w-4" />
                Выйти
              </button>
            </div>
          </>
        )}
      </aside>

      <section
        className="relative z-0 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden px-6 py-6"
        data-admin-branding-editor
      >
        <div className="mx-auto max-w-4xl">{children}</div>
      </section>

      <aside
        className="portal-preview-no-scrollbar relative sticky top-0 z-20 h-screen overflow-y-auto border-l border-slate-200 bg-white px-3 py-6 xl:px-5"
        data-admin-branding-preview
        id="admin-branding-preview-panel"
      >
        <div
          aria-controls="admin-branding-preview-panel"
          aria-label="Изменить ширину предпросмотра"
          aria-orientation="vertical"
          aria-valuemax={previewWidth.max}
          aria-valuemin={previewWidth.min}
          aria-valuenow={previewWidthRem}
          className="absolute left-0 top-0 z-50 flex h-full w-4 cursor-ew-resize touch-none select-none items-center justify-center bg-white/80 text-slate-300 outline-none transition hover:bg-slate-50 hover:text-slate-500 focus-visible:ring-2 focus-visible:ring-brand-500"
          onKeyDown={handlePreviewResizeKeyDown}
          onPointerDown={handlePreviewResizePointerDown}
          role="separator"
          tabIndex={0}
          title="Изменить ширину предпросмотра"
        >
          <span className="pointer-events-none h-12 w-1 rounded-full bg-current" />
        </div>

        {draft ? (
          <BrandingPreviewPane draft={draft} />
        ) : (
          <div className="rounded-[0.6rem] border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            Предпросмотр появится после загрузки настроек.
          </div>
        )}
      </aside>
    </section>
  )
}
