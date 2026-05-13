import type { FormEvent } from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'
import { FormField } from '../../../shared/ui/FormField'
import { InlineAlert } from '../../../shared/ui/InlineAlert'
import { PrimaryButton } from '../../../shared/ui/PrimaryButton'
import { TextField } from '../../../shared/ui/TextField'
import { MailIcon } from '../../../shared/ui/icons'
import {
  authFieldClassName,
  authFieldIconClassName,
} from '../../../shared/ui/inputStyles'
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

function getVisibleFieldError(error?: string) {
  if (error === 'Введите email') {
    return undefined
  }

  return error
}

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
  const [focused, setFocused] = useState<TouchedPasswordResetRequestFields>({
    email: false,
  })
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)

  const fieldErrors = validatePasswordResetRequestForm(values)
  const visibleEmailError =
    touched.email || hasSubmitted ? fieldErrors.email : undefined
  const suppressEmailFormatError =
    focused.email && visibleEmailError === 'Проверьте формат email'
  const visibleEmailErrorMessage = suppressEmailFormatError
    ? undefined
    : getVisibleFieldError(visibleEmailError)
  const emailHasError = Boolean(visibleEmailError) && !suppressEmailFormatError
  const emailErrorId = 'password-reset-email-error'

  function setFieldValue(nextValue: string) {
    setValues({ email: nextValue })
    setGlobalError(null)
  }

  function markFieldTouched() {
    setFocused({ email: false })
    setTouched({ email: true })
  }

  function markFieldFocused() {
    setFocused({ email: true })
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
    <form className="space-y-4" noValidate onSubmit={handleSubmit}>
      <FormField
        error={visibleEmailErrorMessage}
        errorId={emailErrorId}
        htmlFor="password-reset-email"
        label="Email"
        labelHidden
        required
      >
        <TextField
          aria-describedby={visibleEmailErrorMessage ? emailErrorId : undefined}
          aria-invalid={emailHasError}
          autoComplete="email"
          className={authFieldClassName}
          hasError={emailHasError}
          id="password-reset-email"
          inputMode="email"
          isFilled={values.email.trim().length > 0}
          leadingIcon={<MailIcon className={authFieldIconClassName} />}
          name="email"
          onBlur={markFieldTouched}
          onChange={(event) => setFieldValue(event.target.value)}
          onFocus={markFieldFocused}
          placeholder="name@company.ru"
          required
          type="email"
          value={values.email}
        />
      </FormField>

      <div className="rounded-[0.6rem] bg-slate-100/80 px-3.5 py-3 text-sm leading-5 text-slate-500 shadow-sm">
        Введите email, указанный при создании вашего профиля.
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
