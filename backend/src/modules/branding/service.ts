import type { TenantRequestContext } from '../tenants/service.js'
import type { PublicTenantAdmin } from '../tenant-admin/adminAuthService.js'
import { ApiError } from '../../lib/errors.js'
import {
  createDefaultBrandingCopy,
  defaultBrandingColors,
  defaultBrandingLayout,
} from './brandingDefaults.js'
import { parseAdminBrandingPatch } from './brandingValidation.js'
import type { BrandingRepository, BrandingSettingsPatch } from './repository.js'

type TenantPublicContext = Pick<
  TenantRequestContext,
  'displayName' | 'id' | 'primaryDomain' | 'publicBaseUrl' | 'slug'
>

type BrandingAudit = (input: {
  action: string
  actor?: PublicTenantAdmin | null
  metadata?: Record<string, unknown>
  outcome: string
  requestIp: string | null
  subjectEmail?: string | null
  userAgent: string | null
}) => Promise<void> | void

type BrandingRepositoryForService = Pick<
  BrandingRepository,
  'findActiveAssetMetadata' | 'findSettings' | 'upsertSettings'
>

type CreateBrandingServiceOptions = {
  audit: BrandingAudit
  repository: BrandingRepositoryForService
  tenant: TenantPublicContext
}

function coalesce<T>(value: T | null | undefined, fallback: T) {
  return value ?? fallback
}

