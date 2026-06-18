import { PhoneFilledIcon } from '../../../shared/ui/icons'
import { defaultSupportPhone, defaultSupportPhoneHref } from './supportContact'

export function AuthCompactSupport() {
  return (
    <aside aria-label="Помощь со входом" className="auth-flow-support">
      <p className="auth-flow-support__question">Нужна помощь?</p>
      <a className="auth-flow-support__phone" href={defaultSupportPhoneHref}>
        <PhoneFilledIcon className="auth-flow-support__phone-icon" />
        <span>{defaultSupportPhone}</span>
      </a>
    </aside>
  )
}
