import { Link, useLocation } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'

const linkClassName = 'auth-secondary-link'

type AuthSecondaryLinksVariant = 'code-login' | 'password-login'

export function AuthSecondaryLinks({
  preview = false,
  variant = 'code-login',
}: {
  preview?: boolean
  variant?: AuthSecondaryLinksVariant
}) {
  if (preview) {
    if (variant === 'code-login') {
      return (
        <div className="auth-secondary-links auth-secondary-links--single">
          <span className={linkClassName}>Войти по паролю</span>
        </div>
      )
    }

    return (
      <div className="auth-secondary-links">
        <span className={linkClassName}>Войти по коду из почты</span>
        <span aria-hidden="true" className="auth-link-separator" />
        <span className={`${linkClassName} text-right`}>Забыли пароль?</span>
      </div>
    )
  }

  return <AuthSecondaryNavigationLinks variant={variant} />
}

function AuthSecondaryNavigationLinks({
  variant,
}: {
  variant: AuthSecondaryLinksVariant
}) {
  const location = useLocation()

  if (variant === 'password-login') {
    return (
      <div className="auth-secondary-links">
        <Link
          className={linkClassName}
          state={location.state}
          to={routePaths.auth.login}
        >
          Войти по коду из почты
        </Link>
        <span aria-hidden="true" className="auth-link-separator" />
        <Link
          className={`${linkClassName} text-right`}
          to={routePaths.auth.passwordResetRequest}
        >
          Забыли пароль?
        </Link>
      </div>
    )
  }

  return (
    <div className="auth-secondary-links auth-secondary-links--single">
      <Link
        className={linkClassName}
        state={location.state}
        to={routePaths.auth.passwordLogin}
      >
        Войти по паролю
      </Link>
    </div>
  )
}
