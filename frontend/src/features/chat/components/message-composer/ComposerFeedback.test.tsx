import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AttachmentTransferState } from '../../api/chatAttachmentTransport'
import { ComposerFeedback } from './ComposerFeedback'

function renderFeedback(
  attachmentTransferState: AttachmentTransferState,
  onCancelAttachmentUpload = vi.fn(),
) {
  const view = render(
    <ComposerFeedback
      attachmentTransferState={attachmentTransferState}
      errorMessage={null}
      normalizedDraftLength={0}
      onCancelAttachmentUpload={onCancelAttachmentUpload}
      shouldShowTextLengthCounter={false}
      textLengthErrorMessage={null}
    />,
  )

  return {
    ...view,
    onCancelAttachmentUpload,
    rerenderTransferState: (nextState: AttachmentTransferState) => {
      view.rerender(
        <ComposerFeedback
          attachmentTransferState={nextState}
          errorMessage={null}
          normalizedDraftLength={0}
          onCancelAttachmentUpload={onCancelAttachmentUpload}
          shouldShowTextLengthCounter={false}
          textLengthErrorMessage={null}
        />,
      )
    },
  }
}

describe('ComposerFeedback', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('offers cancellation only while the request body is uploading', () => {
    const { onCancelAttachmentUpload, rerenderTransferState } = renderFeedback({
      percent: 42,
      stage: 'uploading',
    })

    screen.getByRole('button', { name: 'Отменить загрузку' }).click()
    expect(onCancelAttachmentUpload).toHaveBeenCalledTimes(1)

    rerenderTransferState({ percent: 100, stage: 'sending' })

    expect(screen.getByText('Отправка')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Отменить загрузку' }),
    ).not.toBeInTheDocument()
  })

  it('keeps visual progress current while throttling live announcements', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-29T12:00:00.000Z'))
    const { rerenderTransferState } = renderFeedback({
      percent: 10,
      stage: 'uploading',
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    rerenderTransferState({ percent: 20, stage: 'uploading' })

    expect(screen.getByText('Загрузка 20%')).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('Загрузка 10%')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(750)
    })

    expect(screen.getByRole('status')).toHaveTextContent('Загрузка 20%')
  })
})
