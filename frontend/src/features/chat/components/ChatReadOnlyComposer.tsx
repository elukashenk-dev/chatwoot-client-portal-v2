import {
  MicrophoneIcon,
  PaperclipIcon,
  SendIcon,
} from '../../../shared/ui/icons'

export function ChatReadOnlyComposer() {
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
            <div className="flex min-h-[44px] flex-1 items-center rounded-[0.8rem] bg-transparent px-2 py-2 text-[14px] leading-6 text-slate-400">
              Отправка сообщений будет доступна на следующем этапе
            </div>
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
              aria-label="Отправить"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.75rem] bg-slate-200 text-white"
              disabled
              title="Отправка будет доступна позже"
              type="button"
            >
              <SendIcon className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      </div>
    </footer>
  )
}
