import { cn } from '../../../../shared/lib/cn'

export function DayDivider({
  className,
  label,
}: {
  className?: string
  label: string
}) {
  return (
    <div
      className={cn(
        'self-center flex w-full max-w-[500px] items-center gap-2.5 px-1',
        className,
      )}
    >
      <div className="h-px flex-1 bg-slate-300/40" />
      <span className="chat-muted-text rounded-full border border-white/45 bg-white/45 px-3 py-1 text-[11px] font-normal shadow-sm shadow-slate-900/[0.04] backdrop-blur-md">
        {label}
      </span>
      <div className="h-px flex-1 bg-slate-300/40" />
    </div>
  )
}
