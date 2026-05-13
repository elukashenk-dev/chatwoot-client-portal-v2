import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { MessageComposer } from './MessageComposer'

function renderComposer() {
  return render(
    <MessageComposer
      disabled={false}
      errorMessage={null}
      isSending={false}
      onCancelReply={vi.fn()}
      onSend={vi.fn(async () => true)}
      onSendAttachment={vi.fn(async () => true)}
      replyTarget={null}
    />,
  )
}

function getSideControl(
  container: HTMLElement,
  control: 'attachment' | 'voice',
) {
  const sideControl = container.querySelector(
    `[data-composer-side-control="${control}"]`,
  )

  if (!(sideControl instanceof HTMLElement)) {
    throw new Error(`Missing composer ${control} side control.`)
  }

  return sideControl
}

describe('MessageComposer', () => {
  it('renders the primary input row without an extra bordered surface wrapper', () => {
    renderComposer()
    const textarea = screen.getByRole('textbox', { name: 'Сообщение' })

    expect(textarea.closest('.rounded-chat-menu')).toBeNull()
  })

  it('renders no emoji controls and collapses attachment/voice while a text draft is active', async () => {
    const user = userEvent.setup()
    const { container } = renderComposer()
    const textarea = screen.getByRole('textbox', { name: 'Сообщение' })
    const attachmentControl = getSideControl(container, 'attachment')
    const voiceControl = getSideControl(container, 'voice')

    expect(
      screen.queryByRole('button', { name: /эмоджи/i }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Готово')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Прикрепить файл' }),
    ).not.toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Голосовое сообщение' }),
    ).not.toBeDisabled()
    expect(attachmentControl).toHaveClass('w-10', 'opacity-100')
    expect(voiceControl).toHaveClass('w-10', 'opacity-100')
    expect(screen.getByRole('button', { name: 'Прикрепить файл' })).toHaveClass(
      'hover:text-chat-outgoing/80',
    )
    expect(
      screen.getByRole('button', { name: 'Голосовое сообщение' }),
    ).toHaveClass('hover:text-chat-outgoing/80')
    expect(screen.getByRole('button', { name: 'Отправить' })).not.toHaveClass(
      'bg-chat-outgoing',
    )

    await user.type(textarea, 'П')

    expect(
      screen.queryByRole('button', { name: 'Прикрепить файл' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Голосовое сообщение' }),
    ).not.toBeInTheDocument()
    expect(attachmentControl).toHaveAttribute('aria-hidden', 'true')
    expect(voiceControl).toHaveAttribute('aria-hidden', 'true')
    expect(attachmentControl).toHaveClass('w-0', 'opacity-0')
    expect(voiceControl).toHaveClass('w-0', 'opacity-0')
    expect(
      within(attachmentControl).getByRole('button', {
        hidden: true,
        name: 'Прикрепить файл',
      }),
    ).toBeDisabled()
    expect(
      within(voiceControl).getByRole('button', {
        hidden: true,
        name: 'Голосовое сообщение',
      }),
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Отправить' })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'Отправить' })).toHaveClass(
      'text-chat-outgoing',
    )
    expect(screen.getByRole('button', { name: 'Отправить' })).not.toHaveClass(
      'bg-chat-outgoing',
    )

    await user.clear(textarea)

    expect(
      screen.getByRole('button', { name: 'Прикрепить файл' }),
    ).not.toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Голосовое сообщение' }),
    ).not.toBeDisabled()
    expect(attachmentControl).not.toHaveAttribute('aria-hidden')
    expect(voiceControl).not.toHaveAttribute('aria-hidden')
    expect(attachmentControl).toHaveClass('w-10', 'opacity-100')
    expect(voiceControl).toHaveClass('w-10', 'opacity-100')
  })

  it('keeps side controls visible for a whitespace-only draft', async () => {
    const user = userEvent.setup()
    const { container } = renderComposer()
    const textarea = screen.getByRole('textbox', { name: 'Сообщение' })
    const attachmentControl = getSideControl(container, 'attachment')
    const voiceControl = getSideControl(container, 'voice')

    await user.type(textarea, '   ')

    expect(
      screen.getByRole('button', { name: 'Прикрепить файл' }),
    ).not.toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Голосовое сообщение' }),
    ).not.toBeDisabled()
    expect(attachmentControl).toHaveClass('w-10', 'opacity-100')
    expect(voiceControl).toHaveClass('w-10', 'opacity-100')
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeDisabled()
  })
})
