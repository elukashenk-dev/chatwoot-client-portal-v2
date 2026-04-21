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
  completeRegistrationSetPassword,
  type RegistrationSetPasswordResponse,
} from '../api/authClient'
import { getPasswordRuleStates } from '../lib/passwordRules'
import {
  clearRegistrationFlow,
  clearRegistrationVerification,
  getStoredRegistrationRequest,
  getStoredRegistrationVerification,
} from '../lib/registrationFlow'
import { validateRegisterSetPasswordForm } from '../lib/registerSetPasswordValidation'
import type {
  RegisterSetPasswordFormValues,
  TouchedRegisterSetPasswordFields,
} from '../types'
import { PasswordRulesCard } from './PasswordRulesCard'

const DEFAULT_VALUES: RegisterSetPasswordFormValues = {
  confirmPassword: '',
  newPassword: '',
}

const DEFAULT_REQUEST_ERROR_MESSAGE =
  'Мы не смогли завершить регистрацию. Попробуйте еще раз чуть позже.'

type NextAction = 'login' | 'register' | 'verify' | null

function getErrorDetails(error: unknown): {
  message: string
  nextAction: NextAction
} {
  if (error instanceof ApiClientError) {
    switch (error.code) {
      case 'REGISTRATION_ACCOUNT_EXISTS':
        return {
          message:
            'Для этого email уже создан аккаунт. Войдите или используйте восстановление пароля.',
          nextAction: 'login',
        }
      case 'REGISTRATION_VERIFICATION_CONTINUATION_INVALID':
      case 'REGISTRATION_VERIFICATION_REQUIRED':
      case 'REGISTRATION_VERIFICATION_NOT_FOUND_OR_INVALIDATED':
        return {
          message:
            'Подтверждение регистрации больше недействительно. Сначала снова пройдите шаг с кодом.',
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

export function RegisterSetPasswordForm() {
  const registrationRequest = getStoredRegistrationRequest()
  const registrationVerification = getStoredRegistrationVerification()
  const [values, setValues] =
    useState<RegisterSetPasswordFormValues>(DEFAULT_VALUES)
  const [touched, setTouched] = useState<TouchedRegisterSetPasswordFields>({
    confirmPassword: false,
    newPassword: false,
  })
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [nextAction, setNextAction] = useState<NextAction>(null)
  const [completionSuccess, setCompletionSuccess] =
    useState<RegistrationSetPasswordResponse | null>(null)

  const fieldErrors = validateRegisterSetPasswordForm(values)
  const visiblePasswordError =
    touched.newPassword || hasSubmitted ? fieldErrors.newPassword : undefined
  const visibleConfirmError =
    touched.confirmPassword || hasSubmitted
      ? fieldErrors.confirmPassword
      : undefined

  const passwordErrorId = 'register-set-password-error'
  const confirmPasswordErrorId = 'register-set-confirm-password-error'
  const passwordRuleStates = getPasswordRuleStates(
    values.newPassword,
    values.confirmPassword,
  )

  const hasFlowAccess =
    registrationRequest &&
    registrationVerification &&
    registrationRequest.email === registrationVerification.email
  const canSubmit =
    hasFlowAccess &&
    passwordRuleStates.hasLength &&
    passwordRuleStates.hasLetter &&
    passwordRuleStates.hasNumber &&
    passwordRuleStates.matches

  function setFieldValue<Key extends keyof RegisterSetPasswordFormValues>(
    field: Key,
    nextValue: RegisterSetPasswordFormValues[Key],
  ) {
    setValues((currentValues) => ({
      ...currentValues,
      [field]: nextValue,
    }))
    setGlobalError(null)
    setNextAction(null)
  }

  function markFieldTouched(field: keyof TouchedRegisterSetPasswordFields) {
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
      const response = await completeRegistrationSetPassword({
        continuationToken: registrationVerification.continuationToken,
        email: registrationRequest.email,
        newPassword: values.newPassword,
      })

      clearRegistrationFlow()
      setCompletionSuccess(response)
      setGlobalError(null)
      setNextAction('login')
    } catch (error) {
      const errorDetails = getErrorDetails(error)

      if (errorDetails.nextAction === 'verify') {
        clearRegistrationVerification()
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
          Пароль сохранен для {completionSuccess.email}. Теперь вы можете войти
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

  if (!hasFlowAccess || !registrationRequest) {
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
          to={routePaths.auth.registerVerify}
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
        htmlFor="register-set-password"
        label="Новый пароль"
        required
      >
        <PasswordField
          aria-describedby={visiblePasswordError ? passwordErrorId : undefined}
          aria-invalid={Boolean(visiblePasswordError)}
          autoComplete="new-password"
          hasError={Boolean(visiblePasswordError)}
          id="register-set-password"
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
        htmlFor="register-set-confirm-password"
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
          id="register-set-confirm-password"
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
          to={routePaths.auth.registerVerify}
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
