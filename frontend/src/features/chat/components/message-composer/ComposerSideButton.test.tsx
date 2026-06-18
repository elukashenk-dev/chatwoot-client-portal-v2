import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { PaperclipIcon } from '../../../../shared/ui/icons'
import { ComposerSideButton } from './ComposerSideButton'

describe('ComposerSideButton', () => {
  it('renders the shared composer icon button chrome', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()

    render(
      <ComposerSideButton
        ariaLabel="Прикрепить файл"
        onClick={onClick}
        shape="control"
        title="Прикрепить файл"
      >
        <PaperclipIcon className="h-5 w-5" />
      </ComposerSideButton>,
    )

    const button = screen.getByRole('button', { name: 'Прикрепить файл' })

    expect(button).toHaveClass(
      'h-10',
      'w-10',
      'text-chat-outgoing',
      'rounded-chat-control',
    )

    await user.click(button)

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('can render disabled round voice controls', () => {
    render(
      <ComposerSideButton
        ariaLabel="Голосовое сообщение"
        disabled
        shape="round"
      >
        icon
      </ComposerSideButton>,
    )

    const button = screen.getByRole('button', { name: 'Голосовое сообщение' })

    expect(button).toBeDisabled()
    expect(button).toHaveClass('rounded-full', 'disabled:text-slate-300')
  })
})
