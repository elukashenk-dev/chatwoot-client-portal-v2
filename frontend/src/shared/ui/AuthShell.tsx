import type { ReactNode } from 'react'

import { BrandMark } from './BrandMark'
import { PageIntro } from './PageIntro'

type AuthShellProps = {
  children: ReactNode
  description: ReactNode
  title: string
}

export function AuthShell({ children, description, title }: AuthShellProps) {
  return (
    <section className="mx-auto w-full max-w-md">
      <div className="mb-7 text-center sm:mb-8">
        <BrandMark />
        <PageIntro description={description} title={title} />
      </div>

      {children}
    </section>
  )
}
