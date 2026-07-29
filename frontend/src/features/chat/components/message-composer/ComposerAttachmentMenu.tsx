import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
  useState,
} from 'react'

import { PaperclipIcon } from '../../../../shared/ui/icons'
import {
  COMPOSER_ATTACHMENT_ACCEPT,
  type AttachmentDraftSource,
} from '../../lib/attachmentDraft'
import { ComposerSideButton } from './ComposerSideButton'

type ComposerAttachmentMenuProps = {
  disabled: boolean
  onFilesSelected: (
    files: readonly File[],
    source: AttachmentDraftSource,
  ) => void
  tabIndex?: number
}

export function ComposerAttachmentMenu({
  disabled,
  onFilesSelected,
  tabIndex,
}: ComposerAttachmentMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const dialogRef = useRef<HTMLElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const firstActionRef = useRef<HTMLButtonElement | null>(null)
  const mediaInputRef = useRef<HTMLInputElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (isOpen) {
      firstActionRef.current?.focus({ preventScroll: true })
    }
  }, [isOpen])

  function closeMenu() {
    setIsOpen(false)
    triggerRef.current?.focus({ preventScroll: true })
  }

  function openNativePicker(input: HTMLInputElement | null) {
    input?.click()
    closeMenu()
  }

  function handleFilesSelected(
    event: React.ChangeEvent<HTMLInputElement>,
    source: AttachmentDraftSource,
  ) {
    const files = Array.from(event.currentTarget.files ?? [])

    event.currentTarget.value = ''

    if (files.length > 0) {
      onFilesSelected(files, source)
    }

    triggerRef.current?.focus({ preventScroll: true })
  }

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeMenu()
      return
    }

    if (event.key !== 'Tab') {
      return
    }

    const actions = Array.from(
      dialogRef.current?.querySelectorAll<HTMLButtonElement>(
        'button:not(:disabled)',
      ) ?? [],
    )
    const firstAction = actions[0]
    const lastAction = actions.at(-1)

    if (event.shiftKey && document.activeElement === firstAction) {
      event.preventDefault()
      lastAction?.focus({ preventScroll: true })
    } else if (!event.shiftKey && document.activeElement === lastAction) {
      event.preventDefault()
      firstAction?.focus({ preventScroll: true })
    }
  }

  return (
    <div className="relative">
      <input
        accept="image/*,video/*"
        aria-hidden="true"
        aria-label="Фото и видео"
        className="sr-only"
        disabled={disabled}
        multiple
        onChange={(event) => handleFilesSelected(event, 'picker')}
        ref={mediaInputRef}
        tabIndex={-1}
        type="file"
      />
      <input
        accept="image/*"
        aria-hidden="true"
        aria-label="Камера"
        capture="environment"
        className="sr-only"
        disabled={disabled}
        onChange={(event) => handleFilesSelected(event, 'camera')}
        ref={cameraInputRef}
        tabIndex={-1}
        type="file"
      />
      <input
        accept={COMPOSER_ATTACHMENT_ACCEPT}
        aria-hidden="true"
        aria-label="Файл вложения"
        className="sr-only"
        disabled={disabled}
        multiple
        onChange={(event) => handleFilesSelected(event, 'picker')}
        ref={fileInputRef}
        tabIndex={-1}
        type="file"
      />

      <ComposerSideButton
        ariaExpanded={isOpen}
        ariaHaspopup="dialog"
        ariaLabel="Прикрепить файл"
        buttonRef={triggerRef}
        disabled={disabled}
        onClick={() => setIsOpen(true)}
        shape="control"
        tabIndex={tabIndex}
        title="Прикрепить файл"
      >
        <PaperclipIcon className="h-5 w-5" />
      </ComposerSideButton>

      {isOpen ? (
        <>
          <div
            aria-hidden="true"
            className="fixed inset-0 z-[70] bg-slate-950/35 sm:bg-transparent"
            onPointerDown={closeMenu}
          />
          <section
            aria-labelledby="composer-attachment-menu-title"
            aria-modal="true"
            className="fixed inset-x-0 bottom-0 z-[80] rounded-t-2xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-slate-900 shadow-2xl sm:absolute sm:bottom-12 sm:left-0 sm:right-auto sm:w-64 sm:rounded-xl sm:border sm:border-white/70 sm:p-3"
            onKeyDown={handleDialogKeyDown}
            ref={dialogRef}
            role="dialog"
          >
            <h2
              className="px-2 pb-2 text-sm font-semibold text-slate-700"
              id="composer-attachment-menu-title"
            >
              Добавить вложение
            </h2>
            <div className="grid gap-1">
              <button
                className="min-h-11 rounded-lg px-3 text-left text-sm font-medium transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
                onClick={() => openNativePicker(mediaInputRef.current)}
                ref={firstActionRef}
                type="button"
              >
                Фото и видео
              </button>
              <button
                className="min-h-11 rounded-lg px-3 text-left text-sm font-medium transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
                onClick={() => openNativePicker(cameraInputRef.current)}
                type="button"
              >
                Камера
              </button>
              <button
                className="min-h-11 rounded-lg px-3 text-left text-sm font-medium transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
                onClick={() => openNativePicker(fileInputRef.current)}
                type="button"
              >
                Файл
              </button>
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}
