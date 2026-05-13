import type { CSSProperties, ReactNode } from 'react'

import { cn } from '../lib/cn'
import { BrandMark } from './BrandMark'
import { PageIntro } from './PageIntro'

export type AuthBrandPlacement = 'center' | 'left' | 'right'

export type AuthShellProps = {
  brandPlacement?: AuthBrandPlacement
  brandMonogram?: string
  brandName?: string
  children: ReactNode
  description: ReactNode
  footerImageUrl?: string | null
  headerImageUrl?: string | null
  title: string
}

const brandPlacementClassMap: Record<AuthBrandPlacement, string> = {
  center: 'auth-brand-mark--center',
  left: 'auth-brand-mark--left',
  right: 'auth-brand-mark--right',
}

function imageBackgroundStyle(
  imageUrl?: string | null,
): CSSProperties | undefined {
  return imageUrl ? { backgroundImage: `url("${imageUrl}")` } : undefined
}

export function AuthShell({
  brandPlacement = 'left',
  brandMonogram,
  brandName,
  children,
  description,
  footerImageUrl,
  headerImageUrl,
  title,
}: AuthShellProps) {
  return (
    <section className="relative flex min-h-full w-full flex-col bg-white">
      <div
        aria-hidden="true"
        className={cn(
          'auth-footer-art absolute inset-x-0 bottom-0 z-0 h-44',
          !footerImageUrl && 'auth-footer-art--fallback',
        )}
        style={imageBackgroundStyle(footerImageUrl)}
      />

      <header className="auth-header-shell relative z-10 shrink-0 overflow-hidden">
        <div
          aria-hidden="true"
          className={cn(
            'auth-header-art absolute inset-0',
            !headerImageUrl && 'auth-header-art--fallback',
          )}
          style={imageBackgroundStyle(headerImageUrl)}
        />

        <div
          aria-hidden="true"
          className="auth-header-fade absolute inset-x-0 bottom-0"
        />

        <BrandMark
          className={cn(
            'auth-brand-mark absolute',
            brandPlacementClassMap[brandPlacement],
          )}
          monogram={brandMonogram}
          name={brandName}
        />
      </header>

      <div className="relative z-10 flex flex-1 flex-col px-7 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-10 sm:pb-6">
        <div className="text-center">
          <PageIntro description={description} title={title} />
        </div>

        <div className="mt-7 flex flex-1 flex-col">{children}</div>
      </div>
    </section>
  )
}
