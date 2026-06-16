import headsetIconUrl from '../../../assets/auth/headset.svg'
import { PhoneFilledIcon } from '../../../shared/ui/icons'

const defaultSupportPhone = '+7 (800) 000-00-00'
const defaultSupportPhoneHref = 'tel:+78000000000'

export function AuthSupportBlock({ preview = false }: { preview?: boolean }) {
  return (
    <aside className="auth-support-block">
      <div aria-hidden="true" className="auth-support-divider">
        <span />
        <img alt="" className="auth-support-icon" src={headsetIconUrl} />
        <span />
      </div>

      <p className="auth-support-question">Нет доступа к чату?</p>

      {preview ? (
        <p className="auth-support-phone">
          <PhoneFilledIcon className="auth-support-phone-icon" />
          <span>{defaultSupportPhone}</span>
        </p>
      ) : (
        <a className="auth-support-phone" href={defaultSupportPhoneHref}>
          <PhoneFilledIcon className="auth-support-phone-icon" />
          <span>{defaultSupportPhone}</span>
        </a>
      )}
    </aside>
  )
}
