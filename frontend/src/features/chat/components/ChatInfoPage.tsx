import { ChatFullScreenPanel } from './ChatFullScreenPanel'
import { createTenantMonogram } from '../../tenant/lib/tenantIdentityMetadata'
import { useTenantIdentity } from '../../tenant/lib/useTenantIdentity'
import type { ChatThreadInfoResponse } from '../types'

type ChatInfoPageProps = {
  info: ChatThreadInfoResponse | null
  isLoading: boolean
  onBack: () => void
  onRetry: () => void
}

function formatDateTime(value: string | null) {
  if (!value) {
    return null
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value))
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 border-b border-slate-200/80 px-4 py-3 last:border-b-0">
      <dt className="shrink-0 text-[13px] leading-5 text-slate-500">{label}</dt>
      <dd className="min-w-0 max-w-[65%] break-words text-right text-[13px] font-medium leading-5 text-slate-900">
        {value}
      </dd>
    </div>
  )
}

function ParticipantAvatar({ name }: { name: string }) {
  return (
    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-semibold text-brand-800">
      {createTenantMonogram(name)}
    </span>
  )
}

export function ChatInfoPage({
  info,
  isLoading,
  onBack,
  onRetry,
}: ChatInfoPageProps) {
  const { tenant } = useTenantIdentity()
  const monogram = tenant ? createTenantMonogram(tenant.displayName) : 'ЛК'
  const startedAt = formatDateTime(info?.startedAt ?? null)
  const lastActivityAt = formatDateTime(info?.lastActivityAt ?? null)
  const isUnavailable = !info || info.result !== 'ready'

  return (
    <ChatFullScreenPanel
      isLoading={isLoading}
      isUnavailable={isUnavailable}
      loadingMessage="Загружаем информацию о чате."
      onBack={onBack}
      onRetry={onRetry}
      title="Информация о чате"
      unavailableMessage="Не удалось загрузить информацию о чате."
    >
      {info ? (
        <div className="mx-auto max-w-md">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-brand-900 text-base font-semibold text-white">
              {monogram}
            </div>
            <h2 className="mt-3 max-w-full truncate text-[18px] font-semibold leading-tight">
              {info.activeThread?.title ?? 'Чат'}
            </h2>
            <p className="mt-1 max-w-full truncate text-[13px] text-slate-500">
              {info.activeThread?.subtitle ?? info.supportLabel}
            </p>
          </div>

          <dl className="mt-6 overflow-hidden rounded-lg border border-slate-200/90 bg-white">
            {info.threadTypeLabel ? (
              <DetailRow label="Тип чата" value={info.threadTypeLabel} />
            ) : null}
            <DetailRow label="Поддержка" value={info.supportLabel} />
            {info.curatorName ? (
              <DetailRow label="Ваш куратор" value={info.curatorName} />
            ) : null}
            <DetailRow label="Начат" value={startedAt ?? 'Еще нет сообщений'} />
            {lastActivityAt ? (
              <DetailRow label="Последняя активность" value={lastActivityAt} />
            ) : null}
            <DetailRow label="Доступ" value={info.accessLabel} />
          </dl>

          {info.participants.length > 0 ? (
            <section className="mt-5">
              <h2 className="px-1 text-[12px] font-semibold uppercase tracking-normal text-slate-500">
                Участники портала
              </h2>
              <div className="mt-2 overflow-hidden rounded-lg border border-slate-200/90 bg-white">
                {info.participants.map((participant) => (
                  <div
                    className="flex min-h-12 items-center gap-3 border-b border-slate-200/80 px-4 py-2.5 last:border-b-0"
                    key={participant.id}
                  >
                    <ParticipantAvatar name={participant.displayName} />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-900">
                      {participant.displayName}
                    </span>
                    {participant.isCurrentUser ? (
                      <span className="shrink-0 text-[12px] text-slate-500">
                        Вы
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </ChatFullScreenPanel>
  )
}
