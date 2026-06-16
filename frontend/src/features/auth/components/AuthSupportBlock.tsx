import headsetIconUrl from '../../../assets/auth/headset.svg'
import { PhoneFilledIcon } from '../../../shared/ui/icons'

export function AuthSupportBlock() {
  return (
    <div className="auth-support-block">
      <div aria-hidden="true" className="auth-support-divider">
        <span />
        <img alt="" className="auth-support-icon" src={headsetIconUrl} />
        <span />
      </div>

      <p>Нет доступа к чату?</p>

      <a className="auth-support-phone" href="tel:+78000000000">
        <PhoneFilledIcon className="auth-support-phone-icon" />
        +7 (800) 000-00-00
      </a>
    </div>
  )
}
