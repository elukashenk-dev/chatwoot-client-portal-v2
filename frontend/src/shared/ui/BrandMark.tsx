type BrandMarkProps = {
  align?: 'center' | 'start'
  monogram?: string
  name?: string
  showDivider?: boolean
  size?: 'default' | 'hero'
}

export function BrandMark({
  align = 'center',
  monogram = 'PG',
  name = 'ProvGroup',
  showDivider = true,
  size = 'default',
}: BrandMarkProps) {
  const isHero = size === 'hero'
  const isCentered = align === 'center'

  return (
    <div className={isCentered ? 'text-center' : 'text-left'}>
      <div
        className={[
          'mb-3 flex items-center justify-center bg-brand-900 font-semibold tracking-wide text-white shadow-sm',
          isCentered ? 'mx-auto' : '',
          isHero
            ? 'h-[4.5rem] w-[4.5rem] rounded-[1.35rem] text-2xl'
            : 'h-14 w-14 rounded-[18px] text-lg',
        ].join(' ')}
      >
        {monogram}
      </div>

      <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-700/85">
        {name}
      </p>

      {showDivider ? (
        <div className="mx-auto mt-2.5 h-px w-14 bg-gradient-to-r from-transparent via-brand-200 to-transparent" />
      ) : null}
    </div>
  )
}
