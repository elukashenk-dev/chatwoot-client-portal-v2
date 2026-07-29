import { useRef, useState, type DragEvent, type ReactNode } from 'react'

type ChatAttachmentDropZoneProps = {
  children: ReactNode
  disabled: boolean
  onFiles: (files: File[]) => void
}

export function ChatAttachmentDropZone({
  children,
  disabled,
  onFiles,
}: ChatAttachmentDropZoneProps) {
  const dragDepthRef = useRef(0)
  const [isFileDragActive, setIsFileDragActive] = useState(false)

  function getFileItems(event: DragEvent<HTMLDivElement>) {
    return Array.from(event.dataTransfer.items).filter(
      (item) => item.kind === 'file',
    )
  }

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    if (disabled || getFileItems(event).length === 0) {
      return
    }

    event.preventDefault()
    dragDepthRef.current += 1
    setIsFileDragActive(true)
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!isFileDragActive) {
      return
    }

    event.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)

    if (dragDepthRef.current === 0) {
      setIsFileDragActive(false)
    }
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (disabled || getFileItems(event).length === 0) {
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    if (disabled) {
      return
    }

    const fileItems = getFileItems(event)

    if (fileItems.length === 0) {
      return
    }

    event.preventDefault()
    dragDepthRef.current = 0
    setIsFileDragActive(false)

    const files = fileItems
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null)

    if (files.length > 0) {
      onFiles(files)
    }
  }

  return (
    <div
      className="relative z-10 flex min-h-0 flex-1 flex-col bg-transparent"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}
      {isFileDragActive && !disabled ? (
        <div
          aria-live="polite"
          className="pointer-events-none absolute inset-3 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-brand-400 bg-white/90 p-6 text-center shadow-lg backdrop-blur-sm"
          role="status"
        >
          <div>
            <p className="text-base font-semibold text-brand-900">
              Перетащите файлы сюда
            </p>
            <p className="mt-1 text-sm text-slate-600">
              До 5 файлов, общий размер до 40 МБ
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
