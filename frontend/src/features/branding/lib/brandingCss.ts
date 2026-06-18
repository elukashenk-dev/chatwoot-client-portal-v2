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
  authDarkSchemeBackground: '#0b1220',
  authDarkSchemeMutedText: 'rgb(226 232 240 / 0.78)',
  authDarkSchemeText: '#f8fafc',
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
  darkHeaderSurfaceBackgroundImage:
    'linear-gradient(180deg, rgb(255 255 255 / 0.1), rgb(255 255 255 / 0.05))',
  lightHeaderBorder: 'rgb(226 232 240 / 0.9)',
  lightHeaderControlBorder: 'rgb(193 193 193 / 34%)',
  lightHeaderControlHoverBackground: 'rgb(241 245 249 / 0.8)',
  lightHeaderControlHoverText: '#112540',
  lightHeaderControlSurface: 'rgb(248 250 252 / 43%)',
  lightHeaderControlText: '#475569',
  lightHeaderSurfaceBackgroundImage:
    'linear-gradient(180deg, rgb(255 255 255 / 0.30), rgb(255 255 255 / 0.15))',
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

const authNeutralColors = {
  controlBorder: '#dddfe4',
  divider: '#c4c9d2',
  darkControlBorder: 'rgb(255 255 255 / 0.34)',
  darkDivider: 'rgb(255 255 255 / 0.28)',
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

function createAlphaColor(value: string, alpha: number) {
  const color = parseHexColor(value)

  if (!color) {
    return `rgb(255 255 255 / ${alpha})`
  }

  return `rgb(${color.r} ${color.g} ${color.b} / ${alpha})`
}

function cssUrlValue(imageUrl?: string | null) {
  if (!imageUrl) {
    return 'none'
  }

  return `url("${imageUrl.replaceAll('\\', '\\\\').replaceAll('"', '%22')}")`
}

function createChatHeaderSurfaceBackgroundImage(
  imageUrl: string | null | undefined,
  isDarkHeader: boolean,
) {
  const overlay = isDarkHeader
    ? productionVisualDefaults.darkHeaderSurfaceBackgroundImage
    : productionVisualDefaults.lightHeaderSurfaceBackgroundImage
  const image = cssUrlValue(imageUrl)

  if (image === 'none') {
    return overlay
  }

  return `${overlay}, ${image}`
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

function createAuthButtonGradient(primaryColor: string) {
  const primary = parseHexColor(primaryColor) ?? parseHexColor('#112540')!

  return `linear-gradient(180deg, ${toHexColor(
    mixColor(primary, white, 0.18),
  )} 0%, ${toHexColor(primary)} 56%, ${toHexColor(
    mixColor(primary, black, 0.18),
  )} 100%)`
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
      ? createAuthButtonGradient(primaryColor)
      : primaryColor
  const authButtonTextColor = getReadableForeground(primaryColor).foreground
  const isDarkAuthScheme = branding.appearance.authColorScheme === 'dark'
  const isDefaultAuthBackground =
    authBackgroundColor.toLowerCase() === defaultBrandingColors.authBackground
  const isDefaultAuthMutedText =
    authMutedTextColor.toLowerCase() === defaultBrandingColors.authMutedText
  const isDefaultAuthText =
    authTextColor.toLowerCase() === defaultBrandingColors.authText
  const isDefaultChatBackground =
    chatBackgroundColor.toLowerCase() === defaultBrandingColors.chatBackground
  const isDarkHeader = isDarkColor(chatHeaderBackgroundColor)
  const resolvedAuthBackgroundColor =
    isDarkAuthScheme && isDefaultAuthBackground
      ? productionVisualDefaults.authDarkSchemeBackground
      : authBackgroundColor
  const isDarkAuthSurface = isDarkColor(resolvedAuthBackgroundColor)
  const resolvedAuthMutedTextColor =
    isDarkAuthSurface && isDefaultAuthMutedText
      ? productionVisualDefaults.authDarkSchemeMutedText
      : authMutedTextColor
  const resolvedAuthTextColor =
    isDarkAuthSurface && isDefaultAuthText
      ? productionVisualDefaults.authDarkSchemeText
      : authTextColor
  const resolvedAuthControlBorderColor = isDarkAuthSurface
    ? authNeutralColors.darkControlBorder
    : authNeutralColors.controlBorder
  const resolvedAuthDividerColor = isDarkAuthSurface
    ? authNeutralColors.darkDivider
    : authNeutralColors.divider
  const resolvedAuthFrameBackgroundColor =
    isDefaultAuthBackground && !isDarkAuthScheme
      ? productionVisualDefaults.authFrameBackground
      : resolvedAuthBackgroundColor
  const resolvedAuthSurfaceBackgroundColor =
    isDefaultAuthBackground && !isDarkAuthScheme
      ? productionVisualDefaults.authSurfaceBackground
      : resolvedAuthBackgroundColor

  return {
    ...createBrandColorVariables(primaryColor, accentColor),
    '--portal-auth-background-color': resolvedAuthBackgroundColor,
    '--portal-auth-background-image': cssUrlValue(
      branding.assets.auth_background_image?.publicUrl,
    ),
    '--portal-auth-background-overlay':
      authOverlayByMode[branding.appearance.authBackgroundOverlay],
    '--portal-auth-brand-mark-background': primaryColor,
    '--portal-auth-button-background': authButtonBackground,
    '--portal-auth-button-text-color': authButtonTextColor,
    '--portal-auth-canvas-background-color': resolvedAuthBackgroundColor,
    '--portal-auth-control-border-color': resolvedAuthControlBorderColor,
    '--portal-auth-divider-color': resolvedAuthDividerColor,
    '--portal-auth-field-style': branding.appearance.authFieldStyle,
    '--portal-auth-frame-background-color': resolvedAuthFrameBackgroundColor,
    '--portal-auth-icon-color': accentColor,
    '--portal-auth-link-color': accentColor,
    '--portal-auth-muted-text-color': resolvedAuthMutedTextColor,
    '--portal-auth-scheme': branding.appearance.authColorScheme,
    '--portal-auth-surface-background-color': resolvedAuthSurfaceBackgroundColor,
    '--portal-auth-text-color': resolvedAuthTextColor,
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
    '--portal-chat-header-surface-background-color': createAlphaColor(
      chatHeaderBackgroundColor,
      isDarkHeader ? 0.88 : 0.01,
    ),
    '--portal-chat-header-surface-background-image':
      createChatHeaderSurfaceBackgroundImage(
        branding.assets.chat_header_background_image?.publicUrl,
        isDarkHeader,
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
