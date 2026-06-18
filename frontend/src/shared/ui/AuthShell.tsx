import type { ReactNode } from 'react'

import { cn } from '../lib/cn'
import { BrandMark } from './BrandMark'
import { PageIntro } from './PageIntro'

export type AuthBrandPlacement = 'center' | 'left' | 'right'

export type AuthShellProps = {
  brandPlacement?: AuthBrandPlacement
  brandLogoHeight?: number | null
  brandLogoUrl?: string | null
  brandLogoWidth?: number | null
  brandMonogram?: string
  brandName?: string
  children: ReactNode
  description: ReactNode
  descriptionClassName?: string
  title: string
}

const brandPlacementClassMap: Record<AuthBrandPlacement, string> = {
  center: 'auth-brand-mark--center',
  left: 'auth-brand-mark--left',
  right: 'auth-brand-mark--right',
}

export function AuthShell({
  brandPlacement = 'center',
  brandLogoHeight,
  brandLogoUrl,
  brandLogoWidth,
  brandMonogram,
  brandName,
  children,
  description,
  descriptionClassName,
  title,
}: AuthShellProps) {
  return (
    <section className="auth-canvas-background relative flex min-h-full w-full overflow-hidden">
      <div
        aria-hidden="true"
        className="auth-background-overlay absolute inset-0 z-0"
      />

      <div className="auth-stack relative z-10 mx-auto flex min-h-full w-full max-w-[390px] flex-col pb-[calc(4rem+env(safe-area-inset-bottom))]">
        <BrandMark
          className={cn(
            'auth-brand-mark auth-brand-mark--in-flow',
            brandPlacementClassMap[brandPlacement],
          )}
          logoHeight={brandLogoHeight}
          logoUrl={brandLogoUrl}
          logoWidth={brandLogoWidth}
          monogram={brandMonogram}
          name={brandName}
        />

        <div className="auth-intro text-center">
          <PageIntro
            description={description}
            descriptionClassName={descriptionClassName}
            title={title}
          />
        </div>

        <div className="auth-form-slot flex flex-1 flex-col">{children}</div>
      </div>
    </section>
  )
}
