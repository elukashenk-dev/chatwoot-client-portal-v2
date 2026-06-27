export type LoginFormValues = {
  email: string
  password: string
}

export type LoginFormErrors = Partial<Record<keyof LoginFormValues, string>>

export type TouchedLoginFields = Record<keyof LoginFormValues, boolean>

export type AuthenticatedPortalUser = {
  email: string
  fullName: string | null
  id: number
  passwordConfigured: boolean
}

export type AuthenticatedSession = {
  expiresAt: string
}

export type AuthenticatedPortalSession = {
  session: AuthenticatedSession
  user: AuthenticatedPortalUser
}

export type PasswordSetupFormValues = {
  confirmPassword: string
  newPassword: string
}

export type PasswordSetupFormErrors = Partial<
  Record<keyof PasswordSetupFormValues, string>
>

export type TouchedPasswordSetupFields = Record<keyof PasswordSetupFormValues, boolean>

export type PasswordResetRequestFormValues = {
  email: string
}

export type PasswordResetRequestFormErrors = Partial<
  Record<keyof PasswordResetRequestFormValues, string>
>

export type TouchedPasswordResetRequestFields = Record<
  keyof PasswordResetRequestFormValues,
  boolean
>

export type PasswordResetVerifyFormValues = {
  code: string
}

export type PasswordlessLoginRequestFormValues = {
  email: string
}

export type PasswordlessLoginRequestFormErrors = Partial<
  Record<keyof PasswordlessLoginRequestFormValues, string>
>

export type TouchedPasswordlessLoginRequestFields = Record<
  keyof PasswordlessLoginRequestFormValues,
  boolean
>

export type PasswordlessLoginVerifyFormValues = {
  code: string
}

export type PasswordResetSetPasswordFormValues = {
  confirmPassword: string
  newPassword: string
}

export type PasswordResetSetPasswordFormErrors = Partial<
  Record<keyof PasswordResetSetPasswordFormValues, string>
>

export type TouchedPasswordResetSetPasswordFields = Record<
  keyof PasswordResetSetPasswordFormValues,
  boolean
>
