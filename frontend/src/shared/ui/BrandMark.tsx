import { cn } from '../lib/cn'

type BrandMarkProps = {
  className?: string
  logoHeight?: number | null
  logoUrl?: string | null
  logoWidth?: number | null
  monogram?: string
  name?: string
}

export function BrandMark({
  className,
  logoHeight,
  logoUrl,
  logoWidth,
  monogram = 'ЛК',
  name = 'Клиентский портал',
}: BrandMarkProps) {
  const hasUploadedLogo = Boolean(logoUrl)

  return (
    <div
      className={cn(
        'flex w-max flex-col items-center',
        hasUploadedLogo && 'brand-mark--uploaded',
        className,
      )}
    >
      <div
        className={cn(
          'brand-mark-logo mb-3 flex items-center justify-center text-lg font-semibold text-white',
          hasUploadedLogo
            ? 'brand-mark-logo--uploaded'
            : 'h-14 w-14 rounded-[18px] bg-brand-900 shadow-sm',
        )}
      >
        {logoUrl ? (
          <img
            alt={`Логотип ${name}`}
            className="brand-mark-image object-contain"
            height={logoHeight ?? undefined}
            src={logoUrl}
            width={logoWidth ?? undefined}
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
