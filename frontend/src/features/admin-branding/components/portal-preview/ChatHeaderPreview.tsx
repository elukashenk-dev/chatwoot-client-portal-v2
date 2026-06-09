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
    <header className="app-safe-top chat-header-background chat-header-border relative z-30 border-b px-4 pb-2.5 text-[color:var(--portal-chat-header-foreground,#0f172a)] shadow-sm">
      <div className="flex min-h-10 items-center gap-3">
        <span
          aria-hidden="true"
          className="chat-header-icon-button inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-chat-control"
        >
          <MenuIcon className="h-6 w-6" />
        </span>

        <ChatAvatar
          alt={previewThread.title}
          avatarUrl={previewThread.avatarUrl ?? branding.assets.logo?.publicUrl}
          className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[0.85rem] bg-brand-900 text-sm font-semibold tracking-wide text-white"
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
