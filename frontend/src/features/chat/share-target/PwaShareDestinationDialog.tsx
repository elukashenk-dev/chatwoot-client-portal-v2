import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

import type { ChatThreadListSummary } from '../types'
import { formatSelectedAttachmentSize } from '../components/message-composer/utils'
import type { PwaShareTargetController } from './usePwaShareTargetDraft'

type PwaShareDestinationDialogProps = {
  controller: PwaShareTargetController
  threads: readonly ChatThreadListSummary[]
}

export function PwaShareDestinationDialog({
  controller,
  threads,
}: PwaShareDestinationDialogProps) {
  if (
    controller.status === 'idle' ||
    controller.status === 'imported'
  ) {
    return null
  }

  if (controller.status === 'error' && !controller.pendingDraft) {
    return (
      <div
        className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+1rem)] z-[90] mx-auto max-w-lg rounded-xl border border-red-200 bg-white p-4 text-sm text-slate-700 shadow-xl"
        role="alert"
      >
        <p className="font-medium text-slate-900">Файлы не добавлены</p>
        <p className="mt-1">{controller.errorMessage}</p>
        <button
          className="mt-3 rounded-lg bg-slate-900 px-3 py-2 font-medium text-white"
          onClick={() => void controller.cancelShareDraft()}
          type="button"
        >
          Понятно
        </button>
      </div>
    )
  }

  const pendingDraft = controller.pendingDraft
  const totalBytes =
    pendingDraft?.files.reduce((total, file) => total + file.blob.size, 0) ?? 0
  const isCheckingSession = controller.status === 'checking-session'
  const canContinue =
    !isCheckingSession &&
    Boolean(controller.selectedDestinationThreadId) &&
    threads.some(
      ({ id }) => id === controller.selectedDestinationThreadId,
    )

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      void controller.cancelShareDraft()
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 px-4 py-6">
      <section
        aria-labelledby="pwa-share-destination-title"
        aria-modal="true"
        className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 text-slate-900 shadow-2xl"
        onKeyDown={handleKeyDown}
        role="dialog"
      >
        <h2
          className="text-lg font-semibold"
          id="pwa-share-destination-title"
        >
          Куда добавить файлы?
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Файлы появятся в сообщении, но не отправятся без нажатия «Отправить».
        </p>

        {isCheckingSession ? (
          <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm" role="status">
            Проверяем вход в портал…
          </p>
        ) : null}

        {pendingDraft ? (
          <>
            <div className="mt-5 rounded-xl bg-brand-50/70 p-3">
              <p className="text-xs font-medium text-slate-600">
                {pendingDraft.files.length}/5 ·{' '}
                {formatSelectedAttachmentSize(totalBytes)}
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {pendingDraft.files.map((file, index) => (
                  <li
                    className="truncate"
                    key={`${file.fileName}:${file.lastModified}:${index}`}
                    title={file.fileName}
                  >
                    {file.fileName}
                  </li>
                ))}
              </ul>
            </div>

            <fieldset className="mt-5">
              <legend className="text-sm font-medium">Выберите чат</legend>
              <div className="mt-2 space-y-2">
                {threads.map((thread) => (
                  <label
                    className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50/60"
                    key={thread.id}
                  >
                    <input
                      checked={
                        controller.selectedDestinationThreadId === thread.id
                      }
                      className="mt-1"
                      name="pwa-share-destination"
                      onChange={() =>
                        controller.setSelectedDestinationThreadId(thread.id)
                      }
                      type="radio"
                      value={thread.id}
                    />
                    <span>
                      <span className="block text-sm font-medium">
                        {thread.title}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {thread.subtitle}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </>
        ) : null}

        {controller.errorMessage ? (
          <p className="mt-4 text-sm text-red-700" role="alert">
            {controller.errorMessage}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            onClick={() => void controller.cancelShareDraft()}
            type="button"
          >
            Отменить
          </button>
          <button
            className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={!canContinue}
            onClick={() => {
              const threadId = controller.selectedDestinationThreadId

              if (threadId) {
                void controller.confirmDestination(threadId)
              }
            }}
            type="button"
          >
            Продолжить
          </button>
        </div>
      </section>
    </div>
  )
}
