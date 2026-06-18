import { MenuIcon, MoreHorizontalIcon } from '../../../../shared/ui/icons'
import { ChatHeaderIdentity } from '../../../chat/components/ChatHeaderIdentity'
import { createTenantMonogram } from '../../../tenant/lib/tenantIdentityMetadata'
import { useTenantIdentity } from '../../../tenant/lib/useTenantIdentity'
import { useBranding } from '../../../branding/lib/useBranding'
import { previewThread } from './previewData'

export function ChatHeaderPreview() {
  const { branding } = useBranding()
  const { tenant } = useTenantIdentity()
  const tenantMonogram = createTenantMonogram(
    branding.portalName || tenant?.displayName || 'ЛК',
  )

  return (
    <header className="app-safe-top relative z-30 bg-transparent px-3 pb-2 text-[color:var(--portal-chat-header-foreground,#0f172a)]">
      <div className="chat-floating-header-surface mx-auto flex min-h-14 w-full items-center gap-3 rounded-[10px] border px-3 py-[9px]">
        <span
          aria-hidden="true"
          className="chat-header-icon-button inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-chat-control"
        >
          <MenuIcon className="h-6 w-6" />
        </span>

        <ChatHeaderIdentity
          avatarFallback={tenantMonogram}
          avatarUrl={branding.assets.logo?.publicUrl ?? previewThread.avatarUrl}
          presenceLabel="На связи"
          presenceTone="online"
          subtitle={previewThread.subtitle}
          title={previewThread.title}
          useResponsiveTitle={false}
        />

        <span
          aria-hidden="true"
          className="chat-header-menu-button inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border"
        >
          <MoreHorizontalIcon className="h-5 w-5" />
        </span>
      </div>
    </header>
  )
}
