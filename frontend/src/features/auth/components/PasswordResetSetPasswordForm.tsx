import type { FormEvent } from 'react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'
import { FormField } from '../../../shared/ui/FormField'
import { InlineAlert } from '../../../shared/ui/InlineAlert'
import { PasswordField } from '../../../shared/ui/PasswordField'
import { PrimaryButton } from '../../../shared/ui/PrimaryButton'
import {
  ApiClientError,
  completePasswordResetSetPassword,
  type PasswordResetSetPasswordResponse,
} from '../api/authClient'
import {
  clearPasswordResetFlow,
  clearPasswordResetVerification,
  getStoredPasswordResetRequest,
  getStoredPasswordResetVerification,
} from '../lib/passwordResetFlow'
import { validatePasswordResetSetPasswordForm } from '../lib/passwordResetSetPasswordValidation'
import { getPasswordRuleStates } from '../lib/passwordRules'
import type {
  PasswordResetSetPasswordFormValues,
  TouchedPasswordResetSetPasswordFields,
} from '../types'
import { PasswordRulesCard } from './PasswordRulesCard'

const DEFAULT_VALUES: PasswordResetSetPasswordFormValues = {
  confirmPassword: '',
  newPassword: '',
}

const DEFAULT_REQUEST_ERROR_MESSAGE =
  'Мы не смогли сохранить новый пароль. Попробуйте еще раз чуть позже.'

type NextAction = 'login' | 'verify' | null

function getErrorDetails(error: unknown): {
  message: string
  nextAction: NextAction
} {
  if (error instanceof ApiClientError) {
    switch (error.code) {
      case 'PASSWORD_RESET_CONTINUATION_INVALID':
      case 'PASSWORD_RESET_VERIFICATION_REQUIRED':
      case 'PASSWORD_RESET_NOT_FOUND_OR_INVALIDATED':
        return {
          message:
            'Подтверждение восстановления больше недействительно. Сначала снова пройдите шаг с кодом.',
          nextAction: 'verify',
        }
      default:
        return {
          message: error.message,
          nextAction: null,
        }
    }
  }

  return {
    message: DEFAULT_REQUEST_ERROR_MESSAGE,
    nextAction: null,
  }
}

