import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'
import { InlineAlert } from '../../../shared/ui/InlineAlert'
import {
  ApiClientError,
  confirmPasswordlessLoginCode,
  requestPasswordlessLoginCode,
} from '../api/authClient'
import { useAuthSession } from '../lib/authSessionContext'
import { calculateResendCountdown } from '../lib/otpVerificationTiming'
import {
  clearPasswordlessLoginFlow,
  getStoredPasswordlessLoginRequest,
  savePasswordlessLoginLegalContinuation,
  savePasswordlessLoginRequest,
} from '../lib/passwordlessLoginFlow'
import { getPostLoginPath } from '../lib/postLoginRedirect'
import type { PasswordlessLoginVerifyFormValues } from '../types'
import { OtpVerificationFormLayout } from './OtpVerificationFormLayout'

const DEFAULT_VALUES: PasswordlessLoginVerifyFormValues = {
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

export function PasswordlessLoginVerifyForm() {
  const location = useLocation()
  const navigate = useNavigate()
  const { completeAuthenticatedSession } = useAuthSession()
  const [loginRequest, setLoginRequest] = useState(() =>
    getStoredPasswordlessLoginRequest(),
  )
  const [values, setValues] =
    useState<PasswordlessLoginVerifyFormValues>(DEFAULT_VALUES)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)
  const [secondsRemaining, setSecondsRemaining] = useState(() =>
    loginRequest
      ? calculateResendCountdown(
          loginRequest.requestedAt,
          loginRequest.resendAvailableInSeconds,
        )
      : 0,
  )

  useEffect(() => {
    if (!loginRequest) {
      return
    }

    const updateCountdown = () => {
      setSecondsRemaining(
        calculateResendCountdown(
          loginRequest.requestedAt,
          loginRequest.resendAvailableInSeconds,
        ),
      )
    }

    updateCountdown()

    const timer = window.setInterval(updateCountdown, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [loginRequest])

  function setFieldValue<Key extends keyof PasswordlessLoginVerifyFormValues>(
    field: Key,
    nextValue: PasswordlessLoginVerifyFormValues[Key],
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

    if (!loginRequest) {
      setGlobalError('Сначала запросите код входа.')
      return
    }

    if (values.code.length !== 6) {
      return
    }

    setIsSubmitting(true)

    try {
      const response = await confirmPasswordlessLoginCode({
        code: values.code,
        email: loginRequest.email,
      })

      if (response.nextStep === 'accept_legal') {
        savePasswordlessLoginLegalContinuation({
          continuationExpiresInSeconds: response.continuationExpiresInSeconds,
          continuationToken: response.continuationToken,
          email: response.email,
        })
        navigate(routePaths.auth.codeLoginLegal, {
          replace: true,
          state: location.state,
        })
        return
      }

      clearPasswordlessLoginFlow()
      await completeAuthenticatedSession(response)
      navigate(getPostLoginPath(location.state), { replace: true })
    } catch (error) {
      setGlobalError(getErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleResend() {
    if (!loginRequest) {
      setGlobalError('Сначала запросите код входа.')
      return
    }

    setIsResending(true)
    setGlobalError(null)
    setInfoMessage(null)

    try {
      const response = await requestPasswordlessLoginCode({
        email: loginRequest.email,
      })

      savePasswordlessLoginRequest({
        email: response.email,
        expiresInSeconds: response.expiresInSeconds,
        resendAvailableInSeconds: response.resendAvailableInSeconds,
      })

      setLoginRequest(getStoredPasswordlessLoginRequest())
      setValues(DEFAULT_VALUES)
      setInfoMessage(
        `Если доступ активен, новый код входа отправлен на ${response.email}.`,
      )
    } catch (error) {
      setGlobalError(getErrorMessage(error))
    } finally {
      setIsResending(false)
    }
  }

  if (!loginRequest) {
    return (
      <div className="space-y-4">
        <InlineAlert
          message="Сначала запросите код входа для уже созданного аккаунта."
          tone="error"
        />

        <Link
          className="inline-flex min-h-11 items-center rounded-[0.75rem] px-3 text-sm font-medium text-brand-800 transition hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
          state={location.state}
          to={routePaths.auth.codeLoginRequest}
        >
          Запросить код входа
        </Link>
      </div>
    )
  }

  return (
    <OtpVerificationFormLayout
      changeEmailTo={routePaths.auth.codeLoginRequest}
      changeEmailState={location.state}
      code={values.code}
      codeInputId="passwordless-login-verify-code"
      errorMessage={globalError}
      helperText="Если письма нет, проверьте «Спам» или запросите новый код после таймера."
      infoMessage={infoMessage}
      isResending={isResending}
      isSubmitting={isSubmitting}
      onCodeChange={(nextValue) => setFieldValue('code', nextValue)}
      onResend={handleResend}
      onSubmit={handleSubmit}
      secondsRemaining={secondsRemaining}
      submitLabel="Войти"
    />
  )
}
