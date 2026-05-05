import type { ReactNode } from 'react'

import { BrandMark } from './BrandMark'
import { PageIntro } from './PageIntro'

export type AuthShellProps = {
  brandMonogram?: string
  brandName?: string
  children: ReactNode
  description: ReactNode
  title: string
}

export function AuthShell({
  brandMonogram,
  brandName,
  children,
  description,
  title,
}: AuthShellProps) {
  return (
    <section className="mx-auto w-full max-w-md">
      <div className="mb-7 text-center sm:mb-8">
        <BrandMark monogram={brandMonogram} name={brandName} />
        <PageIntro description={description} title={title} />
      </div>

      {children}
    </section>
  )
}
