import { cn } from '../lib/cn'

type InlineAlertTone = 'error' | 'info' | 'success'

type InlineAlertProps = {
  message?: string | null
  tone?: InlineAlertTone
}

const toneClassMap: Record<InlineAlertTone, string> = {
  error: 'border-amber-200 bg-amber-50 text-amber-900',
  info: 'border-brand-200 bg-brand-50 text-brand-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
}

export function InlineAlert({
  message,
  tone = 'error',
}: InlineAlertProps) {
  if (!message) {
    return null
  }

  return (
    <div
      className={cn(
        'inline-alert-enter rounded-[1rem] border px-4 py-3 text-sm leading-6',
        toneClassMap[tone],
      )}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      {message}
    </div>
  )
}
