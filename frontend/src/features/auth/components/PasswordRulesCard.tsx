import { CheckIcon } from '../../../shared/ui/icons'
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
            ? 'inline-flex h-5 w-5 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white/70'
        }
      >
        {isSatisfied ? (
          <CheckIcon className="h-3.5 w-3.5" />
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
        )}
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
    <div
      className="rounded-[0.6rem] bg-slate-100/80 px-3.5 py-3 text-sm leading-5 text-slate-500 shadow-sm"
      data-testid="password-rules-card"
    >
      <p className="mb-2 font-medium text-slate-600">Требования к паролю</p>
      <div className="space-y-1.5">
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
