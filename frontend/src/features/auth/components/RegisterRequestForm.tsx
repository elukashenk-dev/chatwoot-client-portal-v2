import type { FormEvent } from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'
import { FormField } from '../../../shared/ui/FormField'
import { InlineAlert } from '../../../shared/ui/InlineAlert'
import { PrimaryButton } from '../../../shared/ui/PrimaryButton'
import { TextField } from '../../../shared/ui/TextField'
import { MailIcon, UserPlusIcon } from '../../../shared/ui/icons'
import {
  ApiClientError,
  requestRegistrationVerification,
} from '../api/authClient'
import { saveRegistrationRequest } from '../lib/registrationFlow'
import { validateRegisterRequestForm } from '../lib/registerRequestValidation'
import type {
  RegisterRequestFormValues,
  TouchedRegisterRequestFields,
} from '../types'

const DEFAULT_VALUES: RegisterRequestFormValues = {
  fullName: '',
  email: '',
}

const DEFAULT_REQUEST_ERROR_MESSAGE =
  'Мы не смогли выполнить запрос. Если вы считаете, что у вас должен быть доступ, обратитесь в вашу компанию.'

function getVisibleFieldError(error?: string) {
  if (error === 'Введите email' || error === 'Введите имя') {
    return undefined
  }

  return error
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    return error.message
  }

  return DEFAULT_REQUEST_ERROR_MESSAGE
}

export function RegisterRequestForm() {
  const navigate = useNavigate()
  const [values, setValues] =
    useState<RegisterRequestFormValues>(DEFAULT_VALUES)
  const [touched, setTouched] = useState<TouchedRegisterRequestFields>({
    fullName: false,
    email: false,
  })
  const [focused, setFocused] = useState<TouchedRegisterRequestFields>({
    fullName: false,
    email: false,
  })
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)

  const fieldErrors = validateRegisterRequestForm(values)
  const visibleNameError =
    touched.fullName || hasSubmitted ? fieldErrors.fullName : undefined
  const visibleEmailError =
    touched.email || hasSubmitted ? fieldErrors.email : undefined
  const suppressEmailFormatError =
    focused.email && visibleEmailError === 'Проверьте формат email'
  const visibleNameErrorMessage = getVisibleFieldError(visibleNameError)
  const visibleEmailErrorMessage = suppressEmailFormatError
    ? undefined
    : getVisibleFieldError(visibleEmailError)
  const nameHasError = Boolean(visibleNameError)
  const emailHasError = Boolean(visibleEmailError) && !suppressEmailFormatError

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
    setFocused((currentFocused) => ({
      ...currentFocused,
      [field]: false,
    }))
    setTouched((currentTouched) => ({
      ...currentTouched,
      [field]: true,
    }))
  }

  function markFieldFocused(field: keyof TouchedRegisterRequestFields) {
    setFocused((currentFocused) => ({
      ...currentFocused,
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
    <form className="space-y-4" noValidate onSubmit={handleSubmit}>
      <FormField
        error={visibleNameErrorMessage}
        errorId={nameErrorId}
        htmlFor="register-full-name"
        label="Имя и фамилия"
        labelHidden
        required
      >
        <TextField
          aria-describedby={visibleNameErrorMessage ? nameErrorId : undefined}
          aria-invalid={nameHasError}
          autoComplete="name"
          className="h-[52px] rounded-[0.6rem] bg-slate-50/80 text-[17px] placeholder:text-slate-400"
          hasError={nameHasError}
          id="register-full-name"
          isFilled={values.fullName.trim().length > 0}
          leadingIcon={<UserPlusIcon className="h-6 w-6" />}
          name="fullName"
          onBlur={() => markFieldTouched('fullName')}
          onChange={(event) => setFieldValue('fullName', event.target.value)}
          onFocus={() => markFieldFocused('fullName')}
          placeholder="Имя и фамилия"
          required
          type="text"
          value={values.fullName}
        />
      </FormField>

      <FormField
        error={visibleEmailErrorMessage}
        errorId={emailErrorId}
        htmlFor="register-email"
        label="Email"
        labelHidden
        required
      >
        <TextField
          aria-describedby={visibleEmailErrorMessage ? emailErrorId : undefined}
          aria-invalid={emailHasError}
          autoComplete="email"
          className="h-[52px] rounded-[0.6rem] bg-slate-50/80 text-[17px] placeholder:text-slate-400"
          hasError={emailHasError}
          id="register-email"
          inputMode="email"
          isFilled={values.email.trim().length > 0}
          leadingIcon={<MailIcon className="h-6 w-6" />}
          name="email"
          onBlur={() => markFieldTouched('email')}
          onChange={(event) => setFieldValue('email', event.target.value)}
          onFocus={() => markFieldFocused('email')}
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
        loadingLabel="Проверка..."
        type="submit"
      >
        Продолжить
      </PrimaryButton>
    </form>
  )
}
