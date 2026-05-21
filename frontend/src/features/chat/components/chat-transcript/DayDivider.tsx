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
      <div className="h-px flex-1 bg-slate-100" />
      <span className="rounded-full border border-slate-200/80 bg-white/80 px-2.5 py-0.5 text-[11px] font-normal text-slate-500 shadow-sm shadow-slate-900/[0.03]">
        {label}
      </span>
      <div className="h-px flex-1 bg-slate-100" />
    </div>
  )
}
