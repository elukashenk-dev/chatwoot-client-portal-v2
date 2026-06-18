import { useRef, useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ComposerTextarea } from './ComposerTextarea'

function ComposerTextareaHarness({
  disabled = false,
  onSubmit = vi.fn(),
}: {
  disabled?: boolean
  onSubmit?: () => void
}) {
  const [draft, setDraft] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  return (
    <ComposerTextarea
      disabled={disabled}
      draft={draft}
      onDraftChange={setDraft}
      onSubmit={onSubmit}
      placeholder={disabled ? 'Чат временно недоступен' : 'Сообщение...'}
      textareaRef={textareaRef}
    />
  )
}

describe('ComposerTextarea', () => {
  it('updates draft text and submits only on plain Enter', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    render(<ComposerTextareaHarness onSubmit={onSubmit} />)

    const textarea = screen.getByRole('textbox', { name: 'Сообщение' })

    expect(textarea).toHaveClass(
      'bg-transparent',
      'border-0',
      'placeholder:text-[color:var(--portal-chat-muted-text-color,#64748b)]',
    )

    await user.type(textarea, 'Привет')
    await user.keyboard('{Shift>}{Enter}{/Shift}')

    expect(textarea).toHaveValue('Привет\n')
    expect(onSubmit).not.toHaveBeenCalled()

    await user.keyboard('{Enter}')

    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})
