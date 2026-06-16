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

const productionVisualDefaults = {
  authFrameBackground: '#e2e8f0',
  authSurfaceBackground: '#ffffff',
  chatAppBackground: '#e2e8f0',
  chatOutgoing: '#465a72',
  chatSurfaceBackground: '#ffffff',
  darkHeaderBorder: 'rgb(226 232 240 / 0.4)',
  darkHeaderControlBorder: 'rgb(255 255 255 / 0.2)',
  darkHeaderControlHoverBackground: 'rgb(255 255 255 / 0.15)',
  darkHeaderControlHoverText: '#ffffff',
  darkHeaderControlSurface: 'rgb(255 255 255 / 0.1)',
  darkHeaderControlText: 'rgb(255 255 255 / 0.74)',
  lightHeaderBorder: 'rgb(226 232 240 / 0.9)',
  lightHeaderControlBorder: 'rgb(226 232 240 / 0.6)',
  lightHeaderControlHoverBackground: 'rgb(241 245 249 / 0.8)',
  lightHeaderControlHoverText: '#112540',
  lightHeaderControlSurface: 'rgb(248 250 252 / 0.6)',
  lightHeaderControlText: '#475569',
} as const

const legacyBrandColorVariables = {
  '--color-brand-50': '#f3f7fc',
  '--color-brand-100': '#e7eef8',
  '--color-brand-200': '#c4d5ed',
  '--color-brand-300': '#9cb9df',
  '--color-brand-400': '#6d96cb',
  '--color-brand-500': '#4676b4',
  '--color-brand-600': '#315d97',
  '--color-brand-700': '#234776',
  '--color-brand-800': '#173258',
  '--color-brand-900': '#112540',
  '--color-chat-outgoing': productionVisualDefaults.chatOutgoing,
} as const

const authOverlayByMode = {
  dark: 'rgb(0 0 0 / 0.48)',
  light: 'rgb(255 255 255 / 0.58)',
  none: 'rgb(0 0 0 / 0)',
} as const

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

function clampPercentage(value: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback
  }

  return Math.min(100, Math.max(0, Math.round(value)))
}

function toCssRgb({ b, g, r }: RgbColor) {
  return `${Math.round(r)} ${Math.round(g)} ${Math.round(b)}`
}

