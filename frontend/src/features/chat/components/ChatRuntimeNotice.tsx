import { cn } from '../../../shared/lib/cn'
import { InfoIcon } from '../../../shared/ui/icons'

export type ChatRuntimeNoticeTone = 'error' | 'info' | 'warning'

type ChatRuntimeNoticeProps = {
  message: string
  tone: ChatRuntimeNoticeTone
}

const toneClassMap: Record<ChatRuntimeNoticeTone, string> = {
  error: 'chat-runtime-notice--error',
  info: 'chat-runtime-notice--info',
  warning: 'chat-runtime-notice--warning',
}

export function ChatRuntimeNotice({ message, tone }: ChatRuntimeNoticeProps) {
  return (
    <div
      className={cn(
        'chat-runtime-notice chat-glass-card-surface',
        toneClassMap[tone],
      )}
      data-chat-runtime-notice
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <span aria-hidden="true" className="chat-runtime-notice__icon">
        <InfoIcon className="h-4 w-4" />
      </span>
      <span className="chat-runtime-notice__body">{message}</span>
    </div>
  )
}
