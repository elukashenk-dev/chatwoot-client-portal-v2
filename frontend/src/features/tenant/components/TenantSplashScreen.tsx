import { BrandMark } from '../../../shared/ui/BrandMark'
import { PortalFrame } from '../../../shared/ui/PortalFrame'
import { RefreshIcon } from '../../../shared/ui/icons'
import { createTenantMonogram } from '../lib/tenantIdentityMetadata'
import { useTenantIdentity } from '../lib/useTenantIdentity'

type TenantSplashScreenMode = 'screen' | 'inline'

type TenantSplashScreenProps = {
  description?: string
  mode?: TenantSplashScreenMode
  title?: string
}

function TenantSplashContent({
  description = 'Загружаем настройки.',
  title = 'Открываем кабинет.',
}: Pick<TenantSplashScreenProps, 'description' | 'title'>) {
  const { tenant } = useTenantIdentity()
  const brandName = tenant?.displayName ?? 'Клиентский портал'
  const brandMonogram = tenant
    ? createTenantMonogram(tenant.displayName)
    : undefined

  return (
    <section
      aria-busy="true"
      aria-live="polite"
      className="mx-auto flex w-full max-w-md flex-col items-center text-center"
    >
      <BrandMark monogram={brandMonogram} name={brandName} />

      <div className="mt-7 inline-flex h-12 w-12 items-center justify-center rounded-[0.85rem] bg-brand-50 text-brand-800">
        <RefreshIcon className="h-5 w-5 animate-spin" />
      </div>

      <h1 className="mt-5 text-[28px] font-semibold leading-tight text-slate-900">
        {title}
      </h1>

      <p className="mt-2 max-w-xs text-[15px] leading-6 text-slate-500">
        {description}
      </p>
    </section>
  )
}

export function TenantSplashScreen({
  description,
  mode = 'screen',
  title,
}: TenantSplashScreenProps) {
  const content = (
    <TenantSplashContent description={description} title={title} />
  )

  if (mode === 'inline') {
    return (
      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-6 py-8">
        {content}
      </div>
    )
  }

  return <PortalFrame>{content}</PortalFrame>
}
