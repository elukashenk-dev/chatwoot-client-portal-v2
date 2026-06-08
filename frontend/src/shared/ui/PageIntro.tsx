import type { ReactNode } from 'react'

type PageIntroProps = {
  description: ReactNode
  title: string
}

export function PageIntro({ description, title }: PageIntroProps) {
  return (
    <>
      <h1 className="auth-text mt-3 text-[clamp(28px,8.2vw,32px)] font-semibold leading-none tracking-tight">
        {title}
      </h1>

      <p className="auth-muted-text mx-auto mt-2.5 max-w-sm text-[15px] leading-6 sm:text-[16px]">
        {description}
      </p>
    </>
  )
}
