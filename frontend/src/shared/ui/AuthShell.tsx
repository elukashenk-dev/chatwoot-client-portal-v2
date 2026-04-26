import type { ReactNode } from 'react'

import { cn } from '../lib/cn'
import { BrandMark } from './BrandMark'
import { PageIntro } from './PageIntro'

type AuthShellProps = {
  brand?: ReactNode
  children: ReactNode
  className?: string
  description: ReactNode
  hero?: ReactNode
  introClassName?: string
  title: string
}

export function AuthShell({
  brand = <BrandMark />,
  children,
  className,
  description,
  hero,
  introClassName,
  title,
}: AuthShellProps) {
  return (
    <section className={cn('mx-auto w-full max-w-md', className)}>
      {hero}

      <div className={cn('mb-7 text-center sm:mb-8', introClassName)}>
        {brand}
        <PageIntro description={description} title={title} />
      </div>

      {children}
    </section>
  )
}
