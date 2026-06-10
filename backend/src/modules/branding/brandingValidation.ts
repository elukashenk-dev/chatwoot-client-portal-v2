import { z } from 'zod'

import { ApiError } from '../../lib/errors.js'

const colorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/u)
  .transform((value) => value.toLowerCase())
const opacitySchema = z.number().int().min(0).max(100)

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

export const adminBrandingPatchSchema = z
  .object({
    colors: z
      .object({
        accent: colorSchema.optional(),
        authBackground: colorSchema.optional(),
        authContentSurface: colorSchema.optional(),
        authContentSurfaceOpacity: opacitySchema.optional(),
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
    portalName: optionalText(120),
    supportLabel: optionalText(120),
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
