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
}

export type RegisterRequestFormValues = {
  email: string
  fullName: string
}

export type RegisterRequestFormErrors = Partial<
  Record<keyof RegisterRequestFormValues, string>
>

export type TouchedRegisterRequestFields = Record<
  keyof RegisterRequestFormValues,
  boolean
>

export type RegisterVerifyFormValues = {
  code: string
}

export type RegisterVerifyFormErrors = Partial<
  Record<keyof RegisterVerifyFormValues, string>
>

export type TouchedRegisterVerifyFields = Record<
  keyof RegisterVerifyFormValues,
  boolean
>

export type RegisterSetPasswordFormValues = {
  confirmPassword: string
  newPassword: string
}

export type RegisterSetPasswordFormErrors = Partial<
  Record<keyof RegisterSetPasswordFormValues, string>
>

export type TouchedRegisterSetPasswordFields = Record<
  keyof RegisterSetPasswordFormValues,
  boolean
>

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
