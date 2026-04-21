import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'
import { FormField } from '../../../shared/ui/FormField'
import { InlineAlert } from '../../../shared/ui/InlineAlert'
import { PrimaryButton } from '../../../shared/ui/PrimaryButton'
import {
  ApiClientError,
  confirmPasswordResetVerification,
  requestPasswordReset,
} from '../api/authClient'
import {
  getStoredPasswordResetRequest,
  savePasswordResetRequest,
  savePasswordResetVerification,
} from '../lib/passwordResetFlow'
import type { PasswordResetVerifyFormValues } from '../types'
import { OtpInputGroup } from './OtpInputGroup'

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

function calculateResendCountdown(
  requestedAt: number,
  resendAvailableInSeconds: number,
) {
  const resendAt = requestedAt + resendAvailableInSeconds * 1000

  return Math.max(0, Math.ceil((resendAt - Date.now()) / 1000))
}

function formatCountdown(seconds: number) {
  const minutes = String(Math.floor(seconds / 60)).padStart(2, '0')
  const remainingSeconds = String(seconds % 60).padStart(2, '0')

  return `${minutes}:${remainingSeconds}`
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

  const isCodeComplete = values.code.length === 6

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

    if (!isCodeComplete) {
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
        `Новый код отправлен на ${response.email}, если доступ активен.`,
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
    <form className="space-y-6" noValidate onSubmit={handleSubmit}>
      <FormField
        htmlFor="password-reset-verify-code"
        label="Код из письма"
        required
      >
        <OtpInputGroup
          aria-label="Код из письма"
          disabled={isSubmitting}
          id="password-reset-verify-code"
          onChange={(nextValue) => setFieldValue('code', nextValue)}
          value={values.code}
        />
      </FormField>

      <div className="rounded-[0.9rem] border border-slate-200/80 bg-slate-50/90 px-4 py-3 text-sm leading-6 text-slate-600">
        Если письмо не пришло, проверьте папку «Спам» или запросите новый код.
      </div>

      <InlineAlert message={infoMessage} tone="success" />
      <InlineAlert message={globalError} tone="error" />

      <PrimaryButton
        disabled={!isCodeComplete || isSubmitting || isResending}
        loading={isSubmitting}
        type="submit"
      >
        Продолжить
      </PrimaryButton>

      <div className="flex items-center justify-between gap-4 text-sm sm:text-[15px]">
        <Link
          className="inline-flex min-h-11 items-center rounded-[0.75rem] text-slate-700 transition hover:text-slate-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
          to={routePaths.auth.passwordResetRequest}
        >
          Изменить email
        </Link>

        <button
          className="inline-flex min-h-11 items-center rounded-[0.75rem] text-brand-800 transition hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:text-slate-400"
          disabled={isSubmitting || isResending || secondsRemaining > 0}
          onClick={handleResend}
          type="button"
        >
          {isResending ? 'Отправка...' : 'Отправить код повторно'}
        </button>
      </div>

      {secondsRemaining > 0 ? (
        <div className="text-sm text-slate-500">
          Повторная отправка будет доступна через{' '}
          <span className="font-semibold text-slate-800">
            {formatCountdown(secondsRemaining)}
          </span>
        </div>
      ) : null}
    </form>
  )
}
