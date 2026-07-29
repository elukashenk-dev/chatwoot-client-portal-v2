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
  MessageComposer as MessageComposerView,
  type MessageComposerReplyTarget,
} from './MessageComposer'
import type { SendAttachmentBatchInput } from './message-composer/types'
import { useAttachmentDraft } from './message-composer/useAttachmentDraft'

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

type TestMessageComposerProps = Omit<
  Parameters<typeof MessageComposerView>[0],
  'attachmentDraft'
>

function MessageComposer(props: TestMessageComposerProps) {
  const attachmentDraft = useAttachmentDraft()

  return <MessageComposerView attachmentDraft={attachmentDraft} {...props} />
}

function renderComposer(
  overrides: Partial<Parameters<typeof MessageComposer>[0]> = {},
) {
  return render(
    <MessageComposer
      disabled={false}
      errorMessage={null}
      isSending={false}
      onCancelReply={vi.fn()}
      onSend={vi.fn(async () => true)}
      onSendAttachmentBatch={vi.fn(async () => true)}
      replyTarget={null}
      {...overrides}
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

function createAttachmentSendMock(result: boolean) {
  return vi.fn<(input: SendAttachmentBatchInput) => Promise<boolean>>(
    async () => result,
  )
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
    const { container } = renderComposer()
    const textarea = screen.getByRole('textbox', { name: 'Сообщение' })
    const composerSurface = textarea.closest(
      '[data-chat-floating-surface="composer"]',
    )

    expect(textarea.closest('.rounded-chat-menu')).toBeNull()
    expect(composerSurface).not.toBeNull()
    expect(container.querySelector('[data-composer-input-row]')).toBeInstanceOf(
      HTMLElement,
    )
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
      'hover:bg-white/55',
      'hover:text-chat-outgoing/90',
      'disabled:text-slate-300',
    )
    expect(
      screen.getByRole('button', { name: 'Голосовое сообщение' }),
    ).toHaveClass(
      'text-chat-outgoing',
      'hover:bg-white/55',
      'hover:text-chat-outgoing/90',
      'disabled:text-slate-300',
    )
    expect(screen.getByRole('button', { name: 'Отправить' })).toHaveClass(
      'chat-send-control',
      'shadow-sm',
      'shadow-slate-900/10',
      'disabled:bg-slate-200/80',
      'disabled:text-white/80',
      'disabled:shadow-none',
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
      'chat-send-control',
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

  it('reports draft changes for typing sync', async () => {
    const user = userEvent.setup()
    const onDraftTypingChange = vi.fn()

    renderComposer({ onDraftTypingChange })

    await user.type(screen.getByRole('textbox', { name: 'Сообщение' }), 'Hi')

    expect(onDraftTypingChange).toHaveBeenLastCalledWith('Hi')
  })

  it('keeps browser-native text-only paste behavior', async () => {
    const user = userEvent.setup()

    renderComposer()

    const textarea = screen.getByRole('textbox', { name: 'Сообщение' })

    await user.click(textarea)
    await user.paste('Текст из буфера')

    expect(textarea).toHaveValue('Текст из буфера')
  })

  it('consumes a pasted screenshot without inserting alternate text or sending it', () => {
    const onSendAttachmentBatch = createAttachmentSendMock(true)
    const screenshot = new File(['pixels'], 'image.png', {
      type: 'image/png',
    })

    renderComposer({ onSendAttachmentBatch })

    const textarea = screen.getByRole('textbox', { name: 'Сообщение' })
    const pasteWasNotCancelled = fireEvent.paste(textarea, {
      clipboardData: {
        items: [
          {
            getAsFile: () => screenshot,
            kind: 'file',
            type: 'image/png',
          },
          {
            getAsFile: () => null,
            kind: 'string',
            type: 'text/html',
          },
          {
            getAsFile: () => null,
            kind: 'string',
            type: 'text/plain',
          },
        ],
      },
    })

    expect(pasteWasNotCancelled).toBe(false)
    expect(screen.getByText(/screenshot-\d{8}-\d{6}\.png/)).toBeInTheDocument()
    expect(textarea).toHaveValue('')
    expect(onSendAttachmentBatch).not.toHaveBeenCalled()
  })

  it('reports an empty draft after an accepted text send', async () => {
    const user = userEvent.setup()
    const onDraftTypingChange = vi.fn()

    renderComposer({ onDraftTypingChange })

    await user.type(screen.getByRole('textbox', { name: 'Сообщение' }), 'Hi')
    await user.click(screen.getByRole('button', { name: 'Отправить' }))

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Сообщение' })).toHaveValue('')
    })
    expect(onDraftTypingChange).toHaveBeenLastCalledWith('')
  })

  it('blocks too-long text sends and tells the user how much to shorten', () => {
    const onSend = vi.fn(async () => true)
    const tooLongMessage = 'а'.repeat(4005)

    render(
      <MessageComposer
        disabled={false}
        errorMessage={null}
        isSending={false}
        onCancelReply={vi.fn()}
        onSend={onSend}
        onSendAttachmentBatch={vi.fn(async () => true)}
        replyTarget={null}
      />,
    )

    const textarea = screen.getByRole('textbox', { name: 'Сообщение' })
    const sendButton = screen.getByRole('button', { name: 'Отправить' })

    fireEvent.change(textarea, { target: { value: tooLongMessage } })

    expect(textarea).toHaveValue(tooLongMessage)
    expect(textarea).toHaveAttribute('aria-invalid', 'true')
    expect(sendButton).toBeDisabled()
    expect(
      screen.getByText(
        'Сообщение слишком длинное: 4005 из 4000. Сократите на 5 символов или отправьте частями.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Сообщение слишком длинное: 4005 из 4000. Сократите на 5 символов или отправьте частями.',
      ),
    ).toHaveClass('border-rose-200/70', 'bg-rose-50/80', 'backdrop-blur-md')

    fireEvent.click(sendButton)

    expect(onSend).not.toHaveBeenCalled()
  })

  it('shows a character counter near the text message limit without blocking valid text', () => {
    const nearLimitMessage = 'а'.repeat(3800)

    renderComposer()

    const textarea = screen.getByRole('textbox', { name: 'Сообщение' })

    fireEvent.change(textarea, { target: { value: nearLimitMessage } })

    expect(screen.getByText('3800/4000')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Отправить' })).not.toBeDisabled()
    expect(textarea).not.toHaveAttribute('aria-invalid', 'true')
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
        onSendAttachmentBatch={vi.fn(async () => true)}
        replyTarget={replyTarget}
      />,
    )

    await user.type(
      screen.getByRole('textbox', { name: 'Сообщение' }),
      'Offline',
    )
    await user.click(screen.getByRole('button', { name: 'Отправить' }))

    expect(screen.getByRole('textbox', { name: 'Сообщение' })).toHaveValue(
      'Offline',
    )
    expect(screen.getByText('Предыдущее сообщение')).toBeInTheDocument()
    expect(
      screen
        .getByText('Предыдущее сообщение')
        .closest('[data-composer-panel="reply"]'),
    ).toHaveClass('border-white/65', 'bg-white/60', 'backdrop-blur-md')
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
        onSendAttachmentBatch={vi.fn(async () => true)}
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
        onSendAttachmentBatch={vi.fn(async () => true)}
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

  it('keeps selected file order, removes one item and submits one immutable batch', async () => {
    const user = userEvent.setup()
    const onSendAttachmentBatch = createAttachmentSendMock(true)
    const first = new File(['1234567890'], 'first.pdf', {
      type: 'application/pdf',
    })
    const second = new File(['12345'], 'second.txt', {
      type: 'text/plain',
    })
    const third = new File(['1234567'], 'third.txt', {
      type: 'text/plain',
    })
    const replyTarget = {
      attachmentName: null,
      authorName: 'Поддержка',
      content: 'Пришлите документы',
      direction: 'incoming',
      id: 77,
    } satisfies MessageComposerReplyTarget

    renderComposer({
      onSendAttachmentBatch,
      replyTarget,
    })

    await user.upload(screen.getByLabelText('Файл вложения'), [
      first,
      second,
      third,
    ])

    expect(screen.getByText('3/5 · 22 Б')).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Убрать файл second.txt' }),
    )

    expect(screen.getByText('2/5 · 17 Б')).toBeInTheDocument()

    await user.type(
      screen.getByRole('textbox', { name: 'Сообщение' }),
      'Подпись',
    )
    await user.click(screen.getByRole('button', { name: 'Отправить файл' }))

    expect(onSendAttachmentBatch).toHaveBeenCalledWith({
      clientMessageKey: expect.stringMatching(/^portal-send:/),
      content: 'Подпись',
      items: [
        expect.objectContaining({ file: first, source: 'picker' }),
        expect.objectContaining({ file: third, source: 'picker' }),
      ],
      replyToMessageId: 77,
    })
  })

  it('prepares a camera file without sending and preserves its source on explicit send', async () => {
    const user = userEvent.setup()
    const onSendAttachmentBatch = createAttachmentSendMock(true)
    const photo = new File(['photo'], 'camera.jpg', {
      type: 'image/jpeg',
    })

    renderComposer({ onSendAttachmentBatch })

    await user.upload(screen.getByLabelText('Камера'), photo)

    expect(screen.getByText('camera.jpg')).toBeInTheDocument()
    expect(onSendAttachmentBatch).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Отправить файл' }))

    expect(onSendAttachmentBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [expect.objectContaining({ file: photo, source: 'camera' })],
      }),
    )
  })

  it('reuses one client message key while an unchanged batch retry fails', async () => {
    const user = userEvent.setup()
    const onSendAttachmentBatch = createAttachmentSendMock(false)
    const file = new File(['invoice'], 'invoice.pdf', {
      type: 'application/pdf',
    })

    renderComposer({ onSendAttachmentBatch })

    await user.upload(screen.getByLabelText('Файл вложения'), file)
    await user.click(screen.getByRole('button', { name: 'Отправить файл' }))
    await user.click(screen.getByRole('button', { name: 'Отправить файл' }))

    expect(onSendAttachmentBatch).toHaveBeenCalledTimes(2)
    expect(onSendAttachmentBatch.mock.calls[1]?.[0].clientMessageKey).toBe(
      onSendAttachmentBatch.mock.calls[0]?.[0].clientMessageKey,
    )
  })

  it('creates a new client message key after removing and re-adding a file', async () => {
    const user = userEvent.setup()
    const onSendAttachmentBatch = createAttachmentSendMock(false)
    const file = new File(['invoice'], 'invoice.pdf', {
      type: 'application/pdf',
    })

    renderComposer({ onSendAttachmentBatch })

    await user.upload(screen.getByLabelText('Файл вложения'), file)
    await user.click(screen.getByRole('button', { name: 'Отправить файл' }))
    await user.click(
      screen.getByRole('button', { name: 'Убрать файл invoice.pdf' }),
    )
    await user.upload(screen.getByLabelText('Файл вложения'), file)
    await user.click(screen.getByRole('button', { name: 'Отправить файл' }))

    expect(onSendAttachmentBatch.mock.calls[1]?.[0].clientMessageKey).not.toBe(
      onSendAttachmentBatch.mock.calls[0]?.[0].clientMessageKey,
    )
  })

  it('creates a new client message key after selecting the files in a new order', async () => {
    const user = userEvent.setup()
    const onSendAttachmentBatch = createAttachmentSendMock(false)
    const first = new File(['first'], 'first.pdf', {
      type: 'application/pdf',
    })
    const second = new File(['second'], 'second.txt', {
      type: 'text/plain',
    })

    renderComposer({ onSendAttachmentBatch })

    await user.upload(screen.getByLabelText('Файл вложения'), [first, second])
    await user.click(screen.getByRole('button', { name: 'Отправить файл' }))
    await user.click(screen.getByRole('button', { name: 'Очистить файлы' }))
    await user.upload(screen.getByLabelText('Файл вложения'), [second, first])
    await user.click(screen.getByRole('button', { name: 'Отправить файл' }))

    expect(onSendAttachmentBatch.mock.calls[1]?.[0].clientMessageKey).not.toBe(
      onSendAttachmentBatch.mock.calls[0]?.[0].clientMessageKey,
    )
  })

  it('creates a new client message key after changing the caption', async () => {
    const user = userEvent.setup()
    const onSendAttachmentBatch = createAttachmentSendMock(false)
    const file = new File(['invoice'], 'invoice.pdf', {
      type: 'application/pdf',
    })

    renderComposer({ onSendAttachmentBatch })

    await user.upload(screen.getByLabelText('Файл вложения'), file)
    await user.click(screen.getByRole('button', { name: 'Отправить файл' }))
    await user.type(
      screen.getByRole('textbox', { name: 'Сообщение' }),
      'Новая подпись',
    )
    await user.click(screen.getByRole('button', { name: 'Отправить файл' }))

    expect(onSendAttachmentBatch.mock.calls[1]?.[0].clientMessageKey).not.toBe(
      onSendAttachmentBatch.mock.calls[0]?.[0].clientMessageKey,
    )
  })

  it('creates a new client message key after cancelling the reply target', async () => {
    const user = userEvent.setup()
    const onCancelReply = vi.fn()
    const onSendAttachmentBatch = createAttachmentSendMock(false)
    const file = new File(['invoice'], 'invoice.pdf', {
      type: 'application/pdf',
    })

    const { rerender } = render(
      <MessageComposer
        disabled={false}
        errorMessage={null}
        isSending={false}
        onCancelReply={onCancelReply}
        onSend={vi.fn(async () => true)}
        onSendAttachmentBatch={onSendAttachmentBatch}
        replyTarget={{
          authorName: 'Поддержка',
          content: 'Ответьте сюда',
          direction: 'incoming',
          id: 77,
        }}
      />,
    )

    await user.upload(screen.getByLabelText('Файл вложения'), file)
    await user.click(screen.getByRole('button', { name: 'Отправить файл' }))
    await user.click(screen.getByRole('button', { name: 'Отменить ответ' }))

    rerender(
      <MessageComposer
        disabled={false}
        errorMessage={null}
        isSending={false}
        onCancelReply={onCancelReply}
        onSend={vi.fn(async () => true)}
        onSendAttachmentBatch={onSendAttachmentBatch}
        replyTarget={null}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Отправить файл' }))

    expect(onSendAttachmentBatch.mock.calls[1]?.[0].clientMessageKey).not.toBe(
      onSendAttachmentBatch.mock.calls[0]?.[0].clientMessageKey,
    )
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
        onSendAttachmentBatch={onSendAttachment}
        replyTarget={null}
      />,
    )

    await user.upload(screen.getByLabelText('Файл вложения'), attachment)
    expect(screen.getByText('invoice.pdf')).toBeInTheDocument()
    expect(
      screen
        .getByText('invoice.pdf')
        .closest('[data-composer-panel="attachments"]'),
    ).toHaveClass('border-white/65', 'bg-white/60', 'backdrop-blur-md')

    rerender(
      <MessageComposer
        attachmentDisabled
        disabled={false}
        errorMessage={null}
        isSending={false}
        onCancelReply={vi.fn()}
        onSend={vi.fn(async () => true)}
        onSendAttachmentBatch={onSendAttachment}
        replyTarget={null}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Отправить файл' }))

    expect(onSendAttachment).not.toHaveBeenCalled()
    expect(screen.getByText('invoice.pdf')).toBeInTheDocument()
    expect(
      screen
        .getByText('invoice.pdf')
        .closest('[data-composer-panel="attachments"]'),
    ).toHaveClass('border-white/65', 'bg-white/60', 'backdrop-blur-md')
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
        onSendAttachmentBatch={onSendAttachment}
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
        onSendAttachmentBatch={onSendAttachment}
        replyTarget={replyTarget}
        voiceDisabled
      />,
    )

    await user.click(
      screen.getByRole('button', { name: 'Отправить голосовое' }),
    )

    expect(onSendAttachment).not.toHaveBeenCalled()
    expect(screen.getByText('Голосом нельзя без сети')).toBeInTheDocument()
    expect(
      screen.getByText('Запись 00:00').closest('[data-composer-panel="voice"]'),
    ).toHaveClass('border-white/65', 'bg-white/60', 'backdrop-blur-md')
  })

  it('keeps a failed voice file and reuses its key for an unchanged retry', async () => {
    const user = userEvent.setup()
    const onSendAttachmentBatch = createAttachmentSendMock(false)
    const voiceFile = new File(['voice'], 'voice.webm', {
      lastModified: 1_777_000_000_000,
      type: 'audio/webm',
    })
    const props = {
      disabled: false,
      errorMessage: null,
      isSending: false,
      onCancelReply: vi.fn(),
      onSend: vi.fn(async () => true),
      onSendAttachmentBatch,
      replyTarget: null,
    }

    voiceRecorderState.status = 'recording'
    voiceRecorderState.finishVoiceRecording.mockImplementation(() => {
      void voiceRecorderState.lastOptions?.onSendVoiceAttachment(voiceFile)
    })

    const { rerender } = render(<MessageComposer {...props} />)

    await user.click(
      screen.getByRole('button', { name: 'Отправить голосовое' }),
    )
    await waitFor(() => {
      expect(onSendAttachmentBatch).toHaveBeenCalledTimes(1)
    })

    voiceRecorderState.status = 'idle'
    rerender(<MessageComposer {...props} />)

    expect(screen.getByText('voice.webm')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Отправить файл' }))

    expect(onSendAttachmentBatch).toHaveBeenCalledTimes(2)
    expect(onSendAttachmentBatch.mock.calls[1]?.[0].clientMessageKey).toBe(
      onSendAttachmentBatch.mock.calls[0]?.[0].clientMessageKey,
    )
  })

  it('rejects an invalid voice file locally before the batch send callback', async () => {
    const user = userEvent.setup()
    const onSendAttachmentBatch = createAttachmentSendMock(true)

    voiceRecorderState.status = 'recording'
    voiceRecorderState.finishVoiceRecording.mockImplementation(() => {
      void voiceRecorderState.lastOptions?.onSendVoiceAttachment(
        new File([], 'voice.webm', { type: 'audio/webm' }),
      )
    })

    renderComposer({ onSendAttachmentBatch })

    await user.click(
      screen.getByRole('button', { name: 'Отправить голосовое' }),
    )

    expect(
      await screen.findByText('Файл «voice.webm» пустой.'),
    ).toBeInTheDocument()
    expect(onSendAttachmentBatch).not.toHaveBeenCalled()
  })
})