function toCssRgbAlpha(color: string, opacityPercent: number) {
  const parsed = parseHexColor(color) ?? parseHexColor('#ffffff')!
  const alpha = clampPercentage(opacityPercent, 100) / 100

  return `rgb(${toCssRgb(parsed)} / ${alpha})`
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

function isDarkColor(value: string, fallback = false) {
  const color = parseHexColor(value)

  if (!color) {
    return fallback
  }

  return (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255 < 0.55
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

function createMutedTextColor(
  textColor: string,
  surfaceColor: string,
  fallback: string,
) {
  const text = parseHexColor(textColor)
  const surface = parseHexColor(surfaceColor)

  if (!text || !surface) {
    return fallback
  }

  return toHexColor(mixColor(text, surface, 0.32))
}

function cssUrlValue(imageUrl?: string | null) {
  if (!imageUrl) {
    return 'none'
  }

  return `url("${imageUrl.replaceAll('\\', '\\\\').replaceAll('"', '%22')}")`
}

function createBrandColorVariables(primaryColor: string, accentColor: string) {
  if (
    primaryColor.toLowerCase() === defaultBrandingColors.primary &&
    accentColor.toLowerCase() === defaultBrandingColors.accent
  ) {
    return legacyBrandColorVariables
  }

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
  const authContentSurfaceColor = normalizeHexColor(
    branding.colors.authContentSurface,
    defaultBrandingColors.authContentSurface,
  )
  const authContentSurfaceOpacity = clampPercentage(
    branding.colors.authContentSurfaceOpacity,
    defaultBrandingColors.authContentSurfaceOpacity,
  )
  const authContentSurfaceAlpha = String(authContentSurfaceOpacity / 100)
  const authMutedTextColor = normalizeHexColor(
    branding.colors.authMutedText,
    defaultBrandingColors.authMutedText,
  )
  const authTextColor = normalizeHexColor(
    branding.colors.authText,
    defaultBrandingColors.authText,
  )
  const chatBackgroundColor = normalizeHexColor(
    branding.colors.chatBackground,
    defaultBrandingColors.chatBackground,
  )
  const chatHeaderBackgroundColor = normalizeHexColor(
    branding.colors.chatHeaderBackground,
    defaultBrandingColors.chatHeaderBackground,
  )
  const chatHeaderTextColor = normalizeHexColor(
    branding.colors.chatHeaderText,
    defaultBrandingColors.chatHeaderText,
  )
  const chatMutedTextColor = normalizeHexColor(
    branding.colors.chatMutedText,
    defaultBrandingColors.chatMutedText,
  )
  const chatTextColor = normalizeHexColor(
    branding.colors.chatText,
    defaultBrandingColors.chatText,
  )
  const { mutedForeground } = getReadableForeground(chatHeaderBackgroundColor)
  const authButtonBackground =
    branding.appearance.authButtonStyle === 'gradient'
      ? `linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 100%)`
      : primaryColor
  const authButtonTextColor = getReadableForeground(primaryColor).foreground
  const isDefaultAuthBackground =
    authBackgroundColor.toLowerCase() === defaultBrandingColors.authBackground
  const isDefaultChatBackground =
    chatBackgroundColor.toLowerCase() === defaultBrandingColors.chatBackground
  const isDarkHeader = isDarkColor(chatHeaderBackgroundColor)

  return {
    ...createBrandColorVariables(primaryColor, accentColor),
    '--portal-auth-background-color': authBackgroundColor,
    '--portal-auth-background-image': cssUrlValue(
      branding.assets.auth_background_image?.publicUrl,
    ),
    '--portal-auth-background-overlay':
      authOverlayByMode[branding.appearance.authBackgroundOverlay],
    '--portal-auth-button-background': authButtonBackground,
    '--portal-auth-button-text-color': authButtonTextColor,
    '--portal-auth-canvas-background-color': authBackgroundColor,
    '--portal-auth-content-surface-background': toCssRgbAlpha(
      authContentSurfaceColor,
      authContentSurfaceOpacity,
    ),
    '--portal-auth-content-surface-color': authContentSurfaceColor,
    '--portal-auth-content-surface-opacity': authContentSurfaceAlpha,
    '--portal-auth-control-background': toCssRgbAlpha(
      authContentSurfaceColor,
      Math.max(82, authContentSurfaceOpacity),
    ),
    '--portal-auth-control-border-color': createMutedTextColor(
      authMutedTextColor,
      authContentSurfaceColor,
      '#cbd5e1',
    ),
    '--portal-auth-divider-color': createMutedTextColor(
      authMutedTextColor,
      authContentSurfaceColor,
      '#c7cdd6',
    ),
    '--portal-auth-field-style': branding.appearance.authFieldStyle,
    '--portal-auth-frame-background-color': isDefaultAuthBackground
      ? productionVisualDefaults.authFrameBackground
      : authBackgroundColor,
    '--portal-auth-icon-color': accentColor,
    '--portal-auth-link-color': accentColor,
    '--portal-auth-muted-text-color': authMutedTextColor,
    '--portal-auth-scheme': branding.appearance.authColorScheme,
    '--portal-auth-surface-background-color': isDefaultAuthBackground
      ? productionVisualDefaults.authSurfaceBackground
      : authBackgroundColor,
    '--portal-auth-text-color': authTextColor,
    '--portal-chat-app-background-color': isDefaultChatBackground
      ? productionVisualDefaults.chatAppBackground
      : chatBackgroundColor,
    '--portal-chat-background-color': chatBackgroundColor,
    '--portal-chat-background-image': cssUrlValue(
      branding.assets.chat_background_image?.publicUrl,
    ),
    '--portal-chat-header-background-color': chatHeaderBackgroundColor,
    '--portal-chat-header-background-image': cssUrlValue(
      branding.assets.chat_header_background_image?.publicUrl,
    ),
    '--portal-chat-header-border-color': isDarkHeader
      ? productionVisualDefaults.darkHeaderBorder
      : productionVisualDefaults.lightHeaderBorder,
    '--portal-chat-header-control-border': isDarkHeader
      ? productionVisualDefaults.darkHeaderControlBorder
      : productionVisualDefaults.lightHeaderControlBorder,
    '--portal-chat-header-control-hover-background': isDarkHeader
      ? productionVisualDefaults.darkHeaderControlHoverBackground
      : productionVisualDefaults.lightHeaderControlHoverBackground,
    '--portal-chat-header-control-hover-text': isDarkHeader
      ? productionVisualDefaults.darkHeaderControlHoverText
      : productionVisualDefaults.lightHeaderControlHoverText,
    '--portal-chat-header-control-surface': isDarkHeader
      ? productionVisualDefaults.darkHeaderControlSurface
      : productionVisualDefaults.lightHeaderControlSurface,
    '--portal-chat-header-control-text': isDarkHeader
      ? productionVisualDefaults.darkHeaderControlText
      : productionVisualDefaults.lightHeaderControlText,
    '--portal-chat-header-foreground': chatHeaderTextColor,
    '--portal-chat-header-muted-foreground': createMutedTextColor(
      chatHeaderTextColor,
      chatHeaderBackgroundColor,
      mutedForeground,
    ),
    '--portal-chat-muted-text-color': chatMutedTextColor,
    '--portal-chat-surface-background-color': isDefaultChatBackground
      ? productionVisualDefaults.chatSurfaceBackground
      : chatBackgroundColor,
    '--portal-chat-text-color': chatTextColor,
  }
}
