import { Link } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'

export function AuthSecondaryLinks() {
  return (
    <div className="auth-secondary-links">
      <Link to={routePaths.auth.passwordResetRequest}>Забыли пароль?</Link>
      <span aria-hidden="true" className="auth-secondary-links__separator" />
      <Link to={routePaths.auth.register}>Создать аккаунт</Link>
    </div>
  )
}
