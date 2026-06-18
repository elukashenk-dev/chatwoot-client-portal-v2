const TENANT_DEFAULT_ICON_PREFIX = '/api/tenant/icons/'

export function resolveThreadIdentityAvatarUrl({
  brandingLogoUrl,
  threadAvatarUrl,
}: {
  brandingLogoUrl?: string | null
  threadAvatarUrl?: string | null
}) {
  const trimmedThreadAvatarUrl = threadAvatarUrl?.trim()

  if (!trimmedThreadAvatarUrl) {
    return brandingLogoUrl
  }

  if (trimmedThreadAvatarUrl.startsWith(TENANT_DEFAULT_ICON_PREFIX)) {
    return brandingLogoUrl ?? trimmedThreadAvatarUrl
  }

  return trimmedThreadAvatarUrl
}
