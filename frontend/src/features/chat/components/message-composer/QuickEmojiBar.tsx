const QUICK_EMOJI_ACTIONS = [
  { emoji: '👍', label: 'Ок', text: '👍 Ок' },
  { emoji: '✅', label: 'Готово', text: '✅ Готово' },
  { emoji: '👌', label: 'Согласовано', text: '👌 Согласовано' },
  { emoji: '🙏', label: 'Спасибо', text: '🙏 Спасибо' },
  { emoji: '👀', label: 'Смотрю', text: '👀 Смотрю' },
]

type QuickEmojiBarProps = {
  disabled: boolean
  onInsert: (text: string) => void
}

export function QuickEmojiBar({ disabled, onInsert }: QuickEmojiBarProps) {
  return (
    <div className="emoji-scroll -mx-4 mb-3 overflow-x-auto px-4">
      <div className="flex w-max items-center gap-2 pr-4">
        {QUICK_EMOJI_ACTIONS.map((action) => (
          <button
            aria-label={`Добавить ${action.text}`}
            className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-600 transition hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-300"
            disabled={disabled}
            key={action.label}
            onClick={() => {
              onInsert(action.text)
            }}
            title={action.label}
            type="button"
          >
            <span aria-hidden="true">{action.emoji}</span>
            <span>{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
