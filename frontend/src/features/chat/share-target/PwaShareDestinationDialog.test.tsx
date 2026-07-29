import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { OfflinePendingShareDraftRecord } from '../../offline/types'
import type { PwaShareTargetController } from './usePwaShareTargetDraft'
import { PwaShareDestinationDialog } from './PwaShareDestinationDialog'

const privateThread = {
  id: 'private:me' as const,
  subtitle: 'Вы и поддержка',
  title: 'Личный чат',
  type: 'private' as const,
  unreadCount: 0,
}
const groupThread = {
  id: 'group:17' as const,
  subtitle: '3 участника',
  title: 'Бухгалтерия',
  type: 'group' as const,
  unreadCount: 0,
}
const pendingDraft = {
  createdAt: '2026-07-29T10:00:00.000Z',
  draftId: 'draft-123',
  expiresAt: '2099-07-29T10:15:00.000Z',
  files: [
    {
      blob: new Blob(['screen'], { type: 'image/png' }),
      fileName: 'screenshot.png',
      lastModified: 1_800_000_000_000,
      mimeType: 'image/png',
    },
  ],
  host: 'localhost',
  tenantSlug: 'buhfirma',
  userId: 7,
} satisfies OfflinePendingShareDraftRecord

function createController(
  overrides: Partial<PwaShareTargetController> = {},
): PwaShareTargetController {
  return {
    afterCanonicalAttachmentBatchSend: vi.fn(async () => {}),
    cancelShareDraft: vi.fn(async () => {}),
    confirmDestination: vi.fn(async () => {}),
    errorMessage: null,
    pendingDraft,
    selectedDestinationThreadId: privateThread.id,
    setSelectedDestinationThreadId: vi.fn(),
    status: 'choosing-destination',
    syncRemainingShareDraftItems: vi.fn(async () => {}),
    ...overrides,
  }
}

describe('PwaShareDestinationDialog', () => {
  it('requires visible confirmation even when only one chat is available', async () => {
    const user = userEvent.setup()
    const controller = createController()

    render(
      <PwaShareDestinationDialog
        controller={controller}
        threads={[privateThread]}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Куда добавить файлы?' }),
    ).toBeInTheDocument()
    expect(screen.getByText('screenshot.png')).toBeInTheDocument()
    expect(
      screen.getByRole('radio', { name: /Личный чат/ }),
    ).toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Продолжить' }))

    expect(controller.confirmDestination).toHaveBeenCalledWith(
      privateThread.id,
    )
  })

  it('requires an explicit choice when several chats are available', async () => {
    const user = userEvent.setup()
    const controller = createController({
      selectedDestinationThreadId: null,
    })
    const { rerender } = render(
      <PwaShareDestinationDialog
        controller={controller}
        threads={[privateThread, groupThread]}
      />,
    )

    expect(screen.getByRole('button', { name: 'Продолжить' })).toBeDisabled()

    await user.click(screen.getByRole('radio', { name: /Бухгалтерия/ }))
    expect(controller.setSelectedDestinationThreadId).toHaveBeenCalledWith(
      groupThread.id,
    )

    rerender(
      <PwaShareDestinationDialog
        controller={createController({
          confirmDestination: controller.confirmDestination,
          selectedDestinationThreadId: groupThread.id,
        })}
        threads={[privateThread, groupThread]}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Продолжить' }))
    expect(controller.confirmDestination).toHaveBeenCalledWith(groupThread.id)
  })

  it('cancels without sending anything', async () => {
    const user = userEvent.setup()
    const controller = createController()

    render(
      <PwaShareDestinationDialog
        controller={controller}
        threads={[privateThread]}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Отменить' }))

    expect(controller.cancelShareDraft).toHaveBeenCalledTimes(1)
    expect(controller.confirmDestination).not.toHaveBeenCalled()
  })
})
