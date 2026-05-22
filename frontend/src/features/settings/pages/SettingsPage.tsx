import { useNavigate } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'
import { BellIcon } from '../../../shared/ui/icons'
import { ChatFullScreenPanel } from '../../chat/components/ChatFullScreenPanel'

export function SettingsPage() {
  const navigate = useNavigate()

  return (
    <ChatFullScreenPanel
      isLoading={false}
      onBack={() => {
        navigate(routePaths.app.chat)
      }}
      onRetry={() => {}}
      title="Настройки"
    >
      <div className="mx-auto max-w-md">
        <button
          className="flex min-h-14 w-full items-center gap-3 rounded-lg border border-slate-200/90 bg-white px-4 py-3 text-left text-slate-900 transition hover:border-brand-200 hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
          onClick={() => {
            navigate(routePaths.app.settingsNotifications)
          }}
          type="button"
        >
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-800">
            <BellIcon className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold leading-5">
              Уведомления
            </span>
            <span className="mt-0.5 block text-[12px] leading-4 text-slate-500">
              Сообщения, звук и push на этом устройстве
            </span>
          </span>
        </button>
      </div>
    </ChatFullScreenPanel>
  )
}
