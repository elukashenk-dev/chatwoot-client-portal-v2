export function AgentTypingIndicator({ isVisible }: { isVisible: boolean }) {
  if (!isVisible) {
    return null
  }

  return (
    <div
      aria-label="Идет набор сообщения"
      aria-live="polite"
      className="px-4 pb-2 sm:px-6"
      role="status"
    >
      <div aria-hidden="true" className="flex h-6 items-center gap-1">
        <span
          className="h-1.5 w-1.5 rounded-full bg-slate-400 motion-safe:animate-bounce"
          style={{ animationDelay: '-0.2s' }}
        />
        <span
          className="h-1.5 w-1.5 rounded-full bg-slate-400 motion-safe:animate-bounce"
          style={{ animationDelay: '-0.1s' }}
        />
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400 motion-safe:animate-bounce" />
      </div>
    </div>
  )
}
