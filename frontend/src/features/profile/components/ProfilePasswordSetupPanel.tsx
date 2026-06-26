import type { FormEvent } from 'react'
import { useState } from 'react'

import {
  ApiClientError,
  completePasswordSetup,
  requestPasswordSetup,
  verifyPasswordSetupCode,
} from '../../auth/api/authClient'
import { OtpInputGroup } from '../../auth/components/OtpInputGroup'
import { PasswordSetupFormLayout } from '../../auth/components/PasswordSetupFormLayout'
import { getPasswordRuleStates } from '../../auth/lib/passwordRules'
import { validateRegisterSetPasswordForm } from '../../auth/lib/registerSetPasswordValidation'
import type {
  RegisterSetPasswordFormValues,
  TouchedRegisterSetPasswordFields,
} from '../../auth/types'
import { useAuthSession } from '../../auth/lib/authSessionContext'
import { FormField } from '../../../shared/ui/FormField'
import { InlineAlert } from '../../../shared/ui/InlineAlert'
import { PrimaryButton } from '../../../shared/ui/PrimaryButton'

const DEFAULT_VALUES: RegisterSetPasswordFormValues = {
  confirmPassword: '',
  newPassword: '',
}

type PasswordSetupStep = 'request' | 'set_password' | 'verify_code'

function getPasswordSetupErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    return error.message
  }

  return 'Не удалось настроить пароль. Попробуйте еще раз.'
}

function getVisibleFieldError(error?: string) {
  return error === 'Введите новый пароль' ||
    error === 'Повторите пароль' ||
    error === 'Пароль не соответствует требованиям'
    ? undefined
    : error
}

