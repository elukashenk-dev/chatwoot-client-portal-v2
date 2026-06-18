import { cn } from '../lib/cn'

type InlineAlertTone = 'error' | 'info' | 'success' | 'warning'

type InlineAlertProps = {
  message?: string | null
  tone?: InlineAlertTone
}

const toneClassMap: Record<InlineAlertTone, string> = {
  error: 'auth-form-message--error',
  info: 'auth-form-message--info',
  success: 'auth-form-message--success',
  warning: 'auth-form-message--warning',
}

const phonePattern = /\+7\s*\(\d{3}\)\s*\d{2,3}(?:-\d{2,3}){1,2}/g

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
        'inline-alert-enter auth-form-message',
        toneClassMap[tone],
      )}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <span aria-hidden="true" className="auth-form-message__icon">
        {tone === 'success' ? (
          <svg fill="none" viewBox="0 0 16 16">
            <path
              d="m3.25 8.25 3 3 6.5-6.5"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.6"
            />
          </svg>
        ) : (
          <svg fill="none" viewBox="0 0 16 16">
            <circle
              cx="8"
              cy="8"
              r="6"
              stroke="currentColor"
              strokeWidth="1.4"
            />
            <path
              d="M8 7.25v4"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.4"
            />
            <circle cx="8" cy="4.7" fill="currentColor" r="0.75" />
          </svg>
        )}
      </span>
      <span className="auth-form-message__body">{renderMessage(message)}</span>
    </div>
  )
}
