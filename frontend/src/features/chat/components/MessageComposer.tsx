import { useLayoutEffect, useRef, useState } from 'react'

import {
  MicrophoneIcon,
  PaperclipIcon,
  SendIcon,
} from '../../../shared/ui/icons'

type SendMessageInput = {
  clientMessageKey: string
  content: string
}

type MessageComposerProps = {
  disabled: boolean
  errorMessage: string | null
  isSending: boolean
  onSend: (input: SendMessageInput) => Promise<boolean>
}

const COMPOSER_TEXTAREA_MIN_HEIGHT_PX = 44
const COMPOSER_TEXTAREA_MAX_HEIGHT_PX = 128

function createClientMessageKey() {
  if (globalThis.crypto?.randomUUID) {
    return `portal-send:${globalThis.crypto.randomUUID()}`
  }

  return `portal-send:${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}`
}

function resizeComposerTextarea(textarea: HTMLTextAreaElement) {
  textarea.style.height = 'auto'

  const nextHeight = Math.max(
    COMPOSER_TEXTAREA_MIN_HEIGHT_PX,
    Math.min(textarea.scrollHeight, COMPOSER_TEXTAREA_MAX_HEIGHT_PX),
  )

  textarea.style.height = `${nextHeight}px`
  textarea.style.overflowY =
    textarea.scrollHeight > COMPOSER_TEXTAREA_MAX_HEIGHT_PX ? 'auto' : 'hidden'
}

export function MessageComposer({
  disabled,
  errorMessage,
  isSending,
  onSend,
}: MessageComposerProps) {
  const [draft, setDraft] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const pendingClientMessageKeyRef = useRef<string | null>(null)
  const pendingContentRef = useRef<string | null>(null)
  const normalizedDraft = draft.trim()
  const canSend = !disabled && !isSending && normalizedDraft.length > 0

  useLayoutEffect(() => {
    if (!textareaRef.current) {
      return
    }

    resizeComposerTextarea(textareaRef.current)
  }, [draft])

  async function submitDraft() {
    if (!canSend) {
      return
    }

    const clientMessageKey =
      pendingClientMessageKeyRef.current ?? createClientMessageKey()

    pendingClientMessageKeyRef.current = clientMessageKey
    pendingContentRef.current = normalizedDraft

    const wasSent = await onSend({
      clientMessageKey,
      content: normalizedDraft,
    })

    if (wasSent) {
      pendingClientMessageKeyRef.current = null
      pendingContentRef.current = null
      setDraft('')
    }
  }

  return (
    <footer className="border-t border-slate-200/90 bg-white/95 px-4 py-4 backdrop-blur-sm sm:px-6">
      <div className="mx-auto w-full max-w-[620px]">
        <div className="rounded-[1rem] border border-slate-200 bg-slate-50/90 p-2">
          <div className="flex items-end gap-2">
            <button
              aria-label="Прикрепить файл"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.75rem] text-slate-300"
              disabled
              title="Файлы будут доступны на следующем этапе"
              type="button"
            >
              <PaperclipIcon className="h-[18px] w-[18px]" />
            </button>

            <textarea
              aria-label="Сообщение"
              className="max-h-32 min-h-[44px] flex-1 resize-none overflow-hidden border-0 bg-transparent px-2 py-2 text-[15px] leading-6 text-slate-800 shadow-none outline-none placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-0 focus-visible:outline-none disabled:text-slate-400"
              disabled={disabled || isSending}
              onChange={(event) => {
                const nextDraft = event.target.value
                const nextNormalizedDraft = nextDraft.trim()

                if (
                  pendingClientMessageKeyRef.current &&
                  pendingContentRef.current !== nextNormalizedDraft
                ) {
                  pendingClientMessageKeyRef.current = null
                  pendingContentRef.current = null
                }

                setDraft(nextDraft)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void submitDraft()
                }
              }}
              placeholder={
                disabled ? 'Чат временно недоступен' : 'Напишите сообщение...'
              }
              ref={textareaRef}
              rows={1}
              value={draft}
            />

            <button
              aria-label="Голосовое сообщение"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.75rem] text-slate-300"
              disabled
              title="Голосовые сообщения будут доступны позже"
              type="button"
            >
              <MicrophoneIcon className="h-[18px] w-[18px]" />
            </button>
            <button
              aria-label={isSending ? 'Отправляем' : 'Отправить'}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.75rem] bg-brand-800 text-white transition hover:bg-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-200"
              disabled={!canSend}
              onClick={() => {
                void submitDraft()
              }}
              title="Отправить"
              type="button"
            >
              <SendIcon
                className={
                  isSending
                    ? 'h-[18px] w-[18px] animate-pulse'
                    : 'h-[18px] w-[18px]'
                }
              />
            </button>
          </div>
        </div>

        {errorMessage ? (
          <div className="mt-2 rounded-[0.8rem] border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] leading-5 text-rose-700">
            {errorMessage}
          </div>
        ) : null}
      </div>
    </footer>
  )
}
