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
          ? 'auth-password-rule auth-password-rule--satisfied'
          : 'auth-password-rule'
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
      className="auth-password-rules"
      data-testid="password-rules-card"
    >
      <p className="auth-password-rules__title">Требования к паролю</p>
      <div className="auth-password-rules__items">
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
