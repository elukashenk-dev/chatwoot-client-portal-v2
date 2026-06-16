import { Link } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'

export function AuthLegalNotice() {
  return (
    <p className="auth-legal-text">
      Используя сервис, вы принимаете{' '}
      <Link to={routePaths.legal.terms}>Пользовательское соглашение</Link> и
      подтверждаете ознакомление с{' '}
      <Link to={routePaths.legal.privacy}>
        Политикой обработки персональных данных
      </Link>
      .
    </p>
  )
}
