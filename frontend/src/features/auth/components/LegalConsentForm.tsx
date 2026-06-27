import type { FormEvent } from 'react'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'
import { InlineAlert } from '../../../shared/ui/InlineAlert'
import { PrimaryButton } from '../../../shared/ui/PrimaryButton'
import {
  acceptCodeLoginLegal,
  ApiClientError,
} from '../api/authClient'
import { useAuthSession } from '../lib/authSessionContext'
import {
  clearPasswordlessLoginFlow,
  getStoredPasswordlessLoginLegalContinuation,
} from '../lib/passwordlessLoginFlow'
import { getPostLoginPath } from '../lib/postLoginRedirect'
import {
  LegalConsentCheckboxes,
  type LegalConsentCheckboxesValue,
} from './LegalConsentCheckboxes'

const DEFAULT_LEGAL_CONSENT: LegalConsentCheckboxesValue = {
  personalDataConsentAccepted: false,
  termsAccepted: false,
}

const DEFAULT_REQUEST_ERROR_MESSAGE =
  'Мы не смогли открыть доступ. Попробуйте подтвердить email еще раз.'

function getErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    return error.message
  }

  return DEFAULT_REQUEST_ERROR_MESSAGE
}

export function LegalConsentForm() {
  const location = useLocation()
  const navigate = useNavigate()
  const { completeAuthenticatedSession } = useAuthSession()
  const [legalContinuation] = useState(() =>
    getStoredPasswordlessLoginLegalContinuation(),
  )
  const [legalConsent, setLegalConsent] = useState(DEFAULT_LEGAL_CONSENT)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)

  const canSubmit =
    legalConsent.termsAccepted && legalConsent.personalDataConsentAccepted

  function updateLegalConsent(nextValue: LegalConsentCheckboxesValue) {
    setLegalConsent(nextValue)
    setGlobalError(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setGlobalError(null)

    if (!legalContinuation) {
      setGlobalError('Сначала подтвердите email кодом.')
      return
    }

    if (!canSubmit) {
      return
    }

    setIsSubmitting(true)

    try {
      const response = await acceptCodeLoginLegal({
        continuationToken: legalContinuation.continuationToken,
        email: legalContinuation.email,
        personalDataConsentAccepted: true,
        termsAccepted: true,
      })

      clearPasswordlessLoginFlow()
      await completeAuthenticatedSession(response)
      navigate(getPostLoginPath(location.state), { replace: true })
    } catch (error) {
      setGlobalError(getErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!legalContinuation) {
    return (
      <div className="space-y-4">
        <InlineAlert message="Сначала подтвердите email кодом." tone="error" />

        <Link
          className="inline-flex min-h-11 items-center rounded-[0.75rem] px-3 text-sm font-medium text-brand-800 transition hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
          state={location.state}
          to={routePaths.auth.codeLoginRequest}
        >
          Получить код
        </Link>
      </div>
    )
  }

  return (
    <form className="auth-flow-form" noValidate onSubmit={handleSubmit}>
      <p className="auth-form-note">
        Чтобы открыть чат, примите условия сервиса и согласие на обработку
        персональных данных.
      </p>

      <LegalConsentCheckboxes
        disabled={isSubmitting}
        onChange={updateLegalConsent}
        value={legalConsent}
      />

      <InlineAlert message={globalError} tone="error" />

      <PrimaryButton
        disabled={!canSubmit || isSubmitting}
        loading={isSubmitting}
        loadingLabel="Открываем чат..."
        type="submit"
      >
        Продолжить
      </PrimaryButton>
    </form>
  )
}
