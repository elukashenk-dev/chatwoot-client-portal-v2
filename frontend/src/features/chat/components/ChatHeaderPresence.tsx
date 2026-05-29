import { cn } from '../../../shared/lib/cn'
import type { SupportAvailabilityTone } from '../lib/chatSupportAvailability'

export type ChatHeaderPresenceTone = SupportAvailabilityTone | 'offline'

type ChatHeaderPresenceProps = {
  label: string
  subtitle: string
  tone: ChatHeaderPresenceTone
}

export function ChatHeaderPresence({
  label,
  subtitle,
  tone,
}: ChatHeaderPresenceProps) {
  return (
    <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[12px] leading-4 text-slate-500 sm:text-[13px]">
      <span className="hidden min-w-0 truncate sm:inline">{subtitle}</span>
      <span
        aria-hidden="true"
        className={cn(
          'h-1.5 w-1.5 shrink-0 rounded-full',
          tone === 'offline'
            ? 'bg-[#d34256] shadow-[0_0_0_2px_rgb(211_66_86_/_0.18)]'
            : tone === 'online'
              ? 'bg-[#46a266] shadow-[0_0_0_2px_rgb(70_162_102_/_0.14)]'
              : tone === 'later'
                ? 'bg-[#d6932c] shadow-[0_0_0_2px_rgb(214_147_44_/_0.14)]'
                : 'bg-slate-400 shadow-[0_0_0_2px_rgb(148_163_184_/_0.16)]',
        )}
      />
      <span
        aria-label={label}
        className={cn(
          'shrink-0 font-semibold',
          tone === 'offline'
            ? 'text-[#9f3141]'
            : tone === 'online'
              ? 'text-[#3f8a57]'
              : tone === 'later'
                ? 'text-[#a76712]'
                : 'text-slate-500',
        )}
        role="status"
        title={label}
      >
        {label}
      </span>
    </div>
  )
}
