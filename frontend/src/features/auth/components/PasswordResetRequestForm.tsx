import type { FormEvent } from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'
import { FormField } from '../../../shared/ui/FormField'
import { InlineAlert } from '../../../shared/ui/InlineAlert'
import { PrimaryButton } from '../../../shared/ui/PrimaryButton'
import { TextField } from '../../../shared/ui/TextField'
import { ApiClientError, requestPasswordReset } from '../api/authClient'
import { savePasswordResetRequest } from '../lib/passwordResetFlow'
import { validatePasswordResetRequestForm } from '../lib/passwordResetRequestValidation'
import type {
  PasswordResetRequestFormValues,
  TouchedPasswordResetRequestFields,
} from '../types'

const DEFAULT_VALUES: PasswordResetRequestFormValues = {
  email: '',
}

const RESET_ERROR_MESSAGE =
  'Мы не смогли выполнить запрос. Попробуйте еще раз чуть позже.'

function getErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    return error.message
  }

  return RESET_ERROR_MESSAGE
}

export function PasswordResetRequestForm() {
  const navigate = useNavigate()
  const [values, setValues] =
    useState<PasswordResetRequestFormValues>(DEFAULT_VALUES)
  const [touched, setTouched] = useState<TouchedPasswordResetRequestFields>({
    email: false,
  })
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)

  const fieldErrors = validatePasswordResetRequestForm(values)
  const visibleEmailError =
    touched.email || hasSubmitted ? fieldErrors.email : undefined
  const emailErrorId = 'password-reset-email-error'

  function setFieldValue(nextValue: string) {
    setValues({ email: nextValue })
    setGlobalError(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setHasSubmitted(true)
    setGlobalError(null)

    if (fieldErrors.email) {
      return
    }

    setIsSubmitting(true)

    try {
      const response = await requestPasswordReset({
        email: values.email,
      })

      savePasswordResetRequest({
        email: response.email,
        expiresInSeconds: response.expiresInSeconds,
        resendAvailableInSeconds: response.resendAvailableInSeconds,
      })

      navigate(routePaths.auth.passwordResetVerify)
    } catch (error) {
      setGlobalError(getErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="space-y-6" noValidate onSubmit={handleSubmit}>
      <FormField
        error={visibleEmailError}
        errorId={emailErrorId}
        htmlFor="password-reset-email"
        label="Email"
        required
      >
        <TextField
          aria-describedby={visibleEmailError ? emailErrorId : undefined}
          aria-invalid={Boolean(visibleEmailError)}
          autoComplete="email"
          hasError={Boolean(visibleEmailError)}
          id="password-reset-email"
          inputMode="email"
          name="email"
          onBlur={() => setTouched({ email: true })}
          onChange={(event) => setFieldValue(event.target.value)}
          placeholder="name@company.ru"
          required
          type="email"
          value={values.email}
        />
      </FormField>

      <div className="rounded-[0.9rem] border border-slate-200/80 bg-slate-50/90 px-4 py-3 text-sm leading-6 text-slate-600">
        Используйте email, который уже известен вашей компании. Если доступ не
        найден, обратитесь в вашу компанию.
      </div>

      <InlineAlert message={globalError} tone="error" />

      <PrimaryButton
        disabled={isSubmitting}
        loading={isSubmitting}
        loadingLabel="Отправка..."
        type="submit"
      >
        Получить код
      </PrimaryButton>
    </form>
  )
}
