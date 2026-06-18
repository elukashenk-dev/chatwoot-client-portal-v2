import headsetIconUrl from '../../../assets/auth/headset.svg'
import { PhoneFilledIcon } from '../../../shared/ui/icons'
import { useBranding } from '../../branding/lib/useBranding'

export function AuthSupportBlock({ preview = false }: { preview?: boolean }) {
  const { branding } = useBranding()
  const { phoneDisplay, phoneHref } = branding.supportContact

  if (!phoneDisplay || !phoneHref) {
    return null
  }

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
          <span>{phoneDisplay}</span>
        </p>
      ) : (
        <a className="auth-support-phone" href={phoneHref}>
          <PhoneFilledIcon className="auth-support-phone-icon" />
          <span>{phoneDisplay}</span>
        </a>
      )}
    </aside>
  )
}
