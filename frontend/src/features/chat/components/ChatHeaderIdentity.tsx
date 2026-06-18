import { cn } from '../../../shared/lib/cn'
import { ChatAvatar } from './ChatAvatar'
import {
  ChatHeaderPresence,
  type ChatHeaderPresenceTone,
} from './ChatHeaderPresence'

type ChatHeaderIdentityProps = {
  avatarFallback: string
  avatarUrl?: string | null
  presenceLabel: string
  presenceTone: ChatHeaderPresenceTone
  subtitle: string
  title: string
  useResponsiveTitle?: boolean
}

export function ChatHeaderIdentity({
  avatarFallback,
  avatarUrl,
  presenceLabel,
  presenceTone,
  subtitle,
  title,
  useResponsiveTitle = true,
}: ChatHeaderIdentityProps) {
  return (
    <>
      <ChatAvatar
        alt={title}
        avatarUrl={avatarUrl}
        className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-brand-900 text-sm font-semibold tracking-wide text-white"
        title={title}
      >
        {avatarFallback}
      </ChatAvatar>

      <div className="min-w-0 flex-1 py-0.5">
        <h1
          className={cn(
            'truncate text-[16px] font-semibold leading-tight text-[color:var(--portal-chat-header-foreground,#0f172a)]',
            useResponsiveTitle ? 'sm:text-[17px]' : null,
          )}
        >
          {title}
        </h1>
        <ChatHeaderPresence
          label={presenceLabel}
          subtitle={subtitle}
          tone={presenceTone}
        />
      </div>
    </>
  )
}
