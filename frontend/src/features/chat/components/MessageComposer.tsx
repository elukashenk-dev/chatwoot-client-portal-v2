import { useLayoutEffect, useRef, useState } from 'react'

import {
  FileTextIcon,
  MicrophoneIcon,
  PaperclipIcon,
  SendIcon,
  XIcon,
} from '../../../shared/ui/icons'

type SendMessageInput = {
  clientMessageKey: string
  content: string
}

type SendAttachmentInput = {
  clientMessageKey: string
  file: File
}

type MessageComposerProps = {
  disabled: boolean
  errorMessage: string | null
  isSending: boolean
  onSend: (input: SendMessageInput) => Promise<boolean>
  onSendAttachment: (input: SendAttachmentInput) => Promise<boolean>
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

function createAttachmentSignature(file: File) {
  return [file.name, file.type, file.size, file.lastModified].join(':')
}

function formatSelectedAttachmentSize(fileSize: number) {
  if (fileSize >= 1024 * 1024) {
    return `${(fileSize / 1024 / 1024).toFixed(1)} МБ`
  }

  return `${Math.max(1, Math.round(fileSize / 1024))} КБ`
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
  onSendAttachment,
}: MessageComposerProps) {
  const [draft, setDraft] = useState('')
  const [selectedAttachment, setSelectedAttachment] = useState<File | null>(
    null,
  )
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const pendingClientMessageKeyRef = useRef<string | null>(null)
  const pendingContentRef = useRef<string | null>(null)
  const pendingAttachmentClientMessageKeyRef = useRef<string | null>(null)
  const pendingAttachmentSignatureRef = useRef<string | null>(null)
  const normalizedDraft = draft.trim()
  const canSendText = !disabled && !isSending && normalizedDraft.length > 0
  const canSendAttachment =
    !disabled && !isSending && selectedAttachment !== null
  const canSend = canSendAttachment || canSendText

  useLayoutEffect(() => {
    if (!textareaRef.current) {
      return
    }

    resizeComposerTextarea(textareaRef.current)
  }, [draft])

  async function submitText() {
    if (!canSendText) {
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

  async function submitAttachment() {
    if (!canSendAttachment || !selectedAttachment) {
      return
    }

    const attachmentSignature = createAttachmentSignature(selectedAttachment)
    const clientMessageKey =
      pendingAttachmentClientMessageKeyRef.current ?? createClientMessageKey()

    pendingAttachmentClientMessageKeyRef.current = clientMessageKey
    pendingAttachmentSignatureRef.current = attachmentSignature

    const wasSent = await onSendAttachment({
      clientMessageKey,
      file: selectedAttachment,
    })

    if (wasSent) {
      pendingAttachmentClientMessageKeyRef.current = null
      pendingAttachmentSignatureRef.current = null
      setSelectedAttachment(null)

      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  async function submitCurrentDraft() {
    if (selectedAttachment) {
      await submitAttachment()
      return
    }

    await submitText()
  }

  function selectAttachment(file: File | null) {
    if (!file) {
      setSelectedAttachment(null)
      pendingAttachmentClientMessageKeyRef.current = null
      pendingAttachmentSignatureRef.current = null
      return
    }

    const nextSignature = createAttachmentSignature(file)

    if (pendingAttachmentSignatureRef.current !== nextSignature) {
      pendingAttachmentClientMessageKeyRef.current = null
      pendingAttachmentSignatureRef.current = null
    }

    setSelectedAttachment(file)
  }

  return (
    <footer className="border-t border-slate-200/90 bg-white/95 px-4 py-4 backdrop-blur-sm sm:px-6">
      <div className="mx-auto w-full max-w-[620px]">
        <div className="rounded-[1rem] border border-slate-200 bg-slate-50/90 p-2">
          {selectedAttachment ? (
            <div className="mb-2 flex items-center gap-3 rounded-[0.8rem] border border-slate-200 bg-white px-3 py-2">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.7rem] bg-brand-50 text-brand-800">
                <FileTextIcon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-slate-800">
                  {selectedAttachment.name}
                </span>
                <span className="mt-0.5 block text-[12px] text-slate-500">
                  {formatSelectedAttachmentSize(selectedAttachment.size)}
                </span>
              </span>
              <button
                aria-label="Убрать файл"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.65rem] text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:text-slate-300"
                disabled={isSending}
                onClick={() => {
                  selectAttachment(null)

                  if (fileInputRef.current) {
                    fileInputRef.current.value = ''
                  }
                }}
                title="Убрать файл"
                type="button"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>
          ) : null}
          <div className="flex items-end gap-2">
            <input
              accept="image/*,video/*,audio/*,.csv,.doc,.docx,.json,.pdf,.ppt,.pptx,.rtf,.txt,.xls,.xlsx,.zip,.7z"
              aria-label="Файл вложения"
              className="sr-only"
              disabled={disabled || isSending}
              onChange={(event) => {
                selectAttachment(event.target.files?.[0] ?? null)
              }}
              ref={fileInputRef}
              type="file"
            />
            <button
              aria-label="Прикрепить файл"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.75rem] text-slate-500 transition hover:bg-white hover:text-brand-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:text-slate-300"
              disabled={disabled || isSending}
              onClick={() => {
                fileInputRef.current?.click()
              }}
              title="Прикрепить файл"
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
                  void submitCurrentDraft()
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
              aria-label={
                isSending
                  ? 'Отправляем'
                  : selectedAttachment
                    ? 'Отправить файл'
                    : 'Отправить'
              }
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.75rem] bg-brand-800 text-white transition hover:bg-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-200"
              disabled={!canSend}
              onClick={() => {
                void submitCurrentDraft()
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
