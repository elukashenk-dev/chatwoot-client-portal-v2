import { Link, useLocation } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'

const linkClassName = 'auth-secondary-link'

type AuthSecondaryLinksVariant = 'code-login' | 'password-login'

function secondaryLinksClassName({
  className,
  single,
}: {
  className?: string
  single: boolean
}) {
  return [
    'auth-secondary-links',
    single ? 'auth-secondary-links--single' : null,
    className,
  ]
    .filter(Boolean)
    .join(' ')
}

export function AuthSecondaryLinks({
  className,
  preview = false,
  variant = 'code-login',
}: {
  className?: string
  preview?: boolean
  variant?: AuthSecondaryLinksVariant
}) {
  if (preview) {
    if (variant === 'code-login') {
      return (
        <div className={secondaryLinksClassName({ className, single: true })}>
          <span className={linkClassName}>Войти по паролю</span>
        </div>
      )
    }

    return (
      <div className={secondaryLinksClassName({ className, single: false })}>
        <span className={linkClassName}>Войти по коду</span>
        <span aria-hidden="true" className="auth-link-separator" />
        <span className={`${linkClassName} text-right`}>Забыли пароль?</span>
      </div>
    )
  }

  return <AuthSecondaryNavigationLinks className={className} variant={variant} />
}

function AuthSecondaryNavigationLinks({
  className,
  variant,
}: {
  className?: string
  variant: AuthSecondaryLinksVariant
}) {
  const location = useLocation()

  if (variant === 'password-login') {
    return (
      <div className={secondaryLinksClassName({ className, single: false })}>
        <Link
          className={linkClassName}
          state={location.state}
          to={routePaths.auth.login}
        >
          Войти по коду
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
    <div className={secondaryLinksClassName({ className, single: true })}>
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
