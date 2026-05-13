import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'
import { InlineAlert } from '../../../shared/ui/InlineAlert'
import {
  ApiClientError,
  confirmPasswordResetVerification,
  requestPasswordReset,
} from '../api/authClient'
import { calculateResendCountdown } from '../lib/otpVerificationTiming'
import {
  getStoredPasswordResetRequest,
  savePasswordResetRequest,
  savePasswordResetVerification,
} from '../lib/passwordResetFlow'
import type { PasswordResetVerifyFormValues } from '../types'
import { OtpVerificationFormLayout } from './OtpVerificationFormLayout'

const DEFAULT_VALUES: PasswordResetVerifyFormValues = {
  code: '',
}

const DEFAULT_REQUEST_ERROR_MESSAGE =
  'Мы не смогли выполнить запрос. Попробуйте еще раз чуть позже.'

function getErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    return error.message
  }

  return DEFAULT_REQUEST_ERROR_MESSAGE
}

export function PasswordResetVerifyForm() {
  const navigate = useNavigate()
  const [passwordResetRequest, setPasswordResetRequest] = useState(() =>
    getStoredPasswordResetRequest(),
  )
  const [values, setValues] =
    useState<PasswordResetVerifyFormValues>(DEFAULT_VALUES)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)
  const [secondsRemaining, setSecondsRemaining] = useState(() =>
    passwordResetRequest
      ? calculateResendCountdown(
          passwordResetRequest.requestedAt,
          passwordResetRequest.resendAvailableInSeconds,
        )
      : 0,
  )

  useEffect(() => {
    if (!passwordResetRequest) {
      return
    }

    const updateCountdown = () => {
      setSecondsRemaining(
        calculateResendCountdown(
          passwordResetRequest.requestedAt,
          passwordResetRequest.resendAvailableInSeconds,
        ),
      )
    }

    updateCountdown()

    const timer = window.setInterval(updateCountdown, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [passwordResetRequest])

  function setFieldValue<Key extends keyof PasswordResetVerifyFormValues>(
    field: Key,
    nextValue: PasswordResetVerifyFormValues[Key],
  ) {
    setValues((currentValues) => ({
      ...currentValues,
      [field]: nextValue,
    }))
    setGlobalError(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setGlobalError(null)

    if (!passwordResetRequest) {
      setGlobalError('Сначала запросите код восстановления пароля.')
      return
    }

    if (values.code.length !== 6) {
      return
    }

    setIsSubmitting(true)

    try {
      const response = await confirmPasswordResetVerification({
        code: values.code,
        email: passwordResetRequest.email,
      })

      savePasswordResetVerification({
        continuationToken: response.continuationToken,
        continuationExpiresInSeconds: response.continuationExpiresInSeconds,
        email: response.email,
      })

      navigate(routePaths.auth.passwordResetSetPassword)
    } catch (error) {
      setGlobalError(getErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleResend() {
    if (!passwordResetRequest) {
      setGlobalError('Сначала запросите код восстановления пароля.')
      return
    }

    setIsResending(true)
    setGlobalError(null)
    setInfoMessage(null)

    try {
      const response = await requestPasswordReset({
        email: passwordResetRequest.email,
      })

      savePasswordResetRequest({
        email: response.email,
        expiresInSeconds: response.expiresInSeconds,
        resendAvailableInSeconds: response.resendAvailableInSeconds,
      })

      setPasswordResetRequest(getStoredPasswordResetRequest())
      setValues(DEFAULT_VALUES)
      setInfoMessage(
        `Если доступ активен, новый код отправлен на ${response.email}.`,
      )
    } catch (error) {
      setGlobalError(getErrorMessage(error))
    } finally {
      setIsResending(false)
    }
  }

  if (!passwordResetRequest) {
    return (
      <div className="space-y-4">
        <InlineAlert
          message="Сначала запросите код восстановления пароля."
          tone="error"
        />

        <Link
          className="inline-flex min-h-11 items-center rounded-[0.75rem] px-3 text-sm font-medium text-brand-800 transition hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
          to={routePaths.auth.passwordResetRequest}
        >
          Перейти к восстановлению
        </Link>
      </div>
    )
  }

  return (
    <OtpVerificationFormLayout
      changeEmailTo={routePaths.auth.passwordResetRequest}
      code={values.code}
      codeInputId="password-reset-verify-code"
      errorMessage={globalError}
      helperText="Если письма нет, проверьте «Спам» или запросите новый код после таймера."
      infoMessage={infoMessage}
      isResending={isResending}
      isSubmitting={isSubmitting}
      onCodeChange={(nextValue) => setFieldValue('code', nextValue)}
      onResend={handleResend}
      onSubmit={handleSubmit}
      secondsRemaining={secondsRemaining}
    />
  )
}
