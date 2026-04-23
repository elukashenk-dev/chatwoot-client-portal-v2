import { FileTextIcon, XIcon } from '../../../../shared/ui/icons'

import { formatSelectedAttachmentSize } from './utils'

type ComposerAttachmentPreviewProps = {
  disabled: boolean
  file: File
  onRemove: () => void
}

export function ComposerAttachmentPreview({
  disabled,
  file,
  onRemove,
}: ComposerAttachmentPreviewProps) {
  return (
    <div className="mb-2 flex items-center gap-3 rounded-[0.8rem] border border-slate-200 bg-white px-3 py-2">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.7rem] bg-brand-50 text-brand-800">
        <FileTextIcon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-slate-800">
          {file.name}
        </span>
        <span className="mt-0.5 block text-[12px] text-slate-500">
          {formatSelectedAttachmentSize(file.size)}
        </span>
      </span>
      <button
        aria-label="Убрать файл"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.65rem] text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:text-slate-300"
        disabled={disabled}
        onClick={onRemove}
        title="Убрать файл"
        type="button"
      >
        <XIcon className="h-4 w-4" />
      </button>
    </div>
  )
}
