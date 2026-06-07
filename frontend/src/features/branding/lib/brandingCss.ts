import type { CSSProperties } from 'react'

import type { PublicBranding } from '../api/publicBrandingClient'
import { defaultBrandingColors } from './brandingDefaults'

type RgbColor = {
  b: number
  g: number
  r: number
}

export type BrandingCssProperties = CSSProperties &
  Record<`--${string}`, string>

const black: RgbColor = { b: 0, g: 0, r: 0 }
const white: RgbColor = { b: 255, g: 255, r: 255 }

function parseHexColor(value: string): RgbColor | null {
  const normalized = value.trim()

  if (/^#[\da-f]{3}$/i.test(normalized)) {
    return {
      b: Number.parseInt(normalized[3] + normalized[3], 16),
      g: Number.parseInt(normalized[2] + normalized[2], 16),
      r: Number.parseInt(normalized[1] + normalized[1], 16),
    }
  }

  if (!/^#[\da-f]{6}$/i.test(normalized)) {
    return null
  }

  return {
    b: Number.parseInt(normalized.slice(5, 7), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    r: Number.parseInt(normalized.slice(1, 3), 16),
  }
}

function toHexColor({ b, g, r }: RgbColor) {
  return `#${[r, g, b]
    .map((channel) =>
      Math.round(channel).toString(16).padStart(2, '0').slice(0, 2),
    )
    .join('')}`
}

function mixColor(color: RgbColor, target: RgbColor, targetWeight: number) {
  return {
    b: color.b * (1 - targetWeight) + target.b * targetWeight,
    g: color.g * (1 - targetWeight) + target.g * targetWeight,
    r: color.r * (1 - targetWeight) + target.r * targetWeight,
  }
}

function normalizeHexColor(value: string, fallback: string) {
  return parseHexColor(value) ? value.trim() : fallback
}

function getReadableForeground(backgroundColor: string) {
  const color = parseHexColor(backgroundColor)

  if (!color) {
    return {
      foreground: '#0f172a',
      mutedForeground: '#64748b',
    }
  }

  const relativeLuminance =
    (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255
  const isDark = relativeLuminance < 0.55

  return {
    foreground: isDark ? '#ffffff' : '#0f172a',
    mutedForeground: isDark ? 'rgb(255 255 255 / 0.74)' : '#64748b',
  }
}

function cssUrlValue(imageUrl?: string | null) {
  if (!imageUrl) {
    return 'none'
  }

  return `url("${imageUrl.replaceAll('\\', '\\\\').replaceAll('"', '%22')}")`
}

function createBrandColorVariables(primaryColor: string, accentColor: string) {
  const primary = parseHexColor(primaryColor) ?? parseHexColor('#112540')!
  const accent = parseHexColor(accentColor) ?? parseHexColor('#4676b4')!

  return {
    '--color-brand-50': toHexColor(mixColor(primary, white, 0.94)),
    '--color-brand-100': toHexColor(mixColor(primary, white, 0.88)),
    '--color-brand-200': toHexColor(mixColor(primary, white, 0.72)),
    '--color-brand-300': toHexColor(mixColor(accent, white, 0.52)),
    '--color-brand-400': toHexColor(mixColor(accent, white, 0.32)),
    '--color-brand-500': toHexColor(accent),
    '--color-brand-600': toHexColor(mixColor(primary, white, 0.12)),
    '--color-brand-700': toHexColor(mixColor(primary, black, 0.04)),
    '--color-brand-800': toHexColor(primary),
    '--color-brand-900': toHexColor(mixColor(primary, black, 0.24)),
    '--color-chat-outgoing': toHexColor(primary),
  }
}

export function createBrandingCssProperties(
  branding: PublicBranding,
): BrandingCssProperties {
  const primaryColor = normalizeHexColor(
    branding.colors.primary,
    defaultBrandingColors.primary,
  )
  const accentColor = normalizeHexColor(
    branding.colors.accent,
    defaultBrandingColors.accent,
  )
  const authBackgroundColor = normalizeHexColor(
    branding.colors.authBackground,
    defaultBrandingColors.authBackground,
  )
  const chatBackgroundColor = normalizeHexColor(
    branding.colors.chatBackground,
    defaultBrandingColors.chatBackground,
  )
  const chatHeaderBackgroundColor = normalizeHexColor(
    branding.colors.chatHeaderBackground,
    defaultBrandingColors.chatHeaderBackground,
  )
  const { foreground, mutedForeground } = getReadableForeground(
    chatHeaderBackgroundColor,
  )

  return {
    ...createBrandColorVariables(primaryColor, accentColor),
    '--portal-auth-background-color': authBackgroundColor,
    '--portal-auth-background-image': cssUrlValue(
      branding.assets.auth_background_image?.publicUrl,
    ),
    '--portal-chat-background-color': chatBackgroundColor,
    '--portal-chat-background-image': cssUrlValue(
      branding.assets.chat_background_image?.publicUrl,
    ),
    '--portal-chat-header-background-color': chatHeaderBackgroundColor,
    '--portal-chat-header-background-image': cssUrlValue(
      branding.assets.chat_header_background_image?.publicUrl,
    ),
    '--portal-chat-header-foreground': foreground,
    '--portal-chat-header-muted-foreground': mutedForeground,
  }
}
