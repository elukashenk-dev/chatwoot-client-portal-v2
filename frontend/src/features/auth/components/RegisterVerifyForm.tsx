import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'
import { InlineAlert } from '../../../shared/ui/InlineAlert'
import {
  ApiClientError,
  confirmRegistrationVerification,
  requestRegistrationVerification,
} from '../api/authClient'
import { calculateResendCountdown } from '../lib/otpVerificationTiming'
import {
  getStoredRegistrationRequest,
  saveRegistrationRequest,
  saveRegistrationVerification,
} from '../lib/registrationFlow'
import type { RegisterVerifyFormValues } from '../types'
import { OtpVerificationFormLayout } from './OtpVerificationFormLayout'

const DEFAULT_VALUES: RegisterVerifyFormValues = {
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

export function RegisterVerifyForm() {
  const navigate = useNavigate()
  const [registrationRequest, setRegistrationRequest] = useState(() =>
    getStoredRegistrationRequest(),
  )
  const [values, setValues] = useState<RegisterVerifyFormValues>(DEFAULT_VALUES)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)
  const [secondsRemaining, setSecondsRemaining] = useState(() =>
    registrationRequest
      ? calculateResendCountdown(
          registrationRequest.requestedAt,
          registrationRequest.resendAvailableInSeconds,
        )
      : 0,
  )

  useEffect(() => {
    if (!registrationRequest) {
      return
    }

    const updateCountdown = () => {
      setSecondsRemaining(
        calculateResendCountdown(
          registrationRequest.requestedAt,
          registrationRequest.resendAvailableInSeconds,
        ),
      )
    }

    updateCountdown()

    const timer = window.setInterval(updateCountdown, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [registrationRequest])

  function setFieldValue<Key extends keyof RegisterVerifyFormValues>(
    field: Key,
    nextValue: RegisterVerifyFormValues[Key],
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

    if (!registrationRequest) {
      setGlobalError(
        'Сначала начните регистрацию и запросите код подтверждения.',
      )
      return
    }

    if (values.code.length !== 6) {
      return
    }

    setIsSubmitting(true)

    try {
      const response = await confirmRegistrationVerification({
        code: values.code,
        email: registrationRequest.email,
      })

      saveRegistrationVerification({
        continuationToken: response.continuationToken,
        continuationExpiresInSeconds: response.continuationExpiresInSeconds,
        email: response.email,
      })

      navigate(routePaths.auth.registerSetPassword)
    } catch (error) {
      setGlobalError(getErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleResend() {
    if (!registrationRequest) {
      setGlobalError(
        'Сначала начните регистрацию и запросите код подтверждения.',
      )
      return
    }

    setIsResending(true)
    setGlobalError(null)
    setInfoMessage(null)

    try {
      const response = await requestRegistrationVerification({
        email: registrationRequest.email,
        fullName: registrationRequest.fullName,
        personalDataConsentAccepted:
          registrationRequest.personalDataConsentAccepted,
        termsAccepted: registrationRequest.termsAccepted,
      })

      saveRegistrationRequest({
        email: response.email,
        expiresInSeconds: response.expiresInSeconds,
        fullName: registrationRequest.fullName,
        personalDataConsentAccepted:
          registrationRequest.personalDataConsentAccepted,
        resendAvailableInSeconds: response.resendAvailableInSeconds,
        termsAccepted: registrationRequest.termsAccepted,
      })

      setRegistrationRequest(getStoredRegistrationRequest())
      setValues(DEFAULT_VALUES)
      setInfoMessage(
        response.delivery === 'sent'
          ? `Новый код отправлен на ${response.email}.`
          : 'Используйте ранее отправленный код. Новый код можно будет запросить после таймера.',
      )
    } catch (error) {
      setGlobalError(getErrorMessage(error))
    } finally {
      setIsResending(false)
    }
  }

  if (!registrationRequest) {
    return (
      <div className="space-y-4">
        <InlineAlert
          message="Сначала начните регистрацию и запросите код подтверждения."
          tone="error"
        />

        <Link
          className="inline-flex min-h-11 items-center rounded-[0.75rem] px-3 text-sm font-medium text-brand-800 transition hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
          to={routePaths.auth.register}
        >
          Перейти к регистрации
        </Link>
      </div>
    )
  }

  return (
    <OtpVerificationFormLayout
      changeEmailTo={routePaths.auth.register}
      code={values.code}
      codeInputId="register-verify-code"
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
