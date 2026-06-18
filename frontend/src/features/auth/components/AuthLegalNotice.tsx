import { Link } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'

const legalHistoryBackState = { legalBackMode: 'history' } as const

export function AuthLegalNotice() {
  return (
    <p className="auth-legal-text">
      Используя сервис, вы принимаете{' '}
      <Link state={legalHistoryBackState} to={routePaths.legal.terms}>
        Пользовательское соглашение
      </Link>{' '}
      и подтверждаете, что ознакомлены с{' '}
      <Link state={legalHistoryBackState} to={routePaths.legal.privacy}>
        Политикой обработки персональных данных
      </Link>
      .
    </p>
  )
}
