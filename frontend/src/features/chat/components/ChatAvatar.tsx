import { useState, type HTMLAttributes, type ReactNode } from 'react'

import { cn } from '../../../shared/lib/cn'

function getSafePortalAvatarUrl(value: string | null | undefined) {
  const trimmedValue = value?.trim()

  if (!trimmedValue) {
    return null
  }

  try {
    const currentOrigin = window.location.origin
    const avatarUrl = new URL(trimmedValue, currentOrigin)

    if (
      avatarUrl.origin !== currentOrigin ||
      !avatarUrl.pathname.startsWith('/api/')
    ) {
      return null
    }

    return trimmedValue
  } catch {
    return null
  }
}

type ChatAvatarProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
  alt: string
  avatarUrl?: string | null
  children: ReactNode
  className: string
  imageClassName?: string
}

export function ChatAvatar({
  alt,
  avatarUrl,
  children,
  className,
  imageClassName,
  ...spanProps
}: ChatAvatarProps) {
  const safeAvatarUrl = getSafePortalAvatarUrl(avatarUrl)
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null)
  const shouldRenderImage =
    safeAvatarUrl !== null && safeAvatarUrl !== failedAvatarUrl

  return (
    <span {...spanProps} className={className}>
      {shouldRenderImage ? (
        <img
          alt={alt}
          className={cn('h-full w-full object-cover', imageClassName)}
          draggable={false}
          onError={() => {
            setFailedAvatarUrl(safeAvatarUrl)
          }}
          src={safeAvatarUrl}
        />
      ) : (
        children
      )}
    </span>
  )
}
