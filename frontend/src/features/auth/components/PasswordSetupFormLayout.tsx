import type { FormEventHandler } from 'react'
import { Link } from 'react-router-dom'

import { FormField } from '../../../shared/ui/FormField'
import { InlineAlert } from '../../../shared/ui/InlineAlert'
import { PasswordField } from '../../../shared/ui/PasswordField'
import { PrimaryButton } from '../../../shared/ui/PrimaryButton'
import { LockIcon } from '../../../shared/ui/icons'
import {
  authFieldClassName,
  authFieldIconClassName,
  authPrimaryLinkClassName,
} from '../../../shared/ui/inputStyles'
import { PasswordRulesCard } from './PasswordRulesCard'

type PasswordSetupRecoveryAction = {
  label: string
  to: string
}

type PasswordSetupFormLayoutProps = {
  confirmPassword: string
  confirmPasswordError?: string
  confirmPasswordErrorId: string
  confirmPasswordHasError: boolean
  confirmPasswordInputId: string
  errorMessage?: string | null
  isDisabled?: boolean
  isSubmitting: boolean
  canSubmit: boolean
  newPassword: string
  passwordError?: string
  passwordErrorId: string
  passwordHasError: boolean
  passwordInputId: string
  recoveryAction?: PasswordSetupRecoveryAction | null
  onConfirmPasswordBlur: () => void
  onConfirmPasswordChange: (value: string) => void
  onNewPasswordBlur: () => void
  onNewPasswordChange: (value: string) => void
  onSubmit: FormEventHandler<HTMLFormElement>
}

export function PasswordSetupFormLayout({
  canSubmit,
  confirmPassword,
  confirmPasswordError,
  confirmPasswordErrorId,
  confirmPasswordHasError,
  confirmPasswordInputId,
  errorMessage,
  isDisabled = false,
  isSubmitting,
  newPassword,
  onConfirmPasswordBlur,
  onConfirmPasswordChange,
  onNewPasswordBlur,
  onNewPasswordChange,
  onSubmit,
  passwordError,
  passwordErrorId,
  passwordHasError,
  passwordInputId,
  recoveryAction,
}: PasswordSetupFormLayoutProps) {
  return (
    <form
      className="auth-flow-form"
      data-testid="password-setup-form"
      noValidate
      onSubmit={onSubmit}
    >
      <FormField
        error={passwordError}
        errorId={passwordErrorId}
        htmlFor={passwordInputId}
        label="Новый пароль"
        labelHidden
        required
      >
        <PasswordField
          aria-describedby={passwordError ? passwordErrorId : undefined}
          aria-invalid={passwordHasError}
          autoComplete="new-password"
          className={authFieldClassName}
          disabled={isDisabled}
          hasError={passwordHasError}
          id={passwordInputId}
          isFilled={newPassword.length > 0}
          leadingIcon={<LockIcon className={authFieldIconClassName} />}
          name="newPassword"
          onBlur={onNewPasswordBlur}
          onChange={(event) => onNewPasswordChange(event.target.value)}
          placeholder="Введите новый пароль"
          required
          value={newPassword}
        />
      </FormField>

      <FormField
        error={confirmPasswordError}
        errorId={confirmPasswordErrorId}
        htmlFor={confirmPasswordInputId}
        label="Подтвердите пароль"
        labelHidden
        required
      >
        <PasswordField
          aria-describedby={
            confirmPasswordError ? confirmPasswordErrorId : undefined
          }
          aria-invalid={confirmPasswordHasError}
          autoComplete="new-password"
          className={authFieldClassName}
          disabled={isDisabled}
          hasError={confirmPasswordHasError}
          id={confirmPasswordInputId}
          isFilled={confirmPassword.length > 0}
          leadingIcon={<LockIcon className={authFieldIconClassName} />}
          name="confirmPassword"
          onBlur={onConfirmPasswordBlur}
          onChange={(event) => onConfirmPasswordChange(event.target.value)}
          placeholder="Повторите пароль"
          required
          value={confirmPassword}
        />
      </FormField>

      <PasswordRulesCard
        confirmPassword={confirmPassword}
        password={newPassword}
      />

      <InlineAlert message={errorMessage} tone="error" />

      {recoveryAction ? (
        <Link
          className={`${authPrimaryLinkClassName} inline-flex min-h-10 items-center text-sm`}
          to={recoveryAction.to}
        >
          {recoveryAction.label}
        </Link>
      ) : null}

      <PrimaryButton
        disabled={!canSubmit || isSubmitting || isDisabled}
        loading={isSubmitting}
        loadingLabel="Сохранение..."
        type="submit"
      >
        Сохранить пароль
      </PrimaryButton>
    </form>
  )
}
