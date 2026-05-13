import type { FormEventHandler } from 'react'
import { Link } from 'react-router-dom'

import { FormField } from '../../../shared/ui/FormField'
import { InlineAlert } from '../../../shared/ui/InlineAlert'
import { PasswordField } from '../../../shared/ui/PasswordField'
import { PrimaryButton } from '../../../shared/ui/PrimaryButton'
import { LockIcon } from '../../../shared/ui/icons'
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
      className="space-y-4"
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
          className="h-[52px] rounded-[0.6rem] bg-slate-50/80 text-[17px] placeholder:text-slate-400"
          hasError={passwordHasError}
          id={passwordInputId}
          isFilled={newPassword.length > 0}
          leadingIcon={<LockIcon className="h-6 w-6" />}
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
          className="h-[52px] rounded-[0.6rem] bg-slate-50/80 text-[17px] placeholder:text-slate-400"
          hasError={confirmPasswordHasError}
          id={confirmPasswordInputId}
          isFilled={confirmPassword.length > 0}
          leadingIcon={<LockIcon className="h-6 w-6" />}
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
          className="inline-flex min-h-10 items-center rounded-[0.4rem] text-sm font-normal text-brand-700 underline-offset-4 transition hover:text-brand-800 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
          to={recoveryAction.to}
        >
          {recoveryAction.label}
        </Link>
      ) : null}

      <PrimaryButton
        disabled={!canSubmit || isSubmitting}
        loading={isSubmitting}
        loadingLabel="Сохранение..."
        type="submit"
      >
        Сохранить пароль
      </PrimaryButton>
    </form>
  )
}
