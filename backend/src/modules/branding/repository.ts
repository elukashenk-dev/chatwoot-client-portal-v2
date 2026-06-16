import { and, eq, inArray, sql } from 'drizzle-orm'

import type { AppDatabase } from '../../db/client.js'
import {
  portalBrandingAssets,
  portalBrandingSettings,
} from '../../db/schema.js'
import {
  createPublicBrandingAssetUrl,
  type BrandingAssetKind,
  type PublicBrandingAssetMap,
} from './brandingAssets.js'

type BrandingRepositoryScope = {
  tenantId: number
}

export type BrandingSettingsRow = typeof portalBrandingSettings.$inferSelect
export type BrandingAssetRow = typeof portalBrandingAssets.$inferSelect

export type BrandingSettingsPatch = Partial<{
  accentColor: string | null
  authBackgroundColor: string | null
  authBackgroundImageAssetId: number | null
  authBackgroundOverlay: 'dark' | 'light' | 'none' | null
  authButtonStyle: 'gradient' | 'solid' | null
  authColorScheme: 'dark' | 'light' | null
  authBrandPlacement: 'center' | 'left' | 'right' | null
  authFieldStyle: 'outline' | 'solid' | 'translucent' | null
  authMutedTextColor: string | null
  authSubtitle: string | null
  authTextColor: string | null
  authTitle: string | null
  chatBackgroundColor: string | null
  chatBackgroundImageAssetId: number | null
  chatEmptyBody: string | null
  chatEmptyTitle: string | null
  chatHeaderBackgroundColor: string | null
  chatHeaderBackgroundImageAssetId: number | null
  chatHeaderTextColor: string | null
  chatInfoTitle: string | null
  chatMutedTextColor: string | null
  chatTextColor: string | null
  logoAssetId: number | null
  portalName: string | null
  primaryColor: string | null
  pwaIconAssetId: number | null
  supportLabel: string | null
}>

export type CreateBrandingAssetMetadataInput = {
  byteSize: number
  checksumSha256: string
  contentHash: string
  contentType: string
  height?: number | null
  kind: BrandingAssetKind
  objectKey: string
  originalFilename?: string | null
  width?: number | null
}

type BrandingAssetReferenceField =
  | 'authBackgroundImageAssetId'
  | 'chatBackgroundImageAssetId'
  | 'chatHeaderBackgroundImageAssetId'
  | 'logoAssetId'
  | 'pwaIconAssetId'

const brandingAssetReferenceSlots: ReadonlyArray<{
  field: BrandingAssetReferenceField
  kind: BrandingAssetKind
}> = [
  { field: 'logoAssetId', kind: 'logo' },
  { field: 'authBackgroundImageAssetId', kind: 'auth_background_image' },
  { field: 'chatBackgroundImageAssetId', kind: 'chat_background_image' },
  {
    field: 'chatHeaderBackgroundImageAssetId',
    kind: 'chat_header_background_image',
  },
  { field: 'pwaIconAssetId', kind: 'pwa_icon' },
]

const settingsSelection = {
  accentColor: portalBrandingSettings.accentColor,
  authBackgroundColor: portalBrandingSettings.authBackgroundColor,
  authBackgroundImageAssetId: portalBrandingSettings.authBackgroundImageAssetId,
  authBackgroundOverlay: portalBrandingSettings.authBackgroundOverlay,
  authButtonStyle: portalBrandingSettings.authButtonStyle,
  authColorScheme: portalBrandingSettings.authColorScheme,
  authBrandPlacement: portalBrandingSettings.authBrandPlacement,
  authFieldStyle: portalBrandingSettings.authFieldStyle,
  authMutedTextColor: portalBrandingSettings.authMutedTextColor,
  authSubtitle: portalBrandingSettings.authSubtitle,
  authTextColor: portalBrandingSettings.authTextColor,
  authTitle: portalBrandingSettings.authTitle,
  chatBackgroundColor: portalBrandingSettings.chatBackgroundColor,
  chatBackgroundImageAssetId: portalBrandingSettings.chatBackgroundImageAssetId,
  chatEmptyBody: portalBrandingSettings.chatEmptyBody,
  chatEmptyTitle: portalBrandingSettings.chatEmptyTitle,
  chatHeaderBackgroundColor: portalBrandingSettings.chatHeaderBackgroundColor,
  chatHeaderBackgroundImageAssetId:
    portalBrandingSettings.chatHeaderBackgroundImageAssetId,
  chatHeaderTextColor: portalBrandingSettings.chatHeaderTextColor,
  chatInfoTitle: portalBrandingSettings.chatInfoTitle,
  chatMutedTextColor: portalBrandingSettings.chatMutedTextColor,
  chatTextColor: portalBrandingSettings.chatTextColor,
  createdAt: portalBrandingSettings.createdAt,
  id: portalBrandingSettings.id,
  logoAssetId: portalBrandingSettings.logoAssetId,
  portalName: portalBrandingSettings.portalName,
  primaryColor: portalBrandingSettings.primaryColor,
  pwaIconAssetId: portalBrandingSettings.pwaIconAssetId,
  supportLabel: portalBrandingSettings.supportLabel,
  tenantId: portalBrandingSettings.tenantId,
  updatedAt: portalBrandingSettings.updatedAt,
  version: portalBrandingSettings.version,
}

