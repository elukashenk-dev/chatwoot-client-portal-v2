import { MenuIcon, MoreHorizontalIcon } from '../../../../shared/ui/icons'
import { ChatAvatar } from '../../../chat/components/ChatAvatar'
import { ChatHeaderPresence } from '../../../chat/components/ChatHeaderPresence'
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
      <div className="chat-floating-header-surface mx-auto flex min-h-14 w-full items-center gap-3 rounded-[10px] border px-3 py-2">
        <span
          aria-hidden="true"
          className="chat-header-icon-button inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-chat-control"
        >
          <MenuIcon className="h-6 w-6" />
        </span>

        <ChatAvatar
          alt={previewThread.title}
          avatarUrl={branding.assets.logo?.publicUrl ?? previewThread.avatarUrl}
          className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-brand-900 text-sm font-semibold tracking-wide text-white"
          title={previewThread.title}
        >
          {tenantMonogram}
        </ChatAvatar>

        <div className="min-w-0 flex-1 py-0.5">
          <h1 className="truncate text-[16px] font-semibold leading-tight text-[color:var(--portal-chat-header-foreground,#0f172a)]">
            {previewThread.title}
          </h1>
          <ChatHeaderPresence
            label="На связи"
            subtitle={previewThread.subtitle}
            tone="online"
          />
        </div>

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
