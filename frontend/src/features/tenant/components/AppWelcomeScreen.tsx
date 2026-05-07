import { BrandMark } from '../../../shared/ui/BrandMark'
import { PortalFrame } from '../../../shared/ui/PortalFrame'
import { RefreshIcon } from '../../../shared/ui/icons'
import { createTenantMonogram } from '../lib/tenantIdentityMetadata'
import { useTenantIdentity } from '../lib/useTenantIdentity'

type AppWelcomeScreenMode = 'screen' | 'inline'

type AppWelcomeScreenProps = {
  description?: string
  mode?: AppWelcomeScreenMode
  showChatPreview?: boolean
  statusLabel?: string
  title?: string
  userName?: string | null
}

function getFirstName(userName?: string | null) {
  return userName?.trim().split(/\s+/)[0] ?? ''
}

function ChatPreviewSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="mt-8 flex w-full max-w-sm flex-col gap-3"
    >
      <div className="app-skeleton h-3 w-24 rounded-full" />
      <div className="app-skeleton h-[72px] rounded-[1rem] rounded-tl-[0.45rem]" />
      <div className="app-skeleton ml-auto h-[88px] w-[82%] rounded-[1rem] rounded-tr-[0.45rem]" />
      <div className="app-skeleton h-[58px] w-[74%] rounded-[1rem] rounded-tl-[0.65rem]" />
    </div>
  )
}

function AppWelcomeContent({
  description,
  showChatPreview = false,
  statusLabel = 'Готовим приложение',
  title,
  userName,
}: Omit<AppWelcomeScreenProps, 'mode'>) {
  const { tenant } = useTenantIdentity()
  const brandName = tenant?.displayName ?? 'Клиентский портал'
  const brandMonogram = tenant
    ? createTenantMonogram(tenant.displayName)
    : undefined
  const firstName = getFirstName(userName)
  const resolvedTitle =
    title ?? (firstName ? `Добро пожаловать, ${firstName}` : 'Добро пожаловать')
  const resolvedDescription =
    description ??
    (tenant
      ? `Готовим личный кабинет ${tenant.displayName}.`
      : 'Готовим личный кабинет.')

  return (
    <section
      aria-busy="true"
      aria-live="polite"
      className="mx-auto flex w-full max-w-md flex-col items-center text-center"
    >
      <BrandMark monogram={brandMonogram} name={brandName} />

      <h1 className="mt-7 text-[30px] font-semibold leading-tight text-slate-900">
        {resolvedTitle}
      </h1>

      <p className="mt-2 max-w-xs text-[15px] leading-6 text-slate-500">
        {resolvedDescription}
      </p>

      <div className="mt-6 inline-flex min-h-11 items-center gap-3 rounded-full border border-brand-100 bg-brand-50 px-4 text-[13px] font-medium text-brand-800">
        <RefreshIcon className="h-4 w-4 animate-spin" />
        <span>{statusLabel}</span>
      </div>

      {showChatPreview ? <ChatPreviewSkeleton /> : null}
    </section>
  )
}

export function AppWelcomeScreen({
  description,
  mode = 'inline',
  showChatPreview,
  statusLabel,
  title,
  userName,
}: AppWelcomeScreenProps) {
  const content = (
    <AppWelcomeContent
      description={description}
      showChatPreview={showChatPreview}
      statusLabel={statusLabel}
      title={title}
      userName={userName}
    />
  )

  if (mode === 'screen') {
    return <PortalFrame>{content}</PortalFrame>
  }

  return (
    <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-6 py-8">
      {content}
    </div>
  )
}
