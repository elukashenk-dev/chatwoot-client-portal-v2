const QUICK_EMOJI_ACTIONS = [
  { emoji: '👍', label: 'Ок', text: '👍 Ок', type: 'phrase' },
  { emoji: '✅', label: 'Готово', text: '✅ Готово', type: 'phrase' },
  { emoji: '👌', label: 'Согласовано', text: '👌 Согласовано', type: 'phrase' },
  { emoji: '🙏', label: 'Спасибо', text: '🙏 Спасибо', type: 'phrase' },
  { emoji: '👀', label: 'Смотрю', text: '👀 Смотрю', type: 'phrase' },
] as const

const COMMON_EMOJI_ACTIONS = [
  '😀',
  '🙂',
  '😉',
  '😊',
  '😍',
  '🤔',
  '😎',
  '🙌',
  '👏',
  '💪',
  '🔥',
  '✨',
  '❤️',
  '💬',
  '📌',
  '📎',
  '📄',
  '⏳',
  '🚀',
  '⭐',
] as const

type EmojiPickerProps = {
  disabled: boolean
  onInsertEmoji: (emoji: string) => void
  onInsertPhrase: (text: string) => void
}

export function EmojiPicker({
  disabled,
  onInsertEmoji,
  onInsertPhrase,
}: EmojiPickerProps) {
  return (
    <div
      aria-label="Выбор эмоджи"
      className="absolute inset-x-0 bottom-[calc(100%+0.5rem)] z-20 rounded-[0.95rem] border border-slate-200 bg-white p-2.5 shadow-lg shadow-slate-900/12"
      role="dialog"
    >
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {QUICK_EMOJI_ACTIONS.map((action) => (
          <button
            aria-label={`Добавить ${action.text}`}
            className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 text-[13px] font-medium text-slate-600 transition hover:border-brand-100 hover:bg-brand-50 hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-300"
            disabled={disabled}
            key={action.label}
            onClick={() => {
              onInsertPhrase(action.text)
            }}
            type="button"
          >
            <span aria-hidden="true">{action.emoji}</span>
            <span>{action.label}</span>
          </button>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-10 gap-1">
        {COMMON_EMOJI_ACTIONS.map((emoji) => (
          <button
            aria-label={`Добавить ${emoji}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-[0.7rem] text-[20px] transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={disabled}
            key={emoji}
            onClick={() => {
              onInsertEmoji(emoji)
            }}
            type="button"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}