export function PasswordResetSetPasswordForm() {
  const passwordResetRequest = getStoredPasswordResetRequest()
  const passwordResetVerification = getStoredPasswordResetVerification()
  const [values, setValues] =
    useState<PasswordResetSetPasswordFormValues>(DEFAULT_VALUES)
  const [touched, setTouched] = useState<TouchedPasswordResetSetPasswordFields>(
    {
      confirmPassword: false,
      newPassword: false,
    },
  )
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [nextAction, setNextAction] = useState<NextAction>(null)
  const [completionSuccess, setCompletionSuccess] =
    useState<PasswordResetSetPasswordResponse | null>(null)

  const fieldErrors = validatePasswordResetSetPasswordForm(values)
  const visiblePasswordError =
    touched.newPassword || hasSubmitted ? fieldErrors.newPassword : undefined
  const visibleConfirmError =
    touched.confirmPassword || hasSubmitted
      ? fieldErrors.confirmPassword
      : undefined

  const passwordErrorId = 'password-reset-set-password-error'
  const confirmPasswordErrorId = 'password-reset-set-confirm-password-error'
  const passwordRuleStates = getPasswordRuleStates(
    values.newPassword,
    values.confirmPassword,
  )

  const hasFlowAccess =
    passwordResetRequest &&
    passwordResetVerification &&
    passwordResetRequest.email === passwordResetVerification.email
  const canSubmit =
    hasFlowAccess &&
    passwordRuleStates.hasLength &&
    passwordRuleStates.hasLetter &&
    passwordRuleStates.hasNumber &&
    passwordRuleStates.matches

  function setFieldValue<Key extends keyof PasswordResetSetPasswordFormValues>(
    field: Key,
    nextValue: PasswordResetSetPasswordFormValues[Key],
  ) {
    setValues((currentValues) => ({
      ...currentValues,
      [field]: nextValue,
    }))
    setGlobalError(null)
    setNextAction(null)
  }

  function markFieldTouched(
    field: keyof TouchedPasswordResetSetPasswordFields,
  ) {
    setTouched((currentTouched) => ({
      ...currentTouched,
      [field]: true,
    }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setHasSubmitted(true)
    setGlobalError(null)
    setNextAction(null)

    if (!hasFlowAccess) {
      setGlobalError(
        'Сначала подтвердите email, чтобы открыть шаг установки пароля.',
      )
      setNextAction('verify')
      return
    }

    if (fieldErrors.newPassword || fieldErrors.confirmPassword) {
      return
    }

    setIsSubmitting(true)

    try {
      const response = await completePasswordResetSetPassword({
        continuationToken: passwordResetVerification.continuationToken,
        email: passwordResetRequest.email,
        newPassword: values.newPassword,
      })

      clearPasswordResetFlow()
      setCompletionSuccess(response)
      setGlobalError(null)
      setNextAction('login')
    } catch (error) {
      const errorDetails = getErrorDetails(error)

      if (errorDetails.nextAction === 'verify') {
        clearPasswordResetVerification()
      }

      setGlobalError(errorDetails.message)
      setNextAction(errorDetails.nextAction)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (completionSuccess) {
    return (
      <div className="space-y-5">
        <div className="rounded-[1rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">
          Пароль обновлен для {completionSuccess.email}. Теперь вы можете войти
          в клиентский портал.
        </div>

        <Link
          className="inline-flex min-h-14 w-full items-center justify-center rounded-[0.6rem] bg-brand-800 px-4 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
          to={routePaths.auth.login}
        >
          Перейти ко входу
        </Link>
      </div>
    )
  }

  if (!hasFlowAccess || !passwordResetRequest) {
    return (
      <div className="space-y-4">
        <InlineAlert
          message={
            globalError ??
            'Сначала подтвердите email, чтобы открыть шаг установки пароля.'
          }
          tone="error"
        />

        <Link
          className="inline-flex min-h-11 items-center rounded-[0.75rem] px-3 text-sm font-medium text-brand-800 transition hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
          to={routePaths.auth.passwordResetVerify}
        >
          Вернуться к подтверждению
        </Link>
      </div>
    )
  }

  return (
    <form className="space-y-6" noValidate onSubmit={handleSubmit}>
      <FormField
        error={visiblePasswordError}
        errorId={passwordErrorId}
        htmlFor="password-reset-set-password"
        label="Новый пароль"
        required
      >
        <PasswordField
          aria-describedby={visiblePasswordError ? passwordErrorId : undefined}
          aria-invalid={Boolean(visiblePasswordError)}
          autoComplete="new-password"
          hasError={Boolean(visiblePasswordError)}
          id="password-reset-set-password"
          name="newPassword"
          onBlur={() => markFieldTouched('newPassword')}
          onChange={(event) => setFieldValue('newPassword', event.target.value)}
          placeholder="Введите новый пароль"
          required
          value={values.newPassword}
        />
      </FormField>

      <FormField
        error={visibleConfirmError}
        errorId={confirmPasswordErrorId}
        htmlFor="password-reset-set-confirm-password"
        label="Подтвердите пароль"
        required
      >
        <PasswordField
          aria-describedby={
            visibleConfirmError ? confirmPasswordErrorId : undefined
          }
          aria-invalid={Boolean(visibleConfirmError)}
          autoComplete="new-password"
          hasError={Boolean(visibleConfirmError)}
          id="password-reset-set-confirm-password"
          name="confirmPassword"
          onBlur={() => markFieldTouched('confirmPassword')}
          onChange={(event) =>
            setFieldValue('confirmPassword', event.target.value)
          }
          placeholder="Повторите пароль"
          required
          value={values.confirmPassword}
        />
      </FormField>

      <PasswordRulesCard
        confirmPassword={values.confirmPassword}
        password={values.newPassword}
      />

      <InlineAlert message={globalError} tone="error" />

      {nextAction === 'verify' ? (
        <Link
          className="inline-flex min-h-11 items-center rounded-[0.75rem] px-3 text-sm font-medium text-brand-800 transition hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
          to={routePaths.auth.passwordResetVerify}
        >
          Вернуться к подтверждению email
        </Link>
      ) : null}

      {nextAction === 'login' && !completionSuccess ? (
        <Link
          className="inline-flex min-h-11 items-center rounded-[0.75rem] px-3 text-sm font-medium text-brand-800 transition hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
          to={routePaths.auth.login}
        >
          Перейти ко входу
        </Link>
      ) : null}

      <PrimaryButton
        disabled={!canSubmit || isSubmitting}
        loading={isSubmitting}
        loadingLabel="Сохранение..."
        type="submit"
      >
        Сохранить пароль
      </PrimaryButton>
    </form>
  )
}
