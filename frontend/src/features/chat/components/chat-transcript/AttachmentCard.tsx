import { FileTextIcon } from '../../../../shared/ui/icons'
import type { ChatAttachment } from '../../types'

import { formatAttachmentSize, isAudioAttachment } from './utils'

type AttachmentCardProps = {
  attachment: ChatAttachment
}

export function AttachmentCard({ attachment }: AttachmentCardProps) {
  if (isAudioAttachment(attachment) && attachment.url) {
    return (
      <div className="mt-2 rounded-[0.7rem] border border-slate-200 bg-white/80 px-3 py-3 text-left">
        <span className="block truncate text-[14px] font-medium text-slate-800">
          {attachment.name}
        </span>
        <span className="mt-0.5 block text-[12px] text-slate-500">
          AUDIO · {formatAttachmentSize(attachment.fileSize)}
        </span>
        <audio
          aria-label={`Голосовое сообщение ${attachment.name}`}
          className="mt-3 w-full min-w-[220px] max-w-full"
          controls
          preload="metadata"
          src={attachment.url}
        />
      </div>
    )
  }

  return (
    <a
      className="mt-2 flex items-start gap-3 rounded-[0.7rem] border border-slate-200 bg-white/80 px-3 py-3 text-left transition hover:border-brand-200 hover:bg-white"
      href={attachment.url || undefined}
      rel="noreferrer"
      target="_blank"
    >
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.75rem] bg-white text-brand-800 shadow-sm">
        <FileTextIcon />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-medium text-slate-800">
          {attachment.name}
        </span>
        <span className="mt-0.5 block text-[12px] text-slate-500">
          {attachment.fileType.toUpperCase()} ·{' '}
          {formatAttachmentSize(attachment.fileSize)}
        </span>
      </span>
    </a>
  )
}
