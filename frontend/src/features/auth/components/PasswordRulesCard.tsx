import { getPasswordRuleStates } from '../lib/passwordRules'

function PasswordRule({
  isSatisfied,
  label,
}: {
  isSatisfied: boolean
  label: string
}) {
  return (
    <div
      className={
        isSatisfied
          ? 'flex items-center gap-2 text-emerald-700'
          : 'flex items-center gap-2 text-slate-500'
      }
    >
      <span
        aria-hidden="true"
        className={
          isSatisfied
            ? 'inline-flex h-5 w-5 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-[11px]'
            : 'inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-[11px]'
        }
      >
        {isSatisfied ? '✓' : '•'}
      </span>
      <span>{label}</span>
    </div>
  )
}

export function PasswordRulesCard({
  confirmPassword,
  password,
}: {
  confirmPassword: string
  password: string
}) {
  const passwordRuleStates = getPasswordRuleStates(password, confirmPassword)

  return (
    <div className="rounded-[0.9rem] border border-slate-200/80 bg-slate-50/90 px-4 py-3 text-sm leading-6 text-slate-600">
      <p className="mb-2 font-medium text-slate-700">Требования к паролю</p>
      <div className="space-y-2">
        <PasswordRule
          isSatisfied={passwordRuleStates.hasLength}
          label="Не менее 8 символов"
        />
        <PasswordRule
          isSatisfied={passwordRuleStates.hasLetter}
          label="Хотя бы одна буква"
        />
        <PasswordRule
          isSatisfied={passwordRuleStates.hasNumber}
          label="Хотя бы одна цифра"
        />
        <PasswordRule
          isSatisfied={passwordRuleStates.matches}
          label="Пароли совпадают"
        />
      </div>
    </div>
  )
}
