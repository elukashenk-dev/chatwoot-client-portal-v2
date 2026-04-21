import type { FormEvent } from 'react'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { FormField } from '../../../shared/ui/FormField'
import { InlineAlert } from '../../../shared/ui/InlineAlert'
import { PasswordField } from '../../../shared/ui/PasswordField'
import { PrimaryButton } from '../../../shared/ui/PrimaryButton'
import { TextField } from '../../../shared/ui/TextField'
import { getAuthRequestErrorMessage } from '../lib/authErrors'
import { useAuthSession } from '../lib/authSessionContext'
import { validateLoginForm } from '../lib/loginValidation'
import { getPostLoginPath } from '../lib/postLoginRedirect'
import type { LoginFormValues, TouchedLoginFields } from '../types'

const DEFAULT_VALUES: LoginFormValues = {
  email: '',
  password: '',
}

export function LoginForm() {
  const location = useLocation()
  const navigate = useNavigate()
  const { errorMessage, signIn, status } = useAuthSession()
  const [values, setValues] = useState<LoginFormValues>(DEFAULT_VALUES)
  const [touched, setTouched] = useState<TouchedLoginFields>({
    email: false,
    password: false,
  })
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)

  const fieldErrors = validateLoginForm(values)
  const visibleGlobalError =
    globalError ?? (status === 'error' ? errorMessage : null)
  const visibleEmailError =
    touched.email || hasSubmitted ? fieldErrors.email : undefined
  const visiblePasswordError =
    touched.password || hasSubmitted ? fieldErrors.password : undefined

  const emailHintId = 'login-email-hint'
  const emailErrorId = 'login-email-error'
  const passwordErrorId = 'login-password-error'

  const emailDescribedBy = [
    emailHintId,
    visibleEmailError ? emailErrorId : undefined,
  ]
    .filter(Boolean)
    .join(' ')
  const passwordDescribedBy = [
    visiblePasswordError ? passwordErrorId : undefined,
  ]
    .filter(Boolean)
    .join(' ')

  function setFieldValue<Key extends keyof LoginFormValues>(
    field: Key,
    nextValue: LoginFormValues[Key],
  ) {
    setValues((currentValues) => ({
      ...currentValues,
      [field]: nextValue,
    }))
    setGlobalError(null)
  }

  function markFieldTouched(field: keyof TouchedLoginFields) {
    setTouched((currentTouched) => ({
      ...currentTouched,
      [field]: true,
    }))
  }

  function clearPasswordField() {
    setValues((currentValues) => ({
      ...currentValues,
      password: '',
    }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setHasSubmitted(true)
    setGlobalError(null)

    if (fieldErrors.email || fieldErrors.password) {
      return
    }

    setIsSubmitting(true)

    try {
      await signIn(values)
      clearPasswordField()
      setGlobalError(null)
      navigate(getPostLoginPath(location.state), { replace: true })
    } catch (error) {
      setGlobalError(getAuthRequestErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (status === 'checking') {
    return (
      <div className="space-y-4">
        <InlineAlert message="Проверяем текущую сессию..." tone="info" />

        <PrimaryButton disabled loading loadingLabel="Проверка...">
          Проверка...
        </PrimaryButton>
      </div>
    )
  }

  return (
    <form className="space-y-6" noValidate onSubmit={handleSubmit}>
      <FormField
        error={visibleEmailError}
        errorId={emailErrorId}
        hint="Используйте рабочий email, который уже известен вашей компании."
        hintId={emailHintId}
        htmlFor="login-email"
        label="Email"
        required
      >
        <TextField
          aria-describedby={emailDescribedBy || undefined}
          aria-invalid={Boolean(visibleEmailError)}
          autoComplete="email"
          hasError={Boolean(visibleEmailError)}
          id="login-email"
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

      <FormField
        error={visiblePasswordError}
        errorId={passwordErrorId}
        htmlFor="login-password"
        label="Пароль"
        required
      >
        <PasswordField
          aria-describedby={passwordDescribedBy || undefined}
          aria-invalid={Boolean(visiblePasswordError)}
          autoComplete="current-password"
          hasError={Boolean(visiblePasswordError)}
          id="login-password"
          name="password"
          onBlur={() => markFieldTouched('password')}
          onChange={(event) => setFieldValue('password', event.target.value)}
          placeholder="Введите пароль"
          required
          value={values.password}
        />
      </FormField>

      <InlineAlert message={visibleGlobalError} tone="error" />

      <PrimaryButton
        disabled={isSubmitting}
        loading={isSubmitting}
        loadingLabel="Вход..."
        type="submit"
      >
        Войти
      </PrimaryButton>
    </form>
  )
}
