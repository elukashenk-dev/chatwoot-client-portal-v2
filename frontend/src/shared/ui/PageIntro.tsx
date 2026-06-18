import type { ReactNode } from 'react'

import { cn } from '../lib/cn'

type PageIntroProps = {
  description: ReactNode
  descriptionClassName?: string
  title: string
}

export function PageIntro({
  description,
  descriptionClassName,
  title,
}: PageIntroProps) {
  return (
    <>
      <h1 className="auth-title">{title}</h1>

      <p className={cn('auth-subtitle', descriptionClassName)}>{description}</p>
    </>
  )
}
