import { z } from 'zod'

import { ApiError } from '../../lib/errors.js'
import { isValidSupportPhoneDisplay } from './supportPhone.js'

const colorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/u)
  .transform((value) => value.toLowerCase())
const authBackgroundOverlaySchema = z.enum(['none', 'light', 'dark'])
const authBrandPlacementSchema = z.enum(['left', 'center', 'right'])
const authButtonStyleSchema = z.enum(['solid', 'gradient'])
const authColorSchemeSchema = z.enum(['light', 'dark'])
const authFieldStyleSchema = z.enum(['solid', 'translucent', 'outline'])

function optionalText(maxLength: number) {
  return z
    .union([
      z
        .string()
        .trim()
        .max(maxLength)
        .transform((value) => value || null),
      z.null(),
    ])
    .optional()
}

function optionalSupportPhone() {
  return z
    .union([
      z
        .string()
        .trim()
        .max(40)
        .refine(isValidSupportPhoneDisplay, {
          message: 'Введите телефон в международном формате.',
        })
        .transform((value) => value || null),
      z.null(),
    ])
    .optional()
}

export const adminBrandingPatchSchema = z
  .object({
    appearance: z
      .object({
        authBackgroundOverlay: authBackgroundOverlaySchema.optional(),
        authButtonStyle: authButtonStyleSchema.optional(),
        authColorScheme: authColorSchemeSchema.optional(),
        authFieldStyle: authFieldStyleSchema.optional(),
      })
      .strict()
      .optional(),
    colors: z
      .object({
        accent: colorSchema.optional(),
        authBackground: colorSchema.optional(),
        authMutedText: colorSchema.optional(),
        authText: colorSchema.optional(),
        chatBackground: colorSchema.optional(),
        chatHeaderBackground: colorSchema.optional(),
        chatHeaderText: colorSchema.optional(),
        chatMutedText: colorSchema.optional(),
        chatText: colorSchema.optional(),
        primary: colorSchema.optional(),
      })
      .strict()
      .optional(),
    copy: z
      .object({
        authSubtitle: optionalText(280),
        authTitle: optionalText(120),
        chatEmptyBody: optionalText(280),
        chatEmptyTitle: optionalText(120),
        chatInfoTitle: optionalText(120),
      })
      .strict()
      .optional(),
    layout: z
      .object({
        authBrandPlacement: authBrandPlacementSchema.optional(),
      })
      .strict()
      .optional(),
    portalName: optionalText(120),
    supportLabel: optionalText(120),
    supportPhoneDisplay: optionalSupportPhone(),
  })
  .strict()

export type AdminBrandingPatch = z.infer<typeof adminBrandingPatchSchema>

export function parseAdminBrandingPatch(input: unknown): AdminBrandingPatch {
  const result = adminBrandingPatchSchema.safeParse(input)

  if (!result.success) {
    throw new ApiError(
      400,
      'BRANDING_SETTINGS_INVALID',
      'Проверьте значения настроек брендинга.',
    )
  }

  return result.data
}
