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
  control: 'attachment' | 'emoji' | 'send' | 'voice',
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
  it('shows only attachment, emoji and voice controls before the user starts composing', () => {
    const { container } = renderComposer()
    const attachmentControl = getSideControl(container, 'attachment')
    const emojiControl = getSideControl(container, 'emoji')
    const voiceControl = getSideControl(container, 'voice')
    const sendControl = getSideControl(container, 'send')

    expect(
      screen.getByRole('button', { name: 'Прикрепить файл' }),
    ).not.toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Добавить эмоджи' }),
    ).not.toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Голосовое сообщение' }),
    ).not.toBeDisabled()
    expect(
      screen.queryByRole('button', { name: 'Отправить' }),
    ).not.toBeInTheDocument()
    expect(attachmentControl).toHaveClass('w-11', 'opacity-100')
    expect(emojiControl).toHaveClass('w-11', 'opacity-100')
    expect(voiceControl).toHaveClass('w-11', 'opacity-100')
    expect(sendControl).toHaveClass('w-0', 'opacity-0')
    expect(
      within(sendControl).getByRole('button', {
        hidden: true,
        name: 'Отправить',
      }),
    ).toBeDisabled()
  })

  it('keeps emoji visible and shows send while a text draft is active', async () => {
    const user = userEvent.setup()
    const { container } = renderComposer()
    const textarea = screen.getByRole('textbox', { name: 'Сообщение' })
    const attachmentControl = getSideControl(container, 'attachment')
    const emojiControl = getSideControl(container, 'emoji')
    const voiceControl = getSideControl(container, 'voice')
    const sendControl = getSideControl(container, 'send')

    expect(
      screen.getByRole('button', { name: 'Прикрепить файл' }),
    ).not.toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Голосовое сообщение' }),
    ).not.toBeDisabled()
    expect(attachmentControl).toHaveClass('w-11', 'opacity-100')
    expect(emojiControl).toHaveClass('w-11', 'opacity-100')
    expect(voiceControl).toHaveClass('w-11', 'opacity-100')
    expect(screen.getByRole('button', { name: 'Прикрепить файл' })).toHaveClass(
      'hover:text-chat-outgoing',
    )
    expect(
      screen.getByRole('button', { name: 'Голосовое сообщение' }),
    ).toHaveClass('hover:text-chat-outgoing')
    expect(sendControl).toHaveClass('w-0', 'opacity-0')

    await user.type(textarea, 'П')

    expect(
      screen.queryByRole('button', { name: 'Прикрепить файл' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Добавить эмоджи' }),
    ).not.toBeDisabled()
    expect(
      screen.queryByRole('button', { name: 'Голосовое сообщение' }),
    ).not.toBeInTheDocument()
    expect(attachmentControl).toHaveAttribute('aria-hidden', 'true')
    expect(emojiControl).not.toHaveAttribute('aria-hidden')
    expect(voiceControl).toHaveAttribute('aria-hidden', 'true')
    expect(sendControl).not.toHaveAttribute('aria-hidden')
    expect(attachmentControl).toHaveClass('w-0', 'opacity-0')
    expect(emojiControl).toHaveClass('w-11', 'opacity-100')
    expect(voiceControl).toHaveClass('w-0', 'opacity-0')
    expect(sendControl).toHaveClass('w-11', 'opacity-100')
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
    expect(screen.getByRole('button', { name: 'Отправить' })).toHaveClass(
      'bg-chat-outgoing',
    )
    expect(screen.getByRole('button', { name: 'Отправить' })).not.toBeDisabled()

    await user.clear(textarea)

    expect(
      screen.getByRole('button', { name: 'Прикрепить файл' }),
    ).not.toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Голосовое сообщение' }),
    ).not.toBeDisabled()
    expect(
      screen.queryByRole('button', { name: 'Отправить' }),
    ).not.toBeInTheDocument()
    expect(attachmentControl).not.toHaveAttribute('aria-hidden')
    expect(emojiControl).not.toHaveAttribute('aria-hidden')
    expect(voiceControl).not.toHaveAttribute('aria-hidden')
    expect(sendControl).toHaveAttribute('aria-hidden', 'true')
    expect(attachmentControl).toHaveClass('w-11', 'opacity-100')
    expect(emojiControl).toHaveClass('w-11', 'opacity-100')
    expect(voiceControl).toHaveClass('w-11', 'opacity-100')
    expect(sendControl).toHaveClass('w-0', 'opacity-0')
  })

  it('keeps idle controls visible for a whitespace-only draft', async () => {
    const user = userEvent.setup()
    const { container } = renderComposer()
    const textarea = screen.getByRole('textbox', { name: 'Сообщение' })
    const attachmentControl = getSideControl(container, 'attachment')
    const voiceControl = getSideControl(container, 'voice')
    const sendControl = getSideControl(container, 'send')

    await user.type(textarea, '   ')

    expect(
      screen.getByRole('button', { name: 'Прикрепить файл' }),
    ).not.toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Голосовое сообщение' }),
    ).not.toBeDisabled()
    expect(attachmentControl).toHaveClass('w-11', 'opacity-100')
    expect(voiceControl).toHaveClass('w-11', 'opacity-100')
    expect(sendControl).toHaveClass('w-0', 'opacity-0')
    expect(
      screen.queryByRole('button', { name: 'Отправить' }),
    ).not.toBeInTheDocument()
  })

  it('inserts emoji from the picker and closes after a quick phrase', async () => {
    const user = userEvent.setup()

    renderComposer()

    const textarea = screen.getByRole('textbox', { name: 'Сообщение' })
    const emojiButton = screen.getByRole('button', {
      name: 'Добавить эмоджи',
    })

    await user.click(emojiButton)

    expect(emojiButton).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByRole('dialog', { name: 'Выбор эмоджи' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Добавить 😀' }))

    expect(textarea).toHaveValue('😀')
    expect(
      screen.getByRole('dialog', { name: 'Выбор эмоджи' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Добавить 👍 Ок' }))

    expect(textarea).toHaveValue('😀👍 Ок')
    expect(
      screen.queryByRole('dialog', { name: 'Выбор эмоджи' }),
    ).not.toBeInTheDocument()
    expect(emojiButton).toHaveAttribute('aria-expanded', 'false')
  })

  it('hides attachment and voice controls after selecting a file caption target', async () => {
    const user = userEvent.setup()
    const { container } = renderComposer()
    const attachmentInput = screen.getByLabelText(
      'Файл вложения',
    ) as HTMLInputElement
    const attachmentControl = getSideControl(container, 'attachment')
    const voiceControl = getSideControl(container, 'voice')
    const sendControl = getSideControl(container, 'send')
    const file = new File(['invoice'], 'invoice.pdf', {
      type: 'application/pdf',
    })

    await user.upload(attachmentInput, file)

    expect(screen.getByText('invoice.pdf')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Прикрепить файл' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Голосовое сообщение' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Добавить эмоджи' }),
    ).not.toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Отправить файл' }),
    ).not.toBeDisabled()
    expect(attachmentControl).toHaveClass('w-0', 'opacity-0')
    expect(voiceControl).toHaveClass('w-0', 'opacity-0')
    expect(sendControl).toHaveClass('w-11', 'opacity-100')
  })
})
