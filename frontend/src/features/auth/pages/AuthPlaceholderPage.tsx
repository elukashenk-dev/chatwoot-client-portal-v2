import { Link } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'
import { AuthShell } from '../../../shared/ui/AuthShell'
import { InlineAlert } from '../../../shared/ui/InlineAlert'

type AuthPlaceholderPageProps = {
  description: string
  title: string
}

export function AuthPlaceholderPage({
  description,
  title,
}: AuthPlaceholderPageProps) {
  return (
    <AuthShell description={description} title={title}>
      <div className="space-y-4">
        <InlineAlert
          message="Этот экран подключим следующим шагом. Сейчас он оставлен как живая заглушка, чтобы структура auth-маршрутов уже была рабочей."
          tone="info"
        />

        <div className="rounded-[0.9rem] border border-slate-200/80 bg-slate-50/90 px-4 py-4 text-sm leading-6 text-slate-600">
          В следующем auth-шаге здесь появятся реальные поля, состояния загрузки,
          валидация и связка с backend-контрактами.
        </div>

        <Link
          className="inline-flex min-h-11 items-center rounded-[0.75rem] px-3 text-sm font-medium text-brand-800 transition hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
          to={routePaths.auth.login}
        >
          Вернуться ко входу
        </Link>
      </div>
    </AuthShell>
  )
}
