import { FileTextIcon, XIcon } from '../../../../shared/ui/icons'
import { CHAT_ATTACHMENT_MAX_FILES } from '../../lib/attachmentDraft'
import type { AttachmentDraftViewItem } from './useAttachmentDraft'
import { formatSelectedAttachmentSize } from './utils'

type ComposerAttachmentTrayProps = {
  disabled: boolean
  items: readonly AttachmentDraftViewItem[]
  onClear: () => void
  onRemove: (itemId: string) => void
  totalBytes: number
}

export function ComposerAttachmentTray({
  disabled,
  items,
  onClear,
  onRemove,
  totalBytes,
}: ComposerAttachmentTrayProps) {
  if (items.length === 0) {
    return null
  }

  return (
    <div
      className="mb-2 rounded-[0.9rem] border border-white/65 bg-white/60 px-2.5 py-2 shadow-sm shadow-slate-900/[0.04] backdrop-blur-md"
      data-composer-panel="attachments"
    >
      <div className="mb-2 flex items-center justify-between gap-3 px-0.5">
        <span
          aria-live="polite"
          className="text-[12px] font-medium text-slate-600"
        >
          {items.length}/{CHAT_ATTACHMENT_MAX_FILES} ·{' '}
          {formatSelectedAttachmentSize(totalBytes)}
        </span>
        <button
          aria-label="Очистить файлы"
          className="rounded-md px-1.5 py-1 text-[12px] font-medium text-slate-500 transition hover:bg-white/70 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:text-slate-300"
          disabled={disabled}
          onClick={onClear}
          type="button"
        >
          Очистить
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-0.5">
        {items.map((item) => (
          <div
            className="relative flex w-36 shrink-0 items-center gap-2 rounded-[0.75rem] bg-white/70 p-2 pr-8"
            key={item.id}
          >
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[0.65rem] bg-brand-50 text-brand-800">
              {item.previewUrl ? (
                <img
                  alt=""
                  className="h-full w-full object-cover"
                  src={item.previewUrl}
                />
              ) : (
                <FileTextIcon className="h-4 w-4" />
              )}
            </span>
            <span className="min-w-0">
              <span
                className="block truncate text-[12px] font-medium text-slate-800"
                title={item.file.name}
              >
                {item.file.name}
              </span>
              <span className="mt-0.5 block text-[11px] text-slate-500">
                {formatSelectedAttachmentSize(item.file.size)}
              </span>
            </span>
            <button
              aria-label={`Убрать файл ${item.file.name}`}
              className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-white hover:text-slate-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:text-slate-300"
              disabled={disabled}
              onClick={() => {
                onRemove(item.id)
              }}
              title={`Убрать файл ${item.file.name}`}
              type="button"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
