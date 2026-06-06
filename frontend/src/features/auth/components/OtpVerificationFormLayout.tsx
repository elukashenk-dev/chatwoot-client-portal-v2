import type { FormEventHandler } from 'react'
import { Link } from 'react-router-dom'

import { FormField } from '../../../shared/ui/FormField'
import { InlineAlert } from '../../../shared/ui/InlineAlert'
import { PrimaryButton } from '../../../shared/ui/PrimaryButton'
import {
  authPrimaryLinkClassName,
  authSecondaryLinkClassName,
} from '../../../shared/ui/inputStyles'
import { OtpInputGroup } from './OtpInputGroup'

type OtpVerificationFormLayoutProps = {
  changeEmailLabel?: string
  changeEmailTo: string
  code: string
  codeInputId: string
  errorMessage?: string | null
  helperText: string
  infoMessage?: string | null
  isResending: boolean
  isSubmitting: boolean
  onChangeEmail?: () => void
  onCodeChange: (value: string) => void
  onResend: () => void
  onSubmit: FormEventHandler<HTMLFormElement>
  resendAvailableLabel?: string
  resendCooldownLabel?: (formattedCountdown: string) => string
  resendLoadingLabel?: string
  secondsRemaining: number
  submitLabel?: string
}

function formatCountdown(seconds: number) {
  const minutes = String(Math.floor(seconds / 60)).padStart(2, '0')
  const remainingSeconds = String(seconds % 60).padStart(2, '0')

  return `${minutes}:${remainingSeconds}`
}

export function OtpVerificationFormLayout({
  changeEmailLabel = 'Изменить email',
  changeEmailTo,
  code,
  codeInputId,
  errorMessage,
  helperText,
  infoMessage,
  isResending,
  isSubmitting,
  onChangeEmail,
  onCodeChange,
  onResend,
  onSubmit,
  resendAvailableLabel = 'Отправить код повторно',
  resendCooldownLabel = (formattedCountdown) =>
    `Повторить через ${formattedCountdown}`,
  resendLoadingLabel = 'Отправка...',
  secondsRemaining,
  submitLabel = 'Продолжить',
}: OtpVerificationFormLayoutProps) {
  const isCodeComplete = code.length === 6
  const isCooldownActive = secondsRemaining > 0
  const resendLabel = isResending
    ? resendLoadingLabel
    : isCooldownActive
      ? resendCooldownLabel(formatCountdown(secondsRemaining))
      : resendAvailableLabel

  return (
    <form
      className="space-y-4"
      data-testid="otp-verification-form"
      noValidate
      onSubmit={onSubmit}
    >
      <FormField
        htmlFor={codeInputId}
        label="Код из письма"
        labelHidden
        required
      >
        <OtpInputGroup
          aria-label="Код из письма"
          disabled={isSubmitting}
          id={codeInputId}
          onChange={onCodeChange}
          value={code}
        />
      </FormField>

      <div className="rounded-[0.6rem] bg-slate-100/80 px-3.5 py-3 text-sm leading-5 text-slate-500 shadow-sm">
        {helperText}
      </div>

      <InlineAlert message={infoMessage} tone="success" />
      <InlineAlert message={errorMessage} tone="error" />

      <PrimaryButton
        disabled={!isCodeComplete || isSubmitting || isResending}
        loading={isSubmitting}
        type="submit"
      >
        {submitLabel}
      </PrimaryButton>

      <div className="flex flex-col items-center gap-2 text-center text-sm sm:flex-row sm:justify-between sm:text-[15px]">
        {onChangeEmail ? (
          <button
            className={authSecondaryLinkClassName}
            onClick={onChangeEmail}
            type="button"
          >
            {changeEmailLabel}
          </button>
        ) : (
          <Link className={authSecondaryLinkClassName} to={changeEmailTo}>
            {changeEmailLabel}
          </Link>
        )}

        <button
          className={`${authPrimaryLinkClassName} disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline`}
          disabled={isSubmitting || isResending || isCooldownActive}
          onClick={onResend}
          type="button"
        >
          {resendLabel}
        </button>
      </div>
    </form>
  )
}
