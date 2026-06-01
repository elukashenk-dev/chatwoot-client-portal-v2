import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  MessageComposer,
  type MessageComposerReplyTarget,
} from './MessageComposer'

const voiceRecorderState = vi.hoisted(() => ({
  cancelVoiceRecording: vi.fn(),
  clearErrorMessage: vi.fn(),
  errorMessage: null as string | null,
  finishVoiceRecording: vi.fn(),
  lastOptions: null as null | {
    canStartRecording: boolean
    onSendVoiceAttachment: (file: File) => Promise<boolean>
  },
  recordingElapsedMs: 0,
  startVoiceRecording: vi.fn(),
  status: 'idle',
}))

vi.mock('./message-composer/useVoiceRecorder', () => ({
  useVoiceRecorder: vi.fn(
    (options: {
      canStartRecording: boolean
      onSendVoiceAttachment: (file: File) => Promise<boolean>
    }) => {
      voiceRecorderState.lastOptions = options

      return {
        cancelVoiceRecording: voiceRecorderState.cancelVoiceRecording,
        clearErrorMessage: voiceRecorderState.clearErrorMessage,
        errorMessage: voiceRecorderState.errorMessage,
        finishVoiceRecording: voiceRecorderState.finishVoiceRecording,
        recordingElapsedMs: voiceRecorderState.recordingElapsedMs,
        startVoiceRecording: voiceRecorderState.startVoiceRecording,
        status: voiceRecorderState.status,
      }
    },
  ),
}))

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

function createDeferredValue<TValue>() {
  let resolveValue!: (value: TValue) => void
  const promise = new Promise<TValue>((resolve) => {
    resolveValue = resolve
  })

  return {
    promise,
    resolve: resolveValue,
  }
}