function normalizeNullableText(value: string | null | undefined) {
  if (value === undefined) {
    return undefined
  }

  if (value === null) {
    return null
  }

  return value.trim() || null
}

function normalizeAssetId(value: number | null | undefined) {
  if (value === undefined) {
    return undefined
  }

  return value
}

function removeUndefined<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>
}

function normalizeSettingsPatch(input: BrandingSettingsPatch) {
  return removeUndefined({
    accentColor: normalizeNullableText(input.accentColor),
    authBackgroundColor: normalizeNullableText(input.authBackgroundColor),
    authBackgroundImageAssetId: normalizeAssetId(
      input.authBackgroundImageAssetId,
    ),
    authBackgroundOverlay: input.authBackgroundOverlay,
    authButtonStyle: input.authButtonStyle,
    authColorScheme: input.authColorScheme,
    authBrandPlacement: input.authBrandPlacement,
    authFieldStyle: input.authFieldStyle,
    authMutedTextColor: normalizeNullableText(input.authMutedTextColor),
    authSubtitle: normalizeNullableText(input.authSubtitle),
    authTextColor: normalizeNullableText(input.authTextColor),
    authTitle: normalizeNullableText(input.authTitle),
    chatBackgroundColor: normalizeNullableText(input.chatBackgroundColor),
    chatBackgroundImageAssetId: normalizeAssetId(
      input.chatBackgroundImageAssetId,
    ),
    chatEmptyBody: normalizeNullableText(input.chatEmptyBody),
    chatEmptyTitle: normalizeNullableText(input.chatEmptyTitle),
    chatHeaderBackgroundColor: normalizeNullableText(
      input.chatHeaderBackgroundColor,
    ),
    chatHeaderBackgroundImageAssetId: normalizeAssetId(
      input.chatHeaderBackgroundImageAssetId,
    ),
    chatHeaderTextColor: normalizeNullableText(input.chatHeaderTextColor),
    chatInfoTitle: normalizeNullableText(input.chatInfoTitle),
    chatMutedTextColor: normalizeNullableText(input.chatMutedTextColor),
    chatTextColor: normalizeNullableText(input.chatTextColor),
    logoAssetId: normalizeAssetId(input.logoAssetId),
    portalName: normalizeNullableText(input.portalName),
    primaryColor: normalizeNullableText(input.primaryColor),
    pwaIconAssetId: normalizeAssetId(input.pwaIconAssetId),
    supportLabel: normalizeNullableText(input.supportLabel),
  })
}

function collectActiveAssetIds(settings: BrandingSettingsRow) {
  return [
    ['logo', settings.logoAssetId],
    ['auth_background_image', settings.authBackgroundImageAssetId],
    ['chat_background_image', settings.chatBackgroundImageAssetId],
    ['chat_header_background_image', settings.chatHeaderBackgroundImageAssetId],
    ['pwa_icon', settings.pwaIconAssetId],
  ].filter((entry): entry is [BrandingAssetKind, number] => {
    const [, assetId] = entry

    return assetId !== null
  })
}

async function validateAssetReferenceSlots({
  db,
  input,
  tenantId,
}: {
  db: AppDatabase
  input: ReturnType<typeof normalizeSettingsPatch>
  tenantId: number
}) {
  const requestedReferences = brandingAssetReferenceSlots.flatMap((slot) => {
    const assetId = input[slot.field]

    if (typeof assetId !== 'number') {
      return []
    }

    return [{ ...slot, assetId }]
  })

  if (requestedReferences.length === 0) {
    return
  }

  const assets = await db
    .select({
      id: portalBrandingAssets.id,
      kind: portalBrandingAssets.kind,
    })
    .from(portalBrandingAssets)
    .where(
      and(
        eq(portalBrandingAssets.tenantId, tenantId),
        inArray(
          portalBrandingAssets.id,
          requestedReferences.map(({ assetId }) => assetId),
        ),
      ),
    )
  const kindByAssetId = new Map(
    assets.map((asset) => [asset.id, asset.kind as BrandingAssetKind]),
  )

  for (const { assetId, kind } of requestedReferences) {
    if (kindByAssetId.get(assetId) !== kind) {
      throw new Error('Branding asset reference is not available.')
    }
  }
}

