import type { ReactNode } from 'react'

type PageIntroProps = {
  description: ReactNode
  title: string
}

export function PageIntro({ description, title }: PageIntroProps) {
  return (
    <>
      <h1 className="mt-3 text-[32px] font-semibold leading-none tracking-tight text-slate-900 sm:text-[38px]">
        {title}
      </h1>

      <p className="mx-auto mt-2.5 max-w-sm text-[15px] leading-7 text-slate-500 sm:text-[16px]">
        {description}
      </p>
    </>
  )
}
