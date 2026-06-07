const unsafeAuditMetadataKeys = new Set([
  'adminverificationtoken',
  'apiaccesstoken',
  'code',
  'codehash',
  'runtimetoken',
  'sessiontoken',
  'token',
  'tokenhash',
])

export class TenantAdminAuditMetadataError extends Error {
  constructor(message: string) {
    super(message)

    this.name = 'TenantAdminAuditMetadataError'
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeAuditMetadataKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function assertSafeAuditMetadataValue(value: unknown) {
  if (Array.isArray(value)) {
    for (const item of value) {
      assertSafeAuditMetadataValue(item)
    }

    return
  }

  if (!isPlainObject(value)) {
    return
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (unsafeAuditMetadataKeys.has(normalizeAuditMetadataKey(key))) {
      throw new TenantAdminAuditMetadataError(
        'Tenant admin audit metadata must not include secrets.',
      )
    }

    assertSafeAuditMetadataValue(nestedValue)
  }
}

export function normalizeAuditMetadata(
  metadata: Record<string, unknown> | undefined,
) {
  const normalizedMetadata = metadata ?? {}

  if (!isPlainObject(normalizedMetadata)) {
    throw new TenantAdminAuditMetadataError(
      'Tenant admin audit metadata must be an object.',
    )
  }

  assertSafeAuditMetadataValue(normalizedMetadata)

  return normalizedMetadata
}
