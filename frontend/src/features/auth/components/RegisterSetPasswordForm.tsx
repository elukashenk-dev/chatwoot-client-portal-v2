import type { FormEvent } from 'react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'
import { InlineAlert } from '../../../shared/ui/InlineAlert'
import {
  ApiClientError,
  completeRegistrationSetPassword,
  skipRegistrationPassword,
  type RegistrationSetPasswordResponse,
} from '../api/authClient'
import { getPasswordRuleStates } from '../lib/passwordRules'
import {
  clearRegistrationFlow,
  clearRegistrationVerification,
  getStoredRegistrationRequest,
  getStoredRegistrationVerification,
} from '../lib/registrationFlow'
import { useAuthSession } from '../lib/authSessionContext'
import { validateRegisterSetPasswordForm } from '../lib/registerSetPasswordValidation'
import type {
  RegisterSetPasswordFormValues,
  TouchedRegisterSetPasswordFields,
} from '../types'
import { PasswordSetupFormLayout } from './PasswordSetupFormLayout'

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

function getVisibleFieldError(error?: string) {
  if (
    error === 'Введите новый пароль' ||
    error === 'Повторите пароль' ||
    error === 'Пароль не соответствует требованиям'
  ) {
    return undefined
  }

  return error
}

export function RegisterSetPasswordForm() {
  const { completeAuthenticatedSession } = useAuthSession()
  const navigate = useNavigate()
  const registrationRequest = getStoredRegistrationRequest()
  const registrationVerification = getStoredRegistrationVerification()
  const [values, setValues] =
    useState<RegisterSetPasswordFormValues>(DEFAULT_VALUES)
  const [touched, setTouched] = useState<TouchedRegisterSetPasswordFields>({
    confirmPassword: false,
    newPassword: false,
  })
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [isSavingPassword, setIsSavingPassword] = useState(false)
  const [isSkippingPassword, setIsSkippingPassword] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [nextAction, setNextAction] = useState<NextAction>(null)

  const fieldErrors = validateRegisterSetPasswordForm(values)
  const visiblePasswordError =
    touched.newPassword || hasSubmitted ? fieldErrors.newPassword : undefined
  const visibleConfirmError =
    touched.confirmPassword || hasSubmitted
      ? fieldErrors.confirmPassword
      : undefined
  const visiblePasswordErrorMessage = getVisibleFieldError(visiblePasswordError)
  const visibleConfirmErrorMessage = getVisibleFieldError(visibleConfirmError)

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
  const isBusy = isSavingPassword || isSkippingPassword
  const canSkip = Boolean(hasFlowAccess) && !isBusy

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

  async function completeRegistration(response: RegistrationSetPasswordResponse) {
    await completeAuthenticatedSession({
      session: response.session,
      user: response.user,
    })
    clearRegistrationFlow()
    setGlobalError(null)
    setNextAction(null)
    navigate(routePaths.app.chat, { replace: true })
  }

  function handleCompletionError(error: unknown) {
    const errorDetails = getErrorDetails(error)

    if (errorDetails.nextAction === 'verify') {
      clearRegistrationVerification()
    }

    setGlobalError(errorDetails.message)
    setNextAction(errorDetails.nextAction)
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

    setIsSavingPassword(true)

    try {
      const response = await completeRegistrationSetPassword({
        continuationToken: registrationVerification.continuationToken,
        email: registrationRequest.email,
        newPassword: values.newPassword,
      })

      await completeRegistration(response)
    } catch (error) {
      handleCompletionError(error)
    } finally {
      setIsSavingPassword(false)
    }
  }

  async function handleSkipPassword() {
    setGlobalError(null)
    setNextAction(null)

    if (!hasFlowAccess) {
      setGlobalError(
        'Сначала подтвердите email, чтобы открыть шаг завершения регистрации.',
      )
      setNextAction('verify')
      return
    }

    setIsSkippingPassword(true)

    try {
      const response = await skipRegistrationPassword({
        continuationToken: registrationVerification.continuationToken,
        email: registrationRequest.email,
      })

      await completeRegistration(response)
    } catch (error) {
      handleCompletionError(error)
    } finally {
      setIsSkippingPassword(false)
    }
  }

  if (!hasFlowAccess || !registrationRequest) {
    return (
      <div className="space-y-4">
        <InlineAlert
          message={
            globalError ??
            'Сначала подтвердите email, чтобы завершить регистрацию.'
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
    <div className="registration-set-password-flow space-y-4">
      <p className="auth-form-note registration-password-note">
        Можно продолжить без пароля. Позже задайте его в профиле. После выхода
        войдите по email-коду.
      </p>

      <PasswordSetupFormLayout
        canSubmit={Boolean(canSubmit)}
        confirmPassword={values.confirmPassword}
        confirmPasswordError={visibleConfirmErrorMessage}
        confirmPasswordErrorId={confirmPasswordErrorId}
        confirmPasswordHasError={Boolean(visibleConfirmError)}
        confirmPasswordInputId="register-set-confirm-password"
        errorMessage={globalError}
        isDisabled={isBusy}
        isSubmitting={isSavingPassword}
        newPassword={values.newPassword}
        onConfirmPasswordBlur={() => markFieldTouched('confirmPassword')}
        onConfirmPasswordChange={(nextValue) =>
          setFieldValue('confirmPassword', nextValue)
        }
        onNewPasswordBlur={() => markFieldTouched('newPassword')}
        onNewPasswordChange={(nextValue) =>
          setFieldValue('newPassword', nextValue)
        }
        onSubmit={handleSubmit}
        passwordError={visiblePasswordErrorMessage}
        passwordErrorId={passwordErrorId}
        passwordHasError={Boolean(visiblePasswordError)}
        passwordInputId="register-set-password"
        recoveryAction={
          nextAction === 'verify'
            ? {
                label: 'Вернуться к подтверждению email',
                to: routePaths.auth.registerVerify,
              }
            : nextAction === 'login'
              ? {
                  label: 'Перейти ко входу',
                  to: routePaths.auth.login,
                }
              : null
        }
      />

      <button
        className="inline-flex min-h-12 w-full items-center justify-center rounded-[0.6rem] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-brand-800 shadow-sm transition hover:border-brand-200 hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
        disabled={!canSkip}
        onClick={() => {
          void handleSkipPassword()
        }}
        type="button"
      >
        {isSkippingPassword ? 'Переходим...' : 'Продолжить без пароля'}
      </button>
    </div>
  )
}
