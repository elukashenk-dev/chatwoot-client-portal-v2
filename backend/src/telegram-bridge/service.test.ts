import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ResolvedTelegramBridgeConfig } from './configRepository.js'
import { createTelegramBridgeService } from './service.js'
import type { TelegramMessage, TelegramUpdate } from './types.js'

const bridgeConfig = {
  chatwoot: {
    accountId: 101,
    apiAccessToken: 'tenant-a-chatwoot-token',
    baseUrl: 'https://tenant-a.chatwoot.example.test',
  },
  chatwootTelegramInboxId: 17,
  displayName: 'Tenant A support',
  id: 'bridge-config-1',
  publicKey: 'tenant-a-support',
  telegram: {
    botToken: '1234567890:AAExampleTelegramBotTokenSecretValue',
    secretToken: 'tenant-a-header-secret',
    webhookPathSecret: 'tenant-a-path-secret',
  },
  telegramBotId: '1234567890',
  telegramBotUsername: 'tenant_a_support_bot',
  tenantId: 11,
} satisfies ResolvedTelegramBridgeConfig

type TelegramMessageOverrides = Omit<
  Partial<TelegramMessage>,
  'caption' | 'contact' | 'text'
> & {
  caption?: string | undefined
  contact?: TelegramMessage['contact'] | undefined
  text?: string | undefined
}

function applyMessageOverrides(
  message: TelegramMessage,
  overrides: TelegramMessageOverrides,
) {
  const updatedMessage: Record<string, unknown> = {
    ...message,
    ...overrides,
  }

  for (const key of ['caption', 'contact', 'text'] as const) {
    if (key in overrides && overrides[key] === undefined) {
      delete updatedMessage[key]
    }
  }

  return updatedMessage as TelegramMessage
}

function privateTextUpdate(
  updateId = 1001,
  overrides: TelegramMessageOverrides = {},
): TelegramUpdate {
  return {
    message: applyMessageOverrides({
      chat: {
        first_name: 'Ivan',
        id: 77,
        type: 'private',
      },
      date: 1_700_000_000,
      from: {
        first_name: 'Ivan',
        id: 77,
        is_bot: false,
      },
      message_id: 5,
      text: 'hello',
    }, overrides),
    update_id: updateId,
  }
}

function privateAttachmentUpdate(updateId = 1001): TelegramUpdate {
  return privateTextUpdate(updateId, {
    photo: [
      {
        file_id: 'file-id',
      },
    ],
    text: undefined,
  })
}

function privateContactUpdate({
  phoneNumber = '89161234567',
  updateId = 1001,
  userId = 77,
}: {
  phoneNumber?: string
  updateId?: number
  userId?: number
} = {}): TelegramUpdate {
  return privateTextUpdate(updateId, {
    contact: {
      first_name: 'Ivan',
      phone_number: phoneNumber,
      user_id: userId,
    },
    text: undefined,
  })
}

function groupTextUpdate(updateId = 1001): TelegramUpdate {
  return {
    message: {
      chat: {
        id: -100123,
        title: 'Support Group',
        type: 'supergroup',
      },
      date: 1_700_000_000,
      from: {
        first_name: 'Ivan',
        id: 88,
        is_bot: false,
        last_name: 'Petrov',
      },
      message_id: 9,
      text: 'group hello',
    },
    update_id: updateId,
  }
}

function createDependencies() {
  const configRepository = {
    findActiveBridgeConfigByPublicKey: vi.fn().mockResolvedValue({
      config: bridgeConfig,
      outcome: 'found',
    }),
  }
  const dedupeRepository = {
    markUpdateFailed: vi.fn(),
    markUpdateProcessed: vi.fn(),
    startUpdateProcessing: vi.fn().mockResolvedValue({
      delivery: {
        attemptCount: 1,
      },
      outcome: 'acquired',
    }),
  }
  const chatwootClient = {
    createContactInbox: vi.fn(),
    findContactInboxBySourceId: vi.fn(),
    findSingleContactByPhone: vi.fn(),
    forwardTelegramUpdateToChatwoot: vi.fn(),
  }
  const telegramClient = {
    sendPhoneLinked: vi.fn(),
    sendPhoneNotFound: vi.fn(),
    sendPhonePrompt: vi.fn(),
  }
  const createChatwootClient = vi.fn(() => chatwootClient)
  const createTelegramClient = vi.fn(() => telegramClient)
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
  }

  const service = createTelegramBridgeService({
    configRepository,
    createChatwootClient,
    createTelegramClient,
    dedupeRepository,
    logger,
    now: () => new Date('2026-06-24T12:00:00.000Z'),
    staleProcessingMs: 10 * 60 * 1000,
  })

  return {
    chatwootClient,
    configRepository,
    createChatwootClient,
    createTelegramClient,
    dedupeRepository,
    logger,
    service,
    telegramClient,
  }
}

