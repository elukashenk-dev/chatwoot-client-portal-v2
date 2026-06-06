import type { FormEventHandler } from 'react'

import { OtpVerificationFormLayout } from '../../auth/components/OtpVerificationFormLayout'

type AdminCodeStepProps = {
  code: string
  email: string
  errorMessage?: string | null
  infoMessage?: string | null
  isResending: boolean
  isSubmitting: boolean
  onChangeEmail: () => void
  onCodeChange: (code: string) => void
  onResend: () => void
  onSubmit: FormEventHandler<HTMLFormElement>
  secondsRemaining: number
}

export function AdminCodeStep({
  code,
  email,
  errorMessage,
  infoMessage,
  isResending,
  isSubmitting,
  onChangeEmail,
  onCodeChange,
  onResend,
  onSubmit,
  secondsRemaining,
}: AdminCodeStepProps) {
  return (
    <OtpVerificationFormLayout
      changeEmailLabel="Изменить email"
      changeEmailTo="/admin/login"
      code={code}
      codeInputId="admin-login-code"
      errorMessage={errorMessage}
      helperText={`Введите 6-значный код, который мы отправили на ${email}.`}
      infoMessage={infoMessage}
      isResending={isResending}
      isSubmitting={isSubmitting}
      onChangeEmail={onChangeEmail}
      onCodeChange={onCodeChange}
      onResend={onResend}
      onSubmit={onSubmit}
      secondsRemaining={secondsRemaining}
      submitLabel="Войти в админ-консоль"
    />
  )
}
