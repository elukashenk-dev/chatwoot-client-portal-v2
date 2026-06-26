import type { FormEvent, ReactNode } from 'react'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'
import { FormField } from '../../../shared/ui/FormField'
import { InlineAlert } from '../../../shared/ui/InlineAlert'
import { PasswordField } from '../../../shared/ui/PasswordField'
import { PrimaryButton } from '../../../shared/ui/PrimaryButton'
import { TextField } from '../../../shared/ui/TextField'
import { LockIcon, MailIcon } from '../../../shared/ui/icons'
import {
  authFieldClassName,
  authFieldIconClassName,
} from '../../../shared/ui/inputStyles'
import { getAuthRequestErrorMessage } from '../lib/authErrors'
import { useAuthSession } from '../lib/authSessionContext'
import { validateLoginForm } from '../lib/loginValidation'
import { getPostLoginPath } from '../lib/postLoginRedirect'
import type { LoginFormValues, TouchedLoginFields } from '../types'

const DEFAULT_VALUES: LoginFormValues = {
  email: '',
  password: '',
}

type LoginFormProps = {
  legalNotice?: ReactNode
}

function getVisibleFieldError(error?: string) {
  if (error === 'Введите email' || error === 'Введите пароль') {
    return undefined
  }

  return error
}

export function LoginForm({ legalNotice }: LoginFormProps = {}) {
  const location = useLocation()
  const navigate = useNavigate()
  const { errorMessage, signIn, status } = useAuthSession()
  const [values, setValues] = useState<LoginFormValues>(DEFAULT_VALUES)
  const [touched, setTouched] = useState<TouchedLoginFields>({
    email: false,
    password: false,
  })
  const [focused, setFocused] = useState<TouchedLoginFields>({
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
  const suppressEmailFormatError =
    focused.email && visibleEmailError === 'Проверьте формат email'
  const visibleEmailErrorMessage = suppressEmailFormatError
    ? undefined
    : getVisibleFieldError(visibleEmailError)
  const visiblePasswordErrorMessage = getVisibleFieldError(visiblePasswordError)
  const emailHasError = Boolean(visibleEmailError) && !suppressEmailFormatError
  const passwordHasError = Boolean(visiblePasswordError)

  const emailErrorId = 'login-email-error'
  const passwordErrorId = 'login-password-error'

  const emailDescribedBy = [visibleEmailErrorMessage ? emailErrorId : undefined]
    .filter(Boolean)
    .join(' ')
  const passwordDescribedBy = [
    visiblePasswordErrorMessage ? passwordErrorId : undefined,
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
    setFocused((currentFocused) => ({
      ...currentFocused,
      [field]: false,
    }))
    setTouched((currentTouched) => ({
      ...currentTouched,
      [field]: true,
    }))
  }

  function markFieldFocused(field: keyof TouchedLoginFields) {
    setFocused((currentFocused) => ({
      ...currentFocused,
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
    <form className="auth-login-form" noValidate onSubmit={handleSubmit}>
      <FormField
        error={visibleEmailErrorMessage}
        errorId={emailErrorId}
        htmlFor="login-email"
        label="Email"
        labelHidden
        required
      >
        <TextField
          aria-describedby={emailDescribedBy || undefined}
          aria-invalid={emailHasError}
          autoComplete="email"
          className={authFieldClassName}
          hasError={emailHasError}
          id="login-email"
          inputMode="email"
          isFilled={values.email.trim().length > 0}
          leadingIcon={<MailIcon className={authFieldIconClassName} />}
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

      <FormField
        error={visiblePasswordErrorMessage}
        errorId={passwordErrorId}
        htmlFor="login-password"
        label="Пароль"
        labelHidden
        required
      >
        <PasswordField
          aria-describedby={passwordDescribedBy || undefined}
          aria-invalid={passwordHasError}
          autoComplete="current-password"
          className={authFieldClassName}
          hasError={passwordHasError}
          id="login-password"
          isFilled={values.password.length > 0}
          leadingIcon={<LockIcon className={authFieldIconClassName} />}
          name="password"
          onBlur={() => markFieldTouched('password')}
          onChange={(event) => setFieldValue('password', event.target.value)}
          onFocus={() => markFieldFocused('password')}
          placeholder="Введите пароль"
          required
          value={values.password}
        />
      </FormField>

      <Link
        className="auth-code-login-link"
        to={routePaths.auth.codeLoginRequest}
      >
        <span>Уже есть аккаунт без пароля? Войти по коду из почты.</span>
      </Link>

      <InlineAlert message={visibleGlobalError} tone="error" />

      {legalNotice}

      <PrimaryButton
        className="auth-login-submit bg-brand-900 hover:bg-brand-800"
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