function createDependenciesWithTexts() {
  const dependencies = createDependencies()
  const service = createTelegramBridgeService({
    configRepository: dependencies.configRepository,
    createChatwootClient: dependencies.createChatwootClient,
    createTelegramClient: dependencies.createTelegramClient,
    dedupeRepository: dependencies.dedupeRepository,
    logger: dependencies.logger,
    now: () => new Date('2026-06-24T12:00:00.000Z'),
    staleProcessingMs: 10 * 60 * 1000,
    texts: {
      phoneLinked: 'CUSTOM LINKED',
      phoneNotFound: 'CUSTOM NOT FOUND',
      phonePrompt: 'CUSTOM PROMPT',
    },
  })

  return {
    ...dependencies,
    service,
  }
}

describe('createTelegramBridgeService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ignores an unknown bridge key before dedupe or Chatwoot access', async () => {
    const dependencies = createDependencies()
    dependencies.configRepository.findActiveBridgeConfigByPublicKey
      .mockResolvedValueOnce({
        outcome: 'not_found',
      })

    await expect(
      dependencies.service.handleTelegramUpdate({
        bridgeKey: 'unknown',
        telegramSecretToken: 'tenant-a-header-secret',
        update: privateTextUpdate(),
        webhookPathSecret: 'tenant-a-path-secret',
      }),
    ).resolves.toEqual({
      kind: 'ignored',
      reason: 'unauthorized',
    })

    expect(
      dependencies.configRepository.findActiveBridgeConfigByPublicKey,
    ).toHaveBeenCalledWith({
      publicKey: 'unknown',
      webhookPathSecret: 'tenant-a-path-secret',
    })
    expect(dependencies.dedupeRepository.startUpdateProcessing).not.toHaveBeenCalled()
    expect(dependencies.createChatwootClient).not.toHaveBeenCalled()
    expect(dependencies.createTelegramClient).not.toHaveBeenCalled()
  })

  it('ignores a wrong path secret, inactive config and wrong Telegram secret before dedupe', async () => {
    const dependencies = createDependencies()

    dependencies.configRepository.findActiveBridgeConfigByPublicKey
      .mockResolvedValueOnce({
        outcome: 'wrong_path_secret',
      })
      .mockResolvedValueOnce({
        outcome: 'inactive_config',
      })
      .mockResolvedValueOnce({
        config: bridgeConfig,
        outcome: 'found',
      })

    await expect(
      dependencies.service.handleTelegramUpdate({
        bridgeKey: 'tenant-a-support',
        telegramSecretToken: 'tenant-a-header-secret',
        update: privateTextUpdate(1002),
        webhookPathSecret: 'wrong-secret',
      }),
    ).resolves.toEqual({
      kind: 'ignored',
      reason: 'unauthorized',
    })

    await expect(
      dependencies.service.handleTelegramUpdate({
        bridgeKey: 'tenant-a-support',
        telegramSecretToken: 'tenant-a-header-secret',
        update: privateTextUpdate(1003),
        webhookPathSecret: 'tenant-a-path-secret',
      }),
    ).resolves.toEqual({
      kind: 'ignored',
      reason: 'disabled',
    })

    await expect(
      dependencies.service.handleTelegramUpdate({
        bridgeKey: 'tenant-a-support',
        telegramSecretToken: 'wrong-header-secret',
        update: privateTextUpdate(1004),
        webhookPathSecret: 'tenant-a-path-secret',
      }),
    ).resolves.toEqual({
      kind: 'ignored',
      reason: 'forbidden',
    })

    expect(dependencies.dedupeRepository.startUpdateProcessing).not.toHaveBeenCalled()
    expect(dependencies.createChatwootClient).not.toHaveBeenCalled()
    expect(dependencies.createTelegramClient).not.toHaveBeenCalled()
  })

  it('returns duplicate for already processed updates without forwarding', async () => {
    const dependencies = createDependencies()
    dependencies.dedupeRepository.startUpdateProcessing.mockResolvedValueOnce({
      delivery: {
        attemptCount: 1,
      },
      outcome: 'processed',
    })

    await expect(
      dependencies.service.handleTelegramUpdate({
        bridgeKey: 'tenant-a-support',
        telegramSecretToken: 'tenant-a-header-secret',
        update: privateTextUpdate(1005),
        webhookPathSecret: 'tenant-a-path-secret',
      }),
    ).resolves.toEqual({
      kind: 'duplicate',
    })

    expect(dependencies.dedupeRepository.startUpdateProcessing).toHaveBeenCalledWith({
      bridgeConfigId: 'bridge-config-1',
      now: new Date('2026-06-24T12:00:00.000Z'),
      staleProcessingBefore: new Date('2026-06-24T11:50:00.000Z'),
      telegramChatId: '77',
      telegramFromId: '77',
      updateId: 1005,
    })
    expect(dependencies.chatwootClient.forwardTelegramUpdateToChatwoot).not.toHaveBeenCalled()
    expect(dependencies.dedupeRepository.markUpdateProcessed).not.toHaveBeenCalled()
  })

  it('returns retryable 503 for duplicate recent processing updates without forwarding', async () => {
    const dependencies = createDependencies()
    dependencies.dedupeRepository.startUpdateProcessing.mockResolvedValueOnce({
      delivery: {
        attemptCount: 1,
      },
      outcome: 'in_progress',
    })

    await expect(
      dependencies.service.handleTelegramUpdate({
        bridgeKey: 'tenant-a-support',
        telegramSecretToken: 'tenant-a-header-secret',
        update: privateTextUpdate(1006),
        webhookPathSecret: 'tenant-a-path-secret',
      }),
    ).resolves.toEqual({
      kind: 'retryable_failure',
      reason: 'update_in_progress',
      statusCode: 503,
    })

    expect(dependencies.chatwootClient.forwardTelegramUpdateToChatwoot).not.toHaveBeenCalled()
    expect(dependencies.dedupeRepository.markUpdateProcessed).not.toHaveBeenCalled()
  })

  it('asks unknown private text and attachment senders for their phone without forwarding', async () => {
    const dependencies = createDependencies()
    dependencies.chatwootClient.findContactInboxBySourceId.mockResolvedValue(null)

    await expect(
      dependencies.service.handleTelegramUpdate({
        bridgeKey: 'tenant-a-support',
        telegramSecretToken: 'tenant-a-header-secret',
        update: privateTextUpdate(1007),
        webhookPathSecret: 'tenant-a-path-secret',
      }),
    ).resolves.toEqual({
      kind: 'accepted',
    })

    await expect(
      dependencies.service.handleTelegramUpdate({
        bridgeKey: 'tenant-a-support',
        telegramSecretToken: 'tenant-a-header-secret',
        update: privateAttachmentUpdate(1008),
        webhookPathSecret: 'tenant-a-path-secret',
      }),
    ).resolves.toEqual({
      kind: 'accepted',
    })

    expect(dependencies.createChatwootClient).toHaveBeenCalledWith(bridgeConfig)
    expect(dependencies.createTelegramClient).toHaveBeenCalledWith(bridgeConfig)
    expect(
      dependencies.chatwootClient.findContactInboxBySourceId,
    ).toHaveBeenCalledTimes(2)
    expect(
      dependencies.chatwootClient.findContactInboxBySourceId,
    ).toHaveBeenNthCalledWith(1, '77')
    expect(
      dependencies.chatwootClient.findContactInboxBySourceId,
    ).toHaveBeenNthCalledWith(2, '77')
    expect(dependencies.telegramClient.sendPhonePrompt).toHaveBeenCalledTimes(2)
    expect(dependencies.telegramClient.sendPhonePrompt).toHaveBeenCalledWith(
      77,
      expect.stringContaining('телефон'),
    )
    expect(
      dependencies.chatwootClient.forwardTelegramUpdateToChatwoot,
    ).not.toHaveBeenCalled()
    expect(dependencies.dedupeRepository.markUpdateProcessed).toHaveBeenCalledTimes(2)
  })

  it('rejects a foreign contact card without contact lookup or Chatwoot link creation', async () => {
    const dependencies = createDependencies()
    dependencies.chatwootClient.findContactInboxBySourceId.mockResolvedValue(null)

    await expect(
      dependencies.service.handleTelegramUpdate({
        bridgeKey: 'tenant-a-support',
        telegramSecretToken: 'tenant-a-header-secret',
        update: privateContactUpdate({
          updateId: 1009,
          userId: 999,
        }),
        webhookPathSecret: 'tenant-a-path-secret',
      }),
    ).resolves.toEqual({
      kind: 'accepted',
    })

    expect(
      dependencies.chatwootClient.findSingleContactByPhone,
    ).not.toHaveBeenCalled()
    expect(dependencies.chatwootClient.createContactInbox).not.toHaveBeenCalled()
    expect(dependencies.telegramClient.sendPhonePrompt).toHaveBeenCalledWith(
      77,
      expect.stringContaining('свой'),
    )
    expect(dependencies.dedupeRepository.markUpdateProcessed).toHaveBeenCalled()
  })

  it('does not create a link for unmatched or ambiguous same-tenant phone lookup results', async () => {
    const dependencies = createDependencies()
    dependencies.chatwootClient.findContactInboxBySourceId.mockResolvedValue(null)
    dependencies.chatwootClient.findSingleContactByPhone
      .mockResolvedValueOnce({
        outcome: 'not_found',
      })
      .mockResolvedValueOnce({
        outcome: 'ambiguous',
      })

    await expect(
      dependencies.service.handleTelegramUpdate({
        bridgeKey: 'tenant-a-support',
        telegramSecretToken: 'tenant-a-header-secret',
        update: privateContactUpdate({
          updateId: 1010,
        }),
        webhookPathSecret: 'tenant-a-path-secret',
      }),
    ).resolves.toEqual({
      kind: 'accepted',
    })

    await expect(
      dependencies.service.handleTelegramUpdate({
        bridgeKey: 'tenant-a-support',
        telegramSecretToken: 'tenant-a-header-secret',
        update: privateContactUpdate({
          updateId: 1011,
        }),
        webhookPathSecret: 'tenant-a-path-secret',
      }),
    ).resolves.toEqual({
      kind: 'accepted',
    })

    expect(dependencies.chatwootClient.findSingleContactByPhone).toHaveBeenCalledWith(
      '+79161234567',
    )
    expect(dependencies.chatwootClient.createContactInbox).not.toHaveBeenCalled()
    expect(dependencies.telegramClient.sendPhoneNotFound).toHaveBeenCalledTimes(2)
    expect(dependencies.telegramClient.sendPhoneNotFound).toHaveBeenCalledWith(
      77,
      expect.stringContaining('не нашли'),
    )
    expect(dependencies.dedupeRepository.markUpdateProcessed).toHaveBeenCalledTimes(2)
  })

  it('links a matched private phone through tenant-scoped Chatwoot contacts', async () => {
    const dependencies = createDependencies()
    dependencies.chatwootClient.findContactInboxBySourceId.mockResolvedValue(null)
    dependencies.chatwootClient.findSingleContactByPhone.mockResolvedValue({
      contact: {
        email: null,
        id: 44,
        name: 'Иван Петров',
        phoneNumber: '+79161234567',
      },
      outcome: 'found',
    })
    dependencies.chatwootClient.createContactInbox.mockResolvedValue({
      contactId: 44,
      inboxId: 17,
      sourceId: '77',
    })

    await expect(
      dependencies.service.handleTelegramUpdate({
        bridgeKey: 'tenant-a-support',
        telegramSecretToken: 'tenant-a-header-secret',
        update: privateContactUpdate({
          updateId: 1012,
        }),
        webhookPathSecret: 'tenant-a-path-secret',
      }),
    ).resolves.toEqual({
      kind: 'accepted',
    })

    expect(dependencies.createChatwootClient).toHaveBeenCalledWith(bridgeConfig)
    expect(dependencies.chatwootClient.findSingleContactByPhone).toHaveBeenCalledWith(
      '+79161234567',
    )
    expect(dependencies.chatwootClient.createContactInbox).toHaveBeenCalledWith(
      44,
      '77',
    )
    expect(dependencies.telegramClient.sendPhoneLinked).toHaveBeenCalledWith(
      77,
      expect.stringContaining('подтвержден'),
    )
    expect(
      dependencies.chatwootClient.forwardTelegramUpdateToChatwoot,
    ).not.toHaveBeenCalled()
    expect(dependencies.dedupeRepository.markUpdateProcessed).toHaveBeenCalled()
  })

  it('uses configured private authorization text responses', async () => {
    const dependencies = createDependenciesWithTexts()
    dependencies.chatwootClient.findContactInboxBySourceId.mockResolvedValue(null)
    dependencies.chatwootClient.findSingleContactByPhone
      .mockResolvedValueOnce({
        outcome: 'not_found',
      })
      .mockResolvedValueOnce({
        contact: {
          email: null,
          id: 44,
          name: 'Иван Петров',
          phoneNumber: '+79161234567',
        },
        outcome: 'found',
      })
    dependencies.chatwootClient.createContactInbox.mockResolvedValue({
      contactId: 44,
      inboxId: 17,
      sourceId: '77',
    })

    await dependencies.service.handleTelegramUpdate({
      bridgeKey: 'tenant-a-support',
      telegramSecretToken: 'tenant-a-header-secret',
      update: privateTextUpdate(1017),
      webhookPathSecret: 'tenant-a-path-secret',
    })
    await dependencies.service.handleTelegramUpdate({
      bridgeKey: 'tenant-a-support',
      telegramSecretToken: 'tenant-a-header-secret',
      update: privateContactUpdate({
        updateId: 1018,
      }),
      webhookPathSecret: 'tenant-a-path-secret',
    })
    await dependencies.service.handleTelegramUpdate({
      bridgeKey: 'tenant-a-support',
      telegramSecretToken: 'tenant-a-header-secret',
      update: privateContactUpdate({
        updateId: 1019,
      }),
      webhookPathSecret: 'tenant-a-path-secret',
    })

    expect(dependencies.telegramClient.sendPhonePrompt).toHaveBeenCalledWith(
      77,
      'CUSTOM PROMPT',
    )
    expect(dependencies.telegramClient.sendPhoneNotFound).toHaveBeenCalledWith(
      77,
      'CUSTOM NOT FOUND',
    )
    expect(dependencies.telegramClient.sendPhoneLinked).toHaveBeenCalledWith(
      77,
      'CUSTOM LINKED',
    )
  })

  it('forwards existing linked private senders to Chatwoot with the original payload', async () => {
    const dependencies = createDependencies()
    const update = privateTextUpdate(1013)
    dependencies.chatwootClient.findContactInboxBySourceId.mockResolvedValue({
      contactId: 44,
      inboxId: 17,
      sourceId: '77',
    })

    await expect(
      dependencies.service.handleTelegramUpdate({
        bridgeKey: 'tenant-a-support',
        telegramSecretToken: 'tenant-a-header-secret',
        update,
        webhookPathSecret: 'tenant-a-path-secret',
      }),
    ).resolves.toEqual({
      kind: 'accepted',
    })

    expect(
      dependencies.chatwootClient.forwardTelegramUpdateToChatwoot,
    ).toHaveBeenCalledWith(update)
    expect(dependencies.telegramClient.sendPhonePrompt).not.toHaveBeenCalled()
    expect(dependencies.telegramClient.sendPhoneLinked).not.toHaveBeenCalled()
    expect(dependencies.dedupeRepository.markUpdateProcessed).toHaveBeenCalled()
  })

  it('forwards group messages as private-looking Chatwoot payloads without phone prompts', async () => {
    const dependencies = createDependencies()
    const update = groupTextUpdate(1014)

    await expect(
      dependencies.service.handleTelegramUpdate({
        bridgeKey: 'tenant-a-support',
        telegramSecretToken: 'tenant-a-header-secret',
        update,
        webhookPathSecret: 'tenant-a-path-secret',
      }),
    ).resolves.toEqual({
      kind: 'accepted',
    })

    expect(dependencies.createChatwootClient).toHaveBeenCalledWith(bridgeConfig)
    expect(dependencies.createTelegramClient).not.toHaveBeenCalled()
    expect(
      dependencies.chatwootClient.findContactInboxBySourceId,
    ).not.toHaveBeenCalled()
    expect(dependencies.telegramClient.sendPhonePrompt).not.toHaveBeenCalled()
    expect(
      dependencies.chatwootClient.forwardTelegramUpdateToChatwoot,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.objectContaining({
          chat: expect.objectContaining({
            id: -100123,
            original_type: 'supergroup',
            title: 'Support Group',
            type: 'private',
          }),
          from: expect.objectContaining({
            first_name: 'Support Group',
            id: 'tg_group:-100123',
          }),
          text: 'Ivan Petrov: group hello',
        }),
        update_id: 1014,
      }),
    )
    expect(dependencies.dedupeRepository.markUpdateProcessed).toHaveBeenCalled()
  })

  it('marks Chatwoot forward failures as retryable without marking the update processed', async () => {
    const dependencies = createDependencies()
    const error = new Error('Chatwoot forward timeout')
    dependencies.chatwootClient.findContactInboxBySourceId.mockResolvedValue({
      contactId: 44,
      inboxId: 17,
      sourceId: '77',
    })
    dependencies.chatwootClient.forwardTelegramUpdateToChatwoot.mockRejectedValue(
      error,
    )

    await expect(
      dependencies.service.handleTelegramUpdate({
        bridgeKey: 'tenant-a-support',
        telegramSecretToken: 'tenant-a-header-secret',
        update: privateTextUpdate(1015),
        webhookPathSecret: 'tenant-a-path-secret',
      }),
    ).resolves.toEqual({
      kind: 'retryable_failure',
      reason: 'bridge_processing_failed',
      statusCode: 500,
    })

    expect(dependencies.dedupeRepository.markUpdateProcessed).not.toHaveBeenCalled()
    expect(dependencies.dedupeRepository.markUpdateFailed).toHaveBeenCalledWith({
      attemptCount: 1,
      bridgeConfigId: 'bridge-config-1',
      error,
      now: new Date('2026-06-24T12:00:00.000Z'),
      sensitiveValues: [
        '1234567890:AAExampleTelegramBotTokenSecretValue',
        'tenant-a-header-secret',
        'tenant-a-path-secret',
      ],
      updateId: 1015,
    })
  })

  it('marks Chatwoot Account API failures as retryable without prompting or forwarding', async () => {
    const dependencies = createDependencies()
    const error = new Error('Chatwoot Account API unavailable')
    dependencies.chatwootClient.findContactInboxBySourceId.mockRejectedValue(
      error,
    )

    await expect(
      dependencies.service.handleTelegramUpdate({
        bridgeKey: 'tenant-a-support',
        telegramSecretToken: 'tenant-a-header-secret',
        update: privateTextUpdate(1016),
        webhookPathSecret: 'tenant-a-path-secret',
      }),
    ).resolves.toEqual({
      kind: 'retryable_failure',
      reason: 'bridge_processing_failed',
      statusCode: 500,
    })

    expect(dependencies.telegramClient.sendPhonePrompt).not.toHaveBeenCalled()
    expect(
      dependencies.chatwootClient.forwardTelegramUpdateToChatwoot,
    ).not.toHaveBeenCalled()
    expect(dependencies.dedupeRepository.markUpdateProcessed).not.toHaveBeenCalled()
    expect(dependencies.dedupeRepository.markUpdateFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptCount: 1,
        bridgeConfigId: 'bridge-config-1',
        error,
        updateId: 1016,
      }),
    )
  })
})
