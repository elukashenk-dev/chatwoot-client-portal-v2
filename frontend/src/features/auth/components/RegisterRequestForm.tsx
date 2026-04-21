import type { FormEvent } from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'
import { FormField } from '../../../shared/ui/FormField'
import { InlineAlert } from '../../../shared/ui/InlineAlert'
import { PrimaryButton } from '../../../shared/ui/PrimaryButton'
import { TextField } from '../../../shared/ui/TextField'
import {
  ApiClientError,
  requestRegistrationVerification,
} from '../api/authClient'
import { saveRegistrationRequest } from '../lib/registrationFlow'
import { validateRegisterRequestForm } from '../lib/registerRequestValidation'
import type { RegisterRequestFormValues, TouchedRegisterRequestFields } from '../types'

const DEFAULT_VALUES: RegisterRequestFormValues = {
  fullName: '',
  email: '',
}

const DEFAULT_REQUEST_ERROR_MESSAGE =
  'Мы не смогли выполнить запрос. Если вы считаете, что у вас должен быть доступ, обратитесь в вашу компанию.'

function getErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    return error.message
  }

  return DEFAULT_REQUEST_ERROR_MESSAGE
}

export function RegisterRequestForm() {
  const navigate = useNavigate()
  const [values, setValues] = useState<RegisterRequestFormValues>(DEFAULT_VALUES)
  const [touched, setTouched] = useState<TouchedRegisterRequestFields>({
    fullName: false,
    email: false,
  })
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)

  const fieldErrors = validateRegisterRequestForm(values)
  const visibleNameError = touched.fullName || hasSubmitted ? fieldErrors.fullName : undefined
  const visibleEmailError = touched.email || hasSubmitted ? fieldErrors.email : undefined

  const nameErrorId = 'register-name-error'
  const emailErrorId = 'register-email-error'

  function setFieldValue<Key extends keyof RegisterRequestFormValues>(
    field: Key,
    nextValue: RegisterRequestFormValues[Key],
  ) {
    setValues((currentValues) => ({
      ...currentValues,
      [field]: nextValue,
    }))
    setGlobalError(null)
  }

  function markFieldTouched(field: keyof TouchedRegisterRequestFields) {
    setTouched((currentTouched) => ({
      ...currentTouched,
      [field]: true,
    }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setHasSubmitted(true)
    setGlobalError(null)

    if (fieldErrors.fullName || fieldErrors.email) {
      return
    }

    setIsSubmitting(true)

    try {
      const response = await requestRegistrationVerification(values)

      saveRegistrationRequest({
        email: response.email,
        expiresInSeconds: response.expiresInSeconds,
        fullName: values.fullName,
        resendAvailableInSeconds: response.resendAvailableInSeconds,
      })
      setGlobalError(null)
      navigate(routePaths.auth.registerVerify)
    } catch (error) {
      setGlobalError(getErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="space-y-6" noValidate onSubmit={handleSubmit}>
      <FormField
        error={visibleNameError}
        errorId={nameErrorId}
        htmlFor="register-full-name"
        label="Имя и фамилия"
        required
      >
        <TextField
          aria-describedby={visibleNameError ? nameErrorId : undefined}
          aria-invalid={Boolean(visibleNameError)}
          autoComplete="name"
          hasError={Boolean(visibleNameError)}
          id="register-full-name"
          name="fullName"
          onBlur={() => markFieldTouched('fullName')}
          onChange={(event) => setFieldValue('fullName', event.target.value)}
          placeholder="Введите ваше имя"
          required
          type="text"
          value={values.fullName}
        />
      </FormField>

      <FormField
        error={visibleEmailError}
        errorId={emailErrorId}
        htmlFor="register-email"
        label="Email"
        required
      >
        <TextField
          aria-describedby={visibleEmailError ? emailErrorId : undefined}
          aria-invalid={Boolean(visibleEmailError)}
          autoComplete="email"
          hasError={Boolean(visibleEmailError)}
          id="register-email"
          inputMode="email"
          name="email"
          onBlur={() => markFieldTouched('email')}
          onChange={(event) => setFieldValue('email', event.target.value)}
          placeholder="name@company.ru"
          required
          type="email"
          value={values.email}
        />
      </FormField>

      <div className="rounded-[0.9rem] border border-slate-200/80 bg-slate-50/90 px-4 py-3 text-sm leading-6 text-slate-600">
        Доступ предоставляется для email, который уже известен вашей компании.
      </div>

      <InlineAlert message={globalError} tone="error" />

      <PrimaryButton
        disabled={isSubmitting}
        loading={isSubmitting}
        loadingLabel="Проверка..."
        type="submit"
      >
        Продолжить
      </PrimaryButton>
    </form>
  )
}
