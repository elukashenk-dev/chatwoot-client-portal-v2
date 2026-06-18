import { Link } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'

const linkClassName = 'auth-secondary-link'

export function AuthSecondaryLinks({ preview = false }: { preview?: boolean }) {
  if (preview) {
    return (
      <div className="auth-secondary-links">
        <span className={linkClassName}>Забыли пароль?</span>
        <span aria-hidden="true" className="auth-link-separator" />
        <span className={`${linkClassName} text-right`}>Создать аккаунт</span>
      </div>
    )
  }

  return (
    <div className="auth-secondary-links">
      <Link
        className={linkClassName}
        to={routePaths.auth.passwordResetRequest}
      >
        Забыли пароль?
      </Link>
      <span aria-hidden="true" className="auth-link-separator" />
      <Link
        className={`${linkClassName} text-right`}
        to={routePaths.auth.register}
      >
        Создать аккаунт
      </Link>
    </div>
  )
}
