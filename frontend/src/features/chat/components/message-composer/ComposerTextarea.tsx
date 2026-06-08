import type { RefObject } from 'react'

type ComposerTextareaProps = {
  ariaDescribedBy?: string
  disabled: boolean
  draft: string
  isInvalid?: boolean
  onDraftChange: (value: string) => void
  onSubmit: () => void
  placeholder: string
  textareaRef: RefObject<HTMLTextAreaElement | null>
}

export function ComposerTextarea({
  ariaDescribedBy,
  disabled,
  draft,
  isInvalid = false,
  onDraftChange,
  onSubmit,
  placeholder,
  textareaRef,
}: ComposerTextareaProps) {
  return (
    <textarea
      aria-describedby={ariaDescribedBy}
      aria-invalid={isInvalid ? 'true' : undefined}
      aria-label="Сообщение"
      className="chat-text max-h-32 min-h-10 min-w-0 flex-1 resize-none overflow-hidden border-0 bg-transparent px-2 py-2 text-[15px] leading-6 shadow-none outline-none placeholder:text-[color:var(--portal-chat-muted-text-color,#64748b)] focus:border-transparent focus:outline-none focus:ring-0 focus-visible:outline-none disabled:text-[color:var(--portal-chat-muted-text-color,#64748b)]"
      disabled={disabled}
      onChange={(event) => {
        onDraftChange(event.target.value)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          onSubmit()
        }
      }}
      placeholder={placeholder}
      ref={textareaRef}
      rows={1}
      value={draft}
    />
  )
}
