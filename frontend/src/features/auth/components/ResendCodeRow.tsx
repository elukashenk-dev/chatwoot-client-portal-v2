type ResendCodeRowProps = {
  disabled?: boolean
  isLoading?: boolean
  onResend: () => void
  secondsRemaining: number
}

export function ResendCodeRow({
  disabled = false,
  isLoading = false,
  onResend,
  secondsRemaining,
}: ResendCodeRowProps) {
  const isCooldownActive = secondsRemaining > 0

  return (
    <div className="flex flex-col gap-3 rounded-[0.9rem] border border-slate-200/80 bg-slate-50/90 px-4 py-3 text-sm leading-6 text-slate-600 sm:flex-row sm:items-center sm:justify-between">
      <p>Не пришел код? Можно запросить его повторно.</p>

      <button
        className="inline-flex min-h-11 items-center justify-center rounded-[0.75rem] px-3 font-medium text-brand-800 transition hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:text-slate-400"
        disabled={disabled || isLoading || isCooldownActive}
        onClick={onResend}
        type="button"
      >
        {isLoading
          ? 'Отправка...'
          : isCooldownActive
            ? `Повторить через ${secondsRemaining} с`
            : 'Отправить код повторно'}
      </button>
    </div>
  )
}
