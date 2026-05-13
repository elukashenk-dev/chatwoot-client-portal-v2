import { useLayoutEffect, useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import {
  COMPOSER_TEXTAREA_MAX_HEIGHT_PX,
  COMPOSER_TEXTAREA_MIN_HEIGHT_PX,
} from './utils'
import { useComposerTextarea } from './useComposerTextarea'

function ComposerTextareaHarness() {
  const [draft, setDraft] = useState('')
  const { focusTextarea, resizeTextarea, textareaRef } = useComposerTextarea()

  useLayoutEffect(() => {
    resizeTextarea()
  }, [draft, resizeTextarea])

  return (
    <>
      <textarea
        aria-label="Composer textarea"
        onChange={(event) => {
          setDraft(event.target.value)
        }}
        ref={textareaRef}
        value={draft}
      />
      <button onClick={focusTextarea} type="button">
        Focus textarea
      </button>
    </>
  )
}

describe('useComposerTextarea', () => {
  it('preserves composer textarea resize limits and focus control', async () => {
    const user = userEvent.setup()

    render(<ComposerTextareaHarness />)

    const textarea = screen.getByRole('textbox', {
      name: 'Composer textarea',
    })

    expect(textarea.style.height).toBe(`${COMPOSER_TEXTAREA_MIN_HEIGHT_PX}px`)
    expect(textarea.style.overflowY).toBe('hidden')

    Object.defineProperty(textarea, 'scrollHeight', {
      configurable: true,
      value: COMPOSER_TEXTAREA_MAX_HEIGHT_PX + 40,
    })

    await user.type(textarea, 'Длинное сообщение')

    expect(textarea.style.height).toBe(`${COMPOSER_TEXTAREA_MAX_HEIGHT_PX}px`)
    expect(textarea.style.overflowY).toBe('auto')

    await user.click(screen.getByRole('button', { name: 'Focus textarea' }))

    expect(textarea).toHaveFocus()
  })
})
