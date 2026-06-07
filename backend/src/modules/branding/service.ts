import type { TenantRequestContext } from '../tenants/service.js'
import type { PublicTenantAdmin } from '../tenant-admin/adminAuthService.js'
import {
  createDefaultBrandingCopy,
  defaultBrandingColors,
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

  return {
    branding: {
      assets,
      colors: {
        accent: coalesce(
          resolvedSettings?.accentColor,
          defaultBrandingColors.accent,
        ),
        authBackground: coalesce(
          resolvedSettings?.authBackgroundColor,
          defaultBrandingColors.authBackground,
        ),
        chatBackground: coalesce(
          resolvedSettings?.chatBackgroundColor,
          defaultBrandingColors.chatBackground,
        ),
        chatHeaderBackground: coalesce(
          resolvedSettings?.chatHeaderBackgroundColor,
          defaultBrandingColors.chatHeaderBackground,
        ),
        primary: coalesce(
          resolvedSettings?.primaryColor,
          defaultBrandingColors.primary,
        ),
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

  if (parsedInput.copy?.authSubtitle !== undefined) {
    patch.authSubtitle = parsedInput.copy.authSubtitle
  }

  if (parsedInput.copy?.authTitle !== undefined) {
    patch.authTitle = parsedInput.copy.authTitle
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

  if (parsedInput.copy?.chatInfoTitle !== undefined) {
    patch.chatInfoTitle = parsedInput.copy.chatInfoTitle
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
