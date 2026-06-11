import { ChatFullScreenPanel } from './ChatFullScreenPanel'
import { createTenantMonogram } from '../../tenant/lib/tenantIdentityMetadata'
import { useTenantIdentity } from '../../tenant/lib/useTenantIdentity'
import { useBranding } from '../../branding/lib/useBranding'
import {
  getSupportAvailabilityPresentation,
  groupWorkingHoursRows,
} from '../lib/chatSupportAvailability'
import type {
  ChatSupportAvailabilityResponse,
  ChatThreadInfoResponse,
} from '../types'
import { ChatAvatar } from './ChatAvatar'

type ChatInfoPageProps = {
  info: ChatThreadInfoResponse | null
  isBackActionReadOnly?: boolean
  isLoading: boolean
  isSupportAvailabilityLoading: boolean
  onBack: () => void
  onRetry: () => void
  supportAvailability: ChatSupportAvailabilityResponse | null
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
      <dt className="chat-muted-text shrink-0 text-[13px] leading-5">
        {label}
      </dt>
      <dd className="chat-text min-w-0 max-w-[65%] break-words text-right text-[13px] font-medium leading-5">
        {value}
      </dd>
    </div>
  )
}

function ParticipantAvatar({
  avatarUrl,
  name,
}: {
  avatarUrl?: string | null
  name: string
}) {
  return (
    <ChatAvatar
      alt={name}
      avatarUrl={avatarUrl}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 text-[11px] font-semibold text-brand-800"
      title={name}
    >
      {createTenantMonogram(name)}
    </ChatAvatar>
  )
}

function WorkingHoursSection({
  isLoading,
  supportAvailability,
}: {
  isLoading: boolean
  supportAvailability: ChatSupportAvailabilityResponse | null
}) {
  const presentation = getSupportAvailabilityPresentation(supportAvailability)
  const isUnavailable =
    !supportAvailability || supportAvailability.result !== 'ready'

  if (isLoading || isUnavailable) {
    return (
      <section className="mt-5 overflow-hidden rounded-lg border border-slate-200/90 bg-white">
        <div className="flex min-h-11 items-center justify-between gap-3 border-b border-slate-200/80 px-4 py-3">
          <h2 className="chat-text text-[13px] font-semibold">Часы работы</h2>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500">
            Проверяем
          </span>
        </div>
        <p className="chat-muted-text px-4 py-3 text-[13px] leading-5">
          {isLoading
            ? 'Проверяем расписание поддержки.'
            : 'Не удалось загрузить расписание поддержки.'}
        </p>
      </section>
    )
  }

  const groupedRows = groupWorkingHoursRows(
    supportAvailability.workingHours.rows,
  )
  const showOutOfOfficeMessage =
    supportAvailability.currentStatus === 'outside_hours' &&
    supportAvailability.outOfOfficeMessage

  return (
    <section className="mt-5 overflow-hidden rounded-lg border border-slate-200/90 bg-white">
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-slate-200/80 px-4 py-3">
        <h2 className="chat-text text-[13px] font-semibold">Часы работы</h2>
        <span
          className={[
            'rounded-full px-2 py-1 text-[11px] font-semibold',
            presentation.tone === 'online'
              ? 'bg-green-50 text-green-700'
              : presentation.tone === 'later'
                ? 'bg-amber-50 text-amber-700'
                : 'bg-slate-100 text-slate-500',
          ].join(' ')}
        >
          {presentation.label}
        </span>
      </div>
      <div className="px-4 py-3">
        {supportAvailability.workingHours.enabled && groupedRows.length > 0 ? (
          <dl className="space-y-2">
            {groupedRows.map((row) => (
              <div
                className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 text-[13px] leading-5"
                key={`${row.daysLabel}-${row.timeLabel}`}
              >
                <dt className="chat-muted-text">{row.daysLabel}</dt>
                <dd className="chat-text font-medium">{row.timeLabel}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="chat-muted-text text-[13px] leading-5">
            Без расписания
          </p>
        )}
        <p className="chat-muted-text mt-3 text-[12px] leading-4">
          Часовой пояс: {supportAvailability.workingHours.timezone}
        </p>
        {showOutOfOfficeMessage ? (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] leading-5 text-amber-800">
            {supportAvailability.outOfOfficeMessage}
          </p>
        ) : null}
      </div>
    </section>
  )
}

export function ChatInfoPage({
  info,
  isBackActionReadOnly = false,
  isLoading,
  isSupportAvailabilityLoading,
  onBack,
  onRetry,
  supportAvailability,
}: ChatInfoPageProps) {
  const { branding } = useBranding()
  const { tenant } = useTenantIdentity()
  const monogram = createTenantMonogram(
    branding.portalName || tenant?.displayName || 'ЛК',
  )
  const startedAt = formatDateTime(info?.startedAt ?? null)
  const lastActivityAt = formatDateTime(info?.lastActivityAt ?? null)
  const isUnavailable = !info || info.result !== 'ready'
  const threadTitle = info?.activeThread?.title ?? 'Чат'

  return (
    <ChatFullScreenPanel
      isBackActionReadOnly={isBackActionReadOnly}
      isLoading={isLoading}
      isUnavailable={isUnavailable}
      loadingMessage="Загружаем информацию о чате."
      onBack={onBack}
      onRetry={onRetry}
      title={branding.copy.chatInfoTitle}
      unavailableMessage="Не удалось загрузить информацию о чате."
    >
      {info ? (
        <div className="mx-auto max-w-md">
          <div className="flex flex-col items-center text-center">
            <ChatAvatar
              alt={threadTitle}
              avatarUrl={
                info.activeThread?.avatarUrl ?? branding.assets.logo?.publicUrl
              }
              className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg bg-brand-900 text-base font-semibold text-white"
              title={threadTitle}
            >
              {monogram}
            </ChatAvatar>
            <h2 className="mt-3 max-w-full truncate text-[18px] font-semibold leading-tight">
              {threadTitle}
            </h2>
            <p className="chat-muted-text mt-1 max-w-full truncate text-[13px]">
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

          <WorkingHoursSection
            isLoading={isSupportAvailabilityLoading}
            supportAvailability={supportAvailability}
          />

          {info.participants.length > 0 ? (
            <section className="mt-5">
              <h2 className="chat-muted-text px-1 text-[12px] font-semibold uppercase tracking-normal">
                Участники портала
              </h2>
              <div className="mt-2 overflow-hidden rounded-lg border border-slate-200/90 bg-white">
                {info.participants.map((participant) => (
                  <div
                    className="flex min-h-12 items-center gap-3 border-b border-slate-200/80 px-4 py-2.5 last:border-b-0"
                    key={participant.id}
                  >
                    <ParticipantAvatar
                      avatarUrl={participant.avatarUrl}
                      name={participant.displayName}
                    />
                    <span className="chat-text min-w-0 flex-1 truncate text-[13px] font-medium">
                      {participant.displayName}
                    </span>
                    {participant.isCurrentUser ? (
                      <span className="chat-muted-text shrink-0 text-[12px]">
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
