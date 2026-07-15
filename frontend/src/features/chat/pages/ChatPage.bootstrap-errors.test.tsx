import { screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  renderChatRoute,
  setupOfflineChatTestEnvironment,
} from '../../../test/chatPageTestHarness'

const CHAT_PAGE_LOAD_TIMEOUT = {
  timeout: 5000,
}

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  })
}

function createAuthenticatedUserResponse() {
  return createJsonResponse({
    session: {
      expiresAt: '2026-06-10T10:00:00.000Z',
    },
    user: {
      email: 'name@group.ru',
      fullName: 'Portal User',
      id: 7,
    },
  })
}

describe('ChatPage bootstrap errors', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(async () => {
    await setupOfflineChatTestEnvironment()
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    fetchMock.mockReset()
  })

  it('does not fallback to a group thread after backend rejects person contact authority', async () => {
    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(
        createJsonResponse(
          {
            error: {
              code: 'portal_contact_disabled',
              message:
                'Доступ к порталу настроен некорректно. Обратитесь в поддержку.',
            },
          },
          403,
        ),
      )

    renderChatRoute()

    expect(
      await screen.findByRole(
        'heading',
        { name: 'Чат не подключён' },
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Настройка профиля клиента не завершена. Обратитесь в поддержку.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Повторить' }),
    ).not.toBeInTheDocument()
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/chat/threads',
      expect.objectContaining({
        credentials: 'include',
        method: 'GET',
      }),
    )
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes('/chat/messages'),
      ),
    ).toBe(false)
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes('group%3A')),
    ).toBe(false)
  })

  it('keeps an upstream chat bootstrap failure retryable', async () => {
    fetchMock
      .mockResolvedValueOnce(createAuthenticatedUserResponse())
      .mockResolvedValueOnce(
        createJsonResponse(
          {
            error: {
              code: 'chatwoot_unavailable',
              message: 'Сервис поддержки временно недоступен.',
            },
          },
          503,
        ),
      )

    renderChatRoute()

    expect(
      await screen.findByRole(
        'heading',
        { name: 'Чат временно недоступен' },
        CHAT_PAGE_LOAD_TIMEOUT,
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Мы не смогли получить состояние переписки из сервиса поддержки. Попробуйте обновить чат немного позже.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Повторить' }),
    ).toBeInTheDocument()
  })
})