function getReadableTextColor(backgroundColor: string) {
  const normalized = backgroundColor.trim()

  if (!/^#[0-9a-fA-F]{6}$/u.test(normalized)) {
    return defaultBrandingColors.chatHeaderText
  }

  const red = Number.parseInt(normalized.slice(1, 3), 16)
  const green = Number.parseInt(normalized.slice(3, 5), 16)
  const blue = Number.parseInt(normalized.slice(5, 7), 16)
  const relativeLuminance =
    (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255

  return relativeLuminance < 0.55 ? '#ffffff' : '#0f172a'
}

async function buildBrandingResponse({
  repository,
  settings: settingsOverride,
  tenant,
}: {
  repository: BrandingRepositoryForService
  settings?: Awaited<ReturnType<BrandingRepository['findSettings']>>
  tenant: TenantPublicContext
}) {
  const [resolvedSettings, assets] = await Promise.all([
    settingsOverride === undefined
      ? repository.findSettings()
      : Promise.resolve(settingsOverride),
    repository.findActiveAssetMetadata(),
  ])
  const defaultCopy = createDefaultBrandingCopy(tenant.displayName)
  const accentColor = coalesce(
    resolvedSettings?.accentColor,
    defaultBrandingColors.accent,
  )
  const authBackgroundColor = coalesce(
    resolvedSettings?.authBackgroundColor,
    defaultBrandingColors.authBackground,
  )
  const authContentSurfaceColor = coalesce(
    resolvedSettings?.authContentSurfaceColor,
    defaultBrandingColors.authContentSurface,
  )
  const authContentSurfaceOpacity = coalesce(
    resolvedSettings?.authContentSurfaceOpacity,
    defaultBrandingColors.authContentSurfaceOpacity,
  )
  const authMutedTextColor = coalesce(
    resolvedSettings?.authMutedTextColor,
    defaultBrandingColors.authMutedText,
  )
  const authTextColor = coalesce(
    resolvedSettings?.authTextColor,
    defaultBrandingColors.authText,
  )
  const chatBackgroundColor = coalesce(
    resolvedSettings?.chatBackgroundColor,
    defaultBrandingColors.chatBackground,
  )
  const chatHeaderBackgroundColor = coalesce(
    resolvedSettings?.chatHeaderBackgroundColor,
    defaultBrandingColors.chatHeaderBackground,
  )
  const chatHeaderTextColor = coalesce(
    resolvedSettings?.chatHeaderTextColor,
    getReadableTextColor(chatHeaderBackgroundColor),
  )
  const chatMutedTextColor = coalesce(
    resolvedSettings?.chatMutedTextColor,
    defaultBrandingColors.chatMutedText,
  )
  const chatTextColor = coalesce(
    resolvedSettings?.chatTextColor,
    defaultBrandingColors.chatText,
  )
  const primaryColor = coalesce(
    resolvedSettings?.primaryColor,
    defaultBrandingColors.primary,
  )

  return {
    branding: {
      assets,
      colors: {
        accent: accentColor,
        authBackground: authBackgroundColor,
        authContentSurface: authContentSurfaceColor,
        authContentSurfaceOpacity,
        authMutedText: authMutedTextColor,
        authText: authTextColor,
        chatBackground: chatBackgroundColor,
        chatHeaderBackground: chatHeaderBackgroundColor,
        chatHeaderText: chatHeaderTextColor,
        chatMutedText: chatMutedTextColor,
        chatText: chatTextColor,
        primary: primaryColor,
      },
      copy: {
        authSubtitle: coalesce(
          resolvedSettings?.authSubtitle,
          defaultCopy.authSubtitle,
        ),
        authTitle: coalesce(resolvedSettings?.authTitle, defaultCopy.authTitle),
        chatEmptyBody: coalesce(
          resolvedSettings?.chatEmptyBody,
          defaultCopy.chatEmptyBody,
        ),
        chatEmptyTitle: coalesce(
          resolvedSettings?.chatEmptyTitle,
          defaultCopy.chatEmptyTitle,
        ),
        chatInfoTitle: coalesce(
          resolvedSettings?.chatInfoTitle,
          defaultCopy.chatInfoTitle,
        ),
      },
      layout: {
        authBrandPlacement: coalesce(
          resolvedSettings?.authBrandPlacement,
          defaultBrandingLayout.authBrandPlacement,
        ),
      },
      portalName: coalesce(resolvedSettings?.portalName, tenant.displayName),
      supportLabel: coalesce(
        resolvedSettings?.supportLabel,
        defaultCopy.supportLabel,
      ),
      version: resolvedSettings?.version ?? 1,
    },
  }
}

function toSettingsPatch(input: unknown): BrandingSettingsPatch {
  const parsedInput = parseAdminBrandingPatch(input)
  const patch: BrandingSettingsPatch = {}

  if (parsedInput.colors?.accent !== undefined) {
    patch.accentColor = parsedInput.colors.accent
  }

  if (parsedInput.colors?.authBackground !== undefined) {
    patch.authBackgroundColor = parsedInput.colors.authBackground
  }

  if (parsedInput.colors?.authContentSurface !== undefined) {
    patch.authContentSurfaceColor = parsedInput.colors.authContentSurface
  }

  if (parsedInput.colors?.authContentSurfaceOpacity !== undefined) {
    patch.authContentSurfaceOpacity =
      parsedInput.colors.authContentSurfaceOpacity
  }

  if (parsedInput.colors?.authMutedText !== undefined) {
    patch.authMutedTextColor = parsedInput.colors.authMutedText
  }

  if (parsedInput.colors?.authText !== undefined) {
    patch.authTextColor = parsedInput.colors.authText
  }

  if (parsedInput.copy?.authSubtitle !== undefined) {
    patch.authSubtitle = parsedInput.copy.authSubtitle
  }

  if (parsedInput.copy?.authTitle !== undefined) {
    patch.authTitle = parsedInput.copy.authTitle
  }

  if (parsedInput.layout?.authBrandPlacement !== undefined) {
    patch.authBrandPlacement = parsedInput.layout.authBrandPlacement
  }

  if (parsedInput.colors?.chatBackground !== undefined) {
    patch.chatBackgroundColor = parsedInput.colors.chatBackground
  }

  if (parsedInput.copy?.chatEmptyBody !== undefined) {
    patch.chatEmptyBody = parsedInput.copy.chatEmptyBody
  }

  if (parsedInput.copy?.chatEmptyTitle !== undefined) {
    patch.chatEmptyTitle = parsedInput.copy.chatEmptyTitle
  }

  if (parsedInput.colors?.chatHeaderBackground !== undefined) {
    patch.chatHeaderBackgroundColor = parsedInput.colors.chatHeaderBackground
  }

  if (parsedInput.colors?.chatHeaderText !== undefined) {
    patch.chatHeaderTextColor = parsedInput.colors.chatHeaderText
  }

  if (parsedInput.copy?.chatInfoTitle !== undefined) {
    patch.chatInfoTitle = parsedInput.copy.chatInfoTitle
  }

  if (parsedInput.colors?.chatMutedText !== undefined) {
    patch.chatMutedTextColor = parsedInput.colors.chatMutedText
  }

  if (parsedInput.colors?.chatText !== undefined) {
    patch.chatTextColor = parsedInput.colors.chatText
  }

  if (parsedInput.portalName !== undefined) {
    patch.portalName = parsedInput.portalName
  }

  if (parsedInput.colors?.primary !== undefined) {
    patch.primaryColor = parsedInput.colors.primary
  }

  if (parsedInput.supportLabel !== undefined) {
    patch.supportLabel = parsedInput.supportLabel
  }

  return patch
}

export function createBrandingService({
  audit,
  repository,
  tenant,
}: CreateBrandingServiceOptions) {
  return {
    async getAdminBranding() {
      return buildBrandingResponse({ repository, tenant })
    },

    async getPublicBranding() {
      return buildBrandingResponse({ repository, tenant })
    },

    async updateAdminBranding({
      admin,
      input,
      requestIp,
      userAgent,
    }: {
      admin: PublicTenantAdmin
      input: unknown
      requestIp: string | null
      userAgent: string | null
    }) {
      const settingsPatch = toSettingsPatch(input)

      if (Object.keys(settingsPatch).length === 0) {
        throw new ApiError(
          400,
          'BRANDING_SETTINGS_EMPTY',
          'Передайте хотя бы одно изменение настроек брендинга.',
        )
      }

      const settings = await repository.upsertSettings(settingsPatch)
      await audit({
        action: 'branding_settings_updated',
        actor: admin,
        metadata: {
          changedFields: Object.keys(settingsPatch).filter(
            (key) =>
              settingsPatch[key as keyof BrandingSettingsPatch] !== undefined,
          ),
        },
        outcome: 'success',
        requestIp,
        subjectEmail: admin.email,
        userAgent,
      })

      return buildBrandingResponse({ repository, settings, tenant })
    },
  }
}

export type BrandingService = ReturnType<typeof createBrandingService>
