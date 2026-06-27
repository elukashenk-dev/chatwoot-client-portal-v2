import type { FormEventHandler } from 'react'

import { FormField } from '../../../shared/ui/FormField'
import { InlineAlert } from '../../../shared/ui/InlineAlert'
import { PrimaryButton } from '../../../shared/ui/PrimaryButton'
import { TextField } from '../../../shared/ui/TextField'

type AdminEmailStepProps = {
  email: string
  errorMessage?: string | null
  isSubmitting: boolean
  onEmailChange: (email: string) => void
  onSubmit: FormEventHandler<HTMLFormElement>
}

const emailInputId = 'admin-email'

export function AdminEmailStep({
  email,
  errorMessage,
  isSubmitting,
  onEmailChange,
  onSubmit,
}: AdminEmailStepProps) {
  const isEmailEmpty = email.trim().length === 0

  return (
    <form className="space-y-4" noValidate onSubmit={onSubmit}>
      <FormField
        htmlFor={emailInputId}
        hint="Мы отправим 6-значный код на email администратора поддержки."
        label="Email администратора"
        required
      >
        <TextField
          aria-label="Email администратора"
          autoComplete="email"
          disabled={isSubmitting}
          id={emailInputId}
          inputMode="email"
          isFilled={email.length > 0}
          onChange={(event) => onEmailChange(event.target.value)}
          type="email"
          value={email}
        />
      </FormField>

      <InlineAlert message={errorMessage} tone="error" />

      <PrimaryButton
        disabled={isEmailEmpty || isSubmitting}
        loading={isSubmitting}
        type="submit"
      >
        Получить код
      </PrimaryButton>
    </form>
  )
}
