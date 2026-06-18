export function AgentTypingIndicator({
  isVisible,
  shouldAnimatePresence = false,
}: {
  isVisible: boolean
  shouldAnimatePresence?: boolean
}) {
  if (!shouldAnimatePresence && !isVisible) {
    return null
  }

  const slotAccessibilityProps = isVisible
    ? {}
    : {
        'aria-hidden': true,
      }
  const dotsAccessibilityProps = isVisible
    ? {
        'aria-label': 'Идет набор сообщения',
        'aria-live': 'polite' as const,
        role: 'status' as const,
      }
    : {}
  const containerClassName = shouldAnimatePresence
    ? `pointer-events-none relative z-20 h-0 overflow-visible bg-transparent px-4 transition-opacity duration-200 ease-out motion-reduce:transition-none sm:px-6 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`
    : 'pointer-events-none relative z-20 h-0 overflow-visible bg-transparent px-4 sm:px-6'

  return (
    <div
      className={containerClassName}
      data-testid="agent-typing-indicator-slot"
      {...slotAccessibilityProps}
    >
      <div className="mx-auto w-full max-w-[620px] bg-transparent">
        <div
          className="flex h-5 w-fit -translate-y-6 items-center gap-1 bg-transparent"
          data-testid="agent-typing-indicator-dots"
          {...dotsAccessibilityProps}
        >
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-chat-outgoing,#465a72)] opacity-70 motion-safe:animate-bounce"
            style={{ animationDelay: '-0.2s' }}
          />
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-chat-outgoing,#465a72)] opacity-70 motion-safe:animate-bounce"
            style={{ animationDelay: '-0.1s' }}
          />
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-chat-outgoing,#465a72)] opacity-70 motion-safe:animate-bounce"
          />
        </div>
      </div>
    </div>
  )
}
