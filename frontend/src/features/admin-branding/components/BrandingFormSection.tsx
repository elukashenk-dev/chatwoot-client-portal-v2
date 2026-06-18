import type { ReactNode } from 'react'

type BrandingFormSectionProps = {
  children: ReactNode
  description: string
  headerAction?: ReactNode
  id: string
  title: string
}

export function BrandingFormSection({
  children,
  description,
  headerAction,
  id,
  title,
}: BrandingFormSectionProps) {
  const titleId = `${id}-title`

  return (
    <section
      aria-labelledby={titleId}
      className="rounded-[0.6rem] border border-slate-200 bg-white p-4 shadow-sm"
      id={id}
    >
      <div
        className={
          headerAction
            ? 'mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'
            : 'mb-4'
        }
      >
        <div>
          <h3 className="text-lg font-semibold" id={titleId}>
            {title}
          </h3>
          <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
        </div>
        {headerAction}
      </div>
      {children}
    </section>
  )
}