describe('MessageComposer', () => {
  afterEach(() => {
    voiceRecorderState.cancelVoiceRecording.mockReset()
    voiceRecorderState.clearErrorMessage.mockReset()
    voiceRecorderState.errorMessage = null
    voiceRecorderState.finishVoiceRecording.mockReset()
    voiceRecorderState.lastOptions = null
    voiceRecorderState.recordingElapsedMs = 0
    voiceRecorderState.startVoiceRecording.mockReset()
    voiceRecorderState.status = 'idle'
  })

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
      'text-chat-outgoing',
      'hover:text-chat-outgoing/80',
      'disabled:text-slate-300',
    )
    expect(
      screen.getByRole('button', { name: 'Голосовое сообщение' }),
    ).toHaveClass(
      'text-chat-outgoing',
      'hover:text-chat-outgoing/80',
      'disabled:text-slate-300',
    )
    expect(screen.getByRole('button', { name: 'Отправить' })).toHaveClass(
      'bg-chat-outgoing',
    )
    expect(screen.getByRole('button', { name: 'Отправить' })).toHaveClass(
      'disabled:bg-slate-200',
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
      'bg-chat-outgoing',
    )
    expect(screen.getByRole('button', { name: 'Отправить' })).toHaveClass(
      'text-white',
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

  it('keeps draft and reply target when text outbox write fails', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn(async () => false)
    const onCancelReply = vi.fn()
    const replyTarget = {
      attachmentName: null,
      authorName: 'Поддержка',
      content: 'Предыдущее сообщение',
      direction: 'incoming',
      id: 77,
    } satisfies MessageComposerReplyTarget

    render(
      <MessageComposer
        disabled={false}
        errorMessage="Не удалось сохранить сообщение на этом устройстве."
        isSending={false}
        onCancelReply={onCancelReply}
        onSend={onSend}
        onSendAttachment={vi.fn(async () => true)}
        replyTarget={replyTarget}
      />,
    )

    await user.type(screen.getByRole('textbox', { name: 'Сообщение' }), 'Offline')
    await user.click(screen.getByRole('button', { name: 'Отправить' }))

    expect(screen.getByRole('textbox', { name: 'Сообщение' })).toHaveValue(
      'Offline',
    )
    expect(screen.getByText('Предыдущее сообщение')).toBeInTheDocument()
    expect(onCancelReply).not.toHaveBeenCalled()
  })

  it('prevents duplicate text submits while text acceptance is pending', async () => {
    const user = userEvent.setup()
    const sendAcceptance = createDeferredValue<boolean>()
    const onSend = vi.fn(() => sendAcceptance.promise)

    render(
      <MessageComposer
        disabled={false}
        errorMessage={null}
        isSending={false}
        onCancelReply={vi.fn()}
        onSend={onSend}
        onSendAttachment={vi.fn(async () => true)}
        replyTarget={null}
      />,
    )

    const textarea = screen.getByRole('textbox', { name: 'Сообщение' })
    const sendButton = screen.getByRole('button', { name: 'Отправить' })

    await user.type(textarea, 'Slow write')
    await user.click(sendButton)

    await waitFor(() => {
      expect(sendButton).toBeDisabled()
    })
    await user.click(sendButton)
    expect(onSend).toHaveBeenCalledTimes(1)

    sendAcceptance.resolve(true)

    await waitFor(() => {
      expect(textarea).toHaveValue('')
    })
  })

  it('prevents the send button pointer press from stealing textarea focus', async () => {
    const user = userEvent.setup()

    renderComposer()

    const textarea = screen.getByRole('textbox', { name: 'Сообщение' })
    const sendButton = screen.getByRole('button', { name: 'Отправить' })

    await user.type(textarea, 'Не закрывай клавиатуру')
    expect(textarea).toHaveFocus()

    const wasNotCancelled = fireEvent.pointerDown(sendButton, {
      pointerType: 'touch',
    })

    expect(wasNotCancelled).toBe(false)
    expect(textarea).toHaveFocus()
  })

  it('submits from guarded touch end when mobile Safari suppresses click', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn(async () => true)

    render(
      <MessageComposer
        disabled={false}
        errorMessage={null}
        isSending={false}
        onCancelReply={vi.fn()}
        onSend={onSend}
        onSendAttachment={vi.fn(async () => true)}
        replyTarget={null}
      />,
    )

    const textarea = screen.getByRole('textbox', { name: 'Сообщение' })
    const sendButton = screen.getByRole('button', { name: 'Отправить' })

    await user.type(textarea, 'iPhone keyboard')
    expect(textarea).toHaveFocus()

    const touchStartWasNotCancelled = fireEvent(
      sendButton,
      new Event('touchstart', { bubbles: true, cancelable: true }),
    )
    const touchEndWasNotCancelled = fireEvent(
      sendButton,
      new Event('touchend', { bubbles: true, cancelable: true }),
    )

    expect(touchStartWasNotCancelled).toBe(false)
    expect(touchEndWasNotCancelled).toBe(false)
    await waitFor(() => {
      expect(onSend).toHaveBeenCalledTimes(1)
    })
    expect(textarea).toHaveFocus()
  })

  it('does not submit an already selected attachment after attachment send is disabled', async () => {
    const user = userEvent.setup()
    const onSendAttachment = vi.fn(async () => true)
    const attachment = new File(['invoice'], 'invoice.pdf', {
      type: 'application/pdf',
    })

    const { rerender } = render(
      <MessageComposer
        attachmentDisabled={false}
        disabled={false}
        errorMessage={null}
        isSending={false}
        onCancelReply={vi.fn()}
        onSend={vi.fn(async () => true)}
        onSendAttachment={onSendAttachment}
        replyTarget={null}
      />,
    )

    await user.upload(screen.getByLabelText('Файл вложения'), attachment)
    expect(screen.getByText('invoice.pdf')).toBeInTheDocument()

    rerender(
      <MessageComposer
        attachmentDisabled
        disabled={false}
        errorMessage={null}
        isSending={false}
        onCancelReply={vi.fn()}
        onSend={vi.fn(async () => true)}
        onSendAttachment={onSendAttachment}
        replyTarget={null}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Отправить файл' }))

    expect(onSendAttachment).not.toHaveBeenCalled()
    expect(screen.getByText('invoice.pdf')).toBeInTheDocument()
  })

  it('does not submit a pending voice recording after voice send is disabled', async () => {
    const user = userEvent.setup()
    const onSendAttachment = vi.fn(async () => true)
    const replyTarget = {
      attachmentName: null,
      authorName: 'Поддержка',
      content: 'Голосом нельзя без сети',
      direction: 'incoming',
      id: 88,
    } satisfies MessageComposerReplyTarget

    voiceRecorderState.status = 'recording'
    voiceRecorderState.finishVoiceRecording.mockImplementation(() => {
      void voiceRecorderState.lastOptions?.onSendVoiceAttachment(
        new File(['voice'], 'voice.webm', { type: 'audio/webm' }),
      )
    })

    const { rerender } = render(
      <MessageComposer
        disabled={false}
        errorMessage={null}
        isSending={false}
        onCancelReply={vi.fn()}
        onSend={vi.fn(async () => true)}
        onSendAttachment={onSendAttachment}
        replyTarget={replyTarget}
        voiceDisabled={false}
      />,
    )

    rerender(
      <MessageComposer
        disabled={false}
        errorMessage={null}
        isSending={false}
        onCancelReply={vi.fn()}
        onSend={vi.fn(async () => true)}
        onSendAttachment={onSendAttachment}
        replyTarget={replyTarget}
        voiceDisabled
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Отправить голосовое' }))

    expect(onSendAttachment).not.toHaveBeenCalled()
    expect(screen.getByText('Голосом нельзя без сети')).toBeInTheDocument()
  })
})
