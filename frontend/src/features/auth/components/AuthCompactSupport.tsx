import { PhoneFilledIcon } from '../../../shared/ui/icons'
import { useBranding } from '../../branding/lib/useBranding'

export function AuthCompactSupport() {
  const { branding } = useBranding()
  const { phoneDisplay, phoneHref } = branding.supportContact

  if (!phoneDisplay || !phoneHref) {
    return null
  }

  return (
    <aside aria-label="Помощь со входом" className="auth-flow-support">
      <p className="auth-flow-support__question">Нужна помощь?</p>
      <a className="auth-flow-support__phone" href={phoneHref}>
        <PhoneFilledIcon className="auth-flow-support__phone-icon" />
        <span>{phoneDisplay}</span>
      </a>
    </aside>
  )
}
