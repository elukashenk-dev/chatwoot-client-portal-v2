import { cn } from '../lib/cn'

type InlineAlertTone = 'error' | 'info' | 'success'

type InlineAlertProps = {
  message?: string | null
  tone?: InlineAlertTone
}

const toneClassMap: Record<InlineAlertTone, string> = {
  error: 'border-[#f1d2d8] bg-[#fff9f9]/90 text-[#8f4350]',
  info: 'border-brand-200 bg-brand-50 text-brand-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
}

const phonePattern = /\+7\s*\(\d{3}\)\s*\d{2}-\d{3}-\d{2}/g

function getPhoneHref(phoneText: string) {
  const digits = phoneText.replace(/\D/g, '')

  return digits ? `tel:+${digits}` : undefined
}

function renderMessage(message: string) {
  const matches = [...message.matchAll(phonePattern)]

  if (matches.length === 0) {
    return message
  }

  const parts = []
  let previousIndex = 0

  for (const match of matches) {
    const phoneText = match[0]
    const matchIndex = match.index ?? previousIndex
    const phoneHref = getPhoneHref(phoneText)

    if (matchIndex > previousIndex) {
      parts.push(message.slice(previousIndex, matchIndex))
    }

    parts.push(
      phoneHref ? (
        <a
          className="font-normal text-inherit underline decoration-[#c98b96] underline-offset-2"
          href={phoneHref}
          key={`${phoneText}-${matchIndex}`}
        >
          {phoneText}
        </a>
      ) : (
        phoneText
      ),
    )

    previousIndex = matchIndex + phoneText.length
  }

  if (previousIndex < message.length) {
    parts.push(message.slice(previousIndex))
  }

  return parts
}

export function InlineAlert({ message, tone = 'error' }: InlineAlertProps) {
  if (!message) {
    return null
  }

  return (
    <div
      className={cn(
        'inline-alert-enter rounded-[0.6rem] border px-4 py-3 text-sm leading-6',
        toneClassMap[tone],
      )}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      {renderMessage(message)}
    </div>
  )
}
