import { XIcon } from '../../../../shared/ui/icons'

import type { MessageComposerReplyTarget } from './types'

type ComposerReplyPreviewProps = {
  disabled: boolean
  onCancel: () => void
  replyTarget: MessageComposerReplyTarget
}

function getReplyPreviewText(replyTarget: MessageComposerReplyTarget) {
  return (
    replyTarget.content?.trim() ||
    replyTarget.attachmentName ||
    'Вложение без текста'
  )
}

export function ComposerReplyPreview({
  disabled,
  onCancel,
  replyTarget,
}: ComposerReplyPreviewProps) {
  return (
    <div className="mb-2 rounded-[0.9rem] border border-slate-200 bg-white px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-medium text-brand-800">
            Ответ на сообщение {replyTarget.authorName}
          </div>
          <div className="mt-0.5 line-clamp-2 text-[13px] leading-5 text-slate-500">
            {getReplyPreviewText(replyTarget)}
          </div>
        </div>
        <button
          aria-label="Отменить ответ"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.65rem] text-slate-400 transition hover:bg-slate-100 hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:text-slate-300"
          disabled={disabled}
          onClick={onCancel}
          title="Отменить ответ"
          type="button"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
