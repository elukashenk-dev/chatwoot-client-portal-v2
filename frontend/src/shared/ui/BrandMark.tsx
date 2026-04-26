type BrandMarkProps = {
  monogram?: string
  name?: string
}

export function BrandMark({
  monogram = 'PG',
  name = 'ProvGroup',
}: BrandMarkProps) {
  return (
    <>
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-[18px] bg-brand-900 text-lg font-semibold tracking-wide text-white shadow-sm">
        {monogram}
      </div>

      <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-700/85">
        {name}
      </p>

      <div className="mx-auto mt-2.5 h-px w-14 bg-gradient-to-r from-transparent via-brand-200 to-transparent" />
    </>
  )
}
