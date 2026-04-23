import { SendIcon, XIcon } from '../../../../shared/ui/icons'

import type { VoiceRecorderStatus } from './types'

type VoiceRecordingPanelProps = {
  durationLabel: string
  onCancel: () => void
  onSend: () => void
  status: VoiceRecorderStatus
}

export function VoiceRecordingPanel({
  durationLabel,
  onCancel,
  onSend,
  status,
}: VoiceRecordingPanelProps) {
  if (status === 'idle' || status === 'sending') {
    return null
  }

  return (
    <div className="mb-2 flex items-center gap-3 rounded-[0.8rem] border border-rose-100 bg-white px-3 py-2">
      <span
        aria-hidden="true"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.7rem] bg-rose-50 text-rose-600"
      >
        <span className="h-2.5 w-2.5 rounded-full bg-rose-500 shadow-[0_0_0_6px_rgba(244,63,94,0.12)]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-slate-800">
          Запись {durationLabel}
        </span>
      </span>
      <button
        aria-label="Отменить голосовое"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.65rem] text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:text-slate-300"
        disabled={status !== 'recording'}
        onClick={onCancel}
        title="Отменить"
        type="button"
      >
        <XIcon className="h-4 w-4" />
      </button>
      <button
        aria-label="Отправить голосовое"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.65rem] bg-brand-800 text-white transition hover:bg-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-200"
        disabled={status !== 'recording'}
        onClick={onSend}
        title="Отправить голосовое"
        type="button"
      >
        <SendIcon className="h-4 w-4" />
      </button>
    </div>
  )
}
