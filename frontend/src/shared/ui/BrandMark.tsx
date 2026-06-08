import { cn } from '../lib/cn'

type BrandMarkProps = {
  className?: string
  logoUrl?: string | null
  monogram?: string
  name?: string
}

export function BrandMark({
  className,
  logoUrl,
  monogram = 'ЛК',
  name = 'Клиентский портал',
}: BrandMarkProps) {
  return (
    <div className={cn('flex w-max flex-col items-center', className)}>
      <div className="brand-mark-logo mb-3 flex h-14 w-14 items-center justify-center rounded-[18px] bg-brand-900 text-lg font-semibold text-white shadow-sm">
        {logoUrl ? (
          <img
            alt={`Логотип ${name}`}
            className="h-full w-full object-cover"
            src={logoUrl}
          />
        ) : (
          monogram
        )}
      </div>

      <p className="auth-text brand-mark-name max-w-[11rem] truncate text-center text-[12px] font-semibold uppercase tracking-normal">
        {name}
      </p>

      <div className="brand-mark-line mx-auto mt-2.5 h-px w-14 bg-gradient-to-r from-transparent via-brand-200 to-transparent" />
    </div>
  )
}
