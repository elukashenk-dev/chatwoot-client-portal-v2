import { Link } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'

const legalHistoryBackState = { legalBackMode: 'history' } as const

export function AuthLegalNotice({ preview = false }: { preview?: boolean }) {
  if (preview) {
    return (
      <p className="auth-legal-text">
        Используя сервис, вы принимаете{' '}
        <span className="auth-legal-preview-link">
          Пользовательское соглашение
        </span>{' '}
        и подтверждаете, что ознакомлены с{' '}
        <span className="auth-legal-preview-link">
          Политикой обработки персональных данных
        </span>
        .
      </p>
    )
  }

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