export function ProfilePasswordSetupPanel() {
  const { completeAuthenticatedSession, user } = useAuthSession()
  const [passwordConfiguredLocally, setPasswordConfiguredLocally] =
    useState(false)
  const [step, setStep] = useState<PasswordSetupStep>('request')
  const [code, setCode] = useState('')
  const [continuationToken, setContinuationToken] = useState<string | null>(null)
  const [values, setValues] =
    useState<RegisterSetPasswordFormValues>(DEFAULT_VALUES)
  const [touched, setTouched] = useState<TouchedRegisterSetPasswordFields>({
    confirmPassword: false,
    newPassword: false,
  })
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [isRequesting, setIsRequesting] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const isPasswordConfigured =
    Boolean(user?.passwordConfigured) || passwordConfiguredLocally

  const fieldErrors = validateRegisterSetPasswordForm(values)
  const visiblePasswordError =
    touched.newPassword || hasSubmitted ? fieldErrors.newPassword : undefined
  const visibleConfirmError =
    touched.confirmPassword || hasSubmitted
      ? fieldErrors.confirmPassword
      : undefined
  const passwordRuleStates = getPasswordRuleStates(
    values.newPassword,
    values.confirmPassword,
  )
  const canSubmitPassword =
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
    setErrorMessage(null)
  }

  function markFieldTouched(field: keyof TouchedRegisterSetPasswordFields) {
    setTouched((currentTouched) => ({
      ...currentTouched,
      [field]: true,
    }))
  }

  async function handleRequestCode() {
    setErrorMessage(null)
    setMessage(null)
    setIsRequesting(true)

    try {
      const response = await requestPasswordSetup()

      setCode('')
      setContinuationToken(null)
      setStep('verify_code')
      setMessage(`Код отправлен на ${response.email}.`)
    } catch (error) {
      setErrorMessage(getPasswordSetupErrorMessage(error))
    } finally {
      setIsRequesting(false)
    }
  }

  async function handleVerifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setMessage(null)

    if (code.length !== 6) {
      return
    }

    setIsVerifying(true)

    try {
      const response = await verifyPasswordSetupCode({ code })

      setContinuationToken(response.continuationToken)
      setStep('set_password')
      setMessage('Email подтвержден. Теперь задайте пароль.')
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        (error.code === 'PASSWORD_SETUP_CODE_EXPIRED' ||
          error.code === 'PASSWORD_SETUP_NOT_FOUND_OR_INVALIDATED' ||
          error.code === 'PASSWORD_SETUP_TOO_MANY_ATTEMPTS')
      ) {
        setStep('request')
        setCode('')
      }

      setErrorMessage(getPasswordSetupErrorMessage(error))
    } finally {
      setIsVerifying(false)
    }
  }

  async function handleSetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setHasSubmitted(true)
    setErrorMessage(null)
    setMessage(null)

    if (!continuationToken) {
      setStep('verify_code')
      setErrorMessage('Сначала подтвердите email кодом.')
      return
    }

    if (fieldErrors.newPassword || fieldErrors.confirmPassword) {
      return
    }

    setIsSubmittingPassword(true)

    try {
      const response = await completePasswordSetup({
        continuationToken,
        newPassword: values.newPassword,
      })

      await completeAuthenticatedSession({
        session: response.session,
        user: response.user,
      })
      setPasswordConfiguredLocally(true)
      setContinuationToken(null)
      setValues(DEFAULT_VALUES)
      setMessage('Пароль настроен.')
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        (error.code === 'PASSWORD_SETUP_CONTINUATION_INVALID' ||
          error.code === 'PASSWORD_SETUP_VERIFICATION_REQUIRED')
      ) {
        setStep('request')
        setContinuationToken(null)
      }

      setErrorMessage(getPasswordSetupErrorMessage(error))
    } finally {
      setIsSubmittingPassword(false)
    }
  }

  return (
    <section className="chat-glass-card-surface mt-4 overflow-hidden rounded-lg border">
      <div className="border-b border-slate-300/45 px-4 py-4">
        <h2 className="text-[14px] font-semibold leading-5 text-slate-900">
          Безопасность
        </h2>
        <p className="mt-1 text-[13px] leading-5 text-slate-500">
          Пароль пока не задан. Вы можете пользоваться чатом без него. Если
          выйдете из аккаунта, следующий вход будет по коду из почты.
        </p>
      </div>

      <div className="space-y-4 px-4 py-4">
        {isPasswordConfigured ? (
          <>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] font-medium text-emerald-900">
              Пароль настроен
            </div>
            <p className="text-[13px] leading-5 text-slate-500">
              Изменение пароля будет добавлено отдельно. Если вы выйдете и
              забудете пароль, используйте восстановление по email-коду.
            </p>
          </>
        ) : (
          <>
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] font-medium text-amber-900">
              Пароль не задан
            </div>

            {step === 'request' ? (
              <>
                <p className="text-[13px] leading-5 text-slate-500">
                  Чтобы задать пароль, мы отправим код подтверждения на{' '}
                  {user?.email}. После подтверждения вы сможете входить по
                  паролю или по коду из почты.
                </p>
                <InlineAlert message={errorMessage} tone="error" />
                <PrimaryButton
                  loading={isRequesting}
                  loadingLabel="Отправляем..."
                  onClick={() => {
                    void handleRequestCode()
                  }}
                  type="button"
                >
                  Задать пароль
                </PrimaryButton>
              </>
            ) : null}

            {step === 'verify_code' ? (
              <form className="space-y-4" noValidate onSubmit={handleVerifyCode}>
                <FormField
                  htmlFor="profile-password-setup-code"
                  label="Код из письма"
                  labelHidden
                  required
                >
                  <OtpInputGroup
                    aria-label="Код из письма"
                    disabled={isVerifying}
                    id="profile-password-setup-code"
                    onChange={setCode}
                    value={code}
                  />
                </FormField>
                <InlineAlert message={message} tone="success" />
                <InlineAlert message={errorMessage} tone="error" />
                <PrimaryButton
                  disabled={code.length !== 6 || isVerifying}
                  loading={isVerifying}
                  loadingLabel="Проверяем..."
                  type="submit"
                >
                  Подтвердить код
                </PrimaryButton>
              </form>
            ) : null}

            {step === 'set_password' ? (
              <PasswordSetupFormLayout
                canSubmit={canSubmitPassword}
                confirmPassword={values.confirmPassword}
                confirmPasswordError={getVisibleFieldError(visibleConfirmError)}
                confirmPasswordErrorId="profile-password-confirm-error"
                confirmPasswordHasError={Boolean(visibleConfirmError)}
                confirmPasswordInputId="profile-password-confirm"
                errorMessage={errorMessage}
                isSubmitting={isSubmittingPassword}
                newPassword={values.newPassword}
                onConfirmPasswordBlur={() => markFieldTouched('confirmPassword')}
                onConfirmPasswordChange={(nextValue) =>
                  setFieldValue('confirmPassword', nextValue)
                }
                onNewPasswordBlur={() => markFieldTouched('newPassword')}
                onNewPasswordChange={(nextValue) =>
                  setFieldValue('newPassword', nextValue)
                }
                onSubmit={handleSetPassword}
                passwordError={getVisibleFieldError(visiblePasswordError)}
                passwordErrorId="profile-password-error"
                passwordHasError={Boolean(visiblePasswordError)}
                passwordInputId="profile-password"
              />
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}