export function createBrandingRepository(
  db: AppDatabase,
  { tenantId }: BrandingRepositoryScope,
) {
  return {
    async createAssetMetadata(input: CreateBrandingAssetMetadataInput) {
      const [asset] = await db
        .insert(portalBrandingAssets)
        .values({
          byteSize: input.byteSize,
          checksumSha256: input.checksumSha256,
          contentHash: input.contentHash,
          contentType: input.contentType,
          height: input.height ?? null,
          kind: input.kind,
          objectKey: input.objectKey,
          originalFilename: input.originalFilename ?? null,
          tenantId,
          width: input.width ?? null,
        })
        .returning()

      if (!asset) {
        throw new Error('Failed to create branding asset metadata.')
      }

      return asset
    },

    async findActiveAssetMetadata() {
      const settings = await this.findSettings()

      if (!settings) {
        return {}
      }

      const activeAssetIds = collectActiveAssetIds(settings)

      if (activeAssetIds.length === 0) {
        return {}
      }

      const activeAssetIdByKind = new Map(activeAssetIds)
      const assets = await db
        .select({
          contentHash: portalBrandingAssets.contentHash,
          contentType: portalBrandingAssets.contentType,
          height: portalBrandingAssets.height,
          id: portalBrandingAssets.id,
          kind: portalBrandingAssets.kind,
          width: portalBrandingAssets.width,
        })
        .from(portalBrandingAssets)
        .where(
          and(
            eq(portalBrandingAssets.tenantId, tenantId),
            inArray(
              portalBrandingAssets.id,
              activeAssetIds.map(([, assetId]) => assetId),
            ),
          ),
        )

      return assets.reduce<PublicBrandingAssetMap>((assetMap, asset) => {
        const kind = asset.kind as BrandingAssetKind
        const assetVersion = String(asset.id)

        if (activeAssetIdByKind.get(kind) !== asset.id) {
          return assetMap
        }

        assetMap[kind] = {
          assetVersion,
          contentType: asset.contentType,
          height: asset.height,
          id: asset.id,
          kind,
          publicUrl: createPublicBrandingAssetUrl({
            assetVersion,
            id: asset.id,
          }),
          width: asset.width,
        }

        return assetMap
      }, {})
    },

    async findActivePwaIcon() {
      const settings = await this.findSettings()

      if (!settings?.pwaIconAssetId) {
        return null
      }

      return this.findActiveAssetById(settings.pwaIconAssetId)
    },

    async findActiveAssetById(assetId: number) {
      const settings = await this.findSettings()

      if (!settings) {
        return null
      }

      const activeAssetIds = new Set(
        collectActiveAssetIds(settings).map(
          ([, activeAssetId]) => activeAssetId,
        ),
      )

      if (!activeAssetIds.has(assetId)) {
        return null
      }

      const [asset] = await db
        .select()
        .from(portalBrandingAssets)
        .where(
          and(
            eq(portalBrandingAssets.tenantId, tenantId),
            eq(portalBrandingAssets.id, assetId),
          ),
        )
        .limit(1)

      return asset ?? null
    },

    async findActiveAssetByKind(kind: BrandingAssetKind) {
      const settings = await this.findSettings()

      if (!settings) {
        return null
      }

      const activeAssetId = collectActiveAssetIds(settings).find(
        ([activeKind]) => activeKind === kind,
      )?.[1]

      if (!activeAssetId) {
        return null
      }

      return this.findActiveAssetById(activeAssetId)
    },

    async findSettings() {
      const [settings] = await db
        .select(settingsSelection)
        .from(portalBrandingSettings)
        .where(eq(portalBrandingSettings.tenantId, tenantId))
        .limit(1)

      return settings ?? null
    },

    async deactivateAssetKind(kind: BrandingAssetKind) {
      const patchByKind: Record<BrandingAssetKind, BrandingSettingsPatch> = {
        auth_background_image: { authBackgroundImageAssetId: null },
        chat_background_image: { chatBackgroundImageAssetId: null },
        chat_header_background_image: {
          chatHeaderBackgroundImageAssetId: null,
        },
        logo: { logoAssetId: null },
        pwa_icon: { pwaIconAssetId: null },
      }

      return this.upsertSettings(patchByKind[kind])
    },

    async deleteAssetMetadata(assetId: number) {
      await db
        .delete(portalBrandingAssets)
        .where(
          and(
            eq(portalBrandingAssets.tenantId, tenantId),
            eq(portalBrandingAssets.id, assetId),
          ),
        )
    },

    async upsertSettings(input: BrandingSettingsPatch) {
      const normalizedInput = normalizeSettingsPatch(input)

      if (Object.keys(normalizedInput).length === 0) {
        throw new Error('Branding settings patch is empty.')
      }

      await validateAssetReferenceSlots({
        db,
        input: normalizedInput,
        tenantId,
      })

      const now = new Date()
      const [settings] = await db
        .insert(portalBrandingSettings)
        .values({
          ...normalizedInput,
          tenantId,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          set: {
            ...normalizedInput,
            updatedAt: now,
            version: sql`${portalBrandingSettings.version} + 1`,
          },
          target: portalBrandingSettings.tenantId,
        })
        .returning(settingsSelection)

      if (!settings) {
        throw new Error('Failed to upsert branding settings.')
      }

      return settings
    },
  }
}

export type BrandingRepository = ReturnType<typeof createBrandingRepository>
