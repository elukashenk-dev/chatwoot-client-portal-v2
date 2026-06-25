import { timingSafeEqual } from 'node:crypto'

import type {
  ChatwootContactInboxLink,
  ChatwootSingleContactByPhoneResult,
} from './chatwootBridgeClient.js'
import type {
  ResolvedTelegramBridgeConfig,
  TelegramBridgeConfigLookupResult,
} from './configRepository.js'
import {
  classifyPrivateAuthorizationMessage,
  extractSupportedMessage,
  getTelegramChatType,
  shouldIgnoreMessage,
  transformGroupUpdate,
} from './telegramPayload.js'
import type {
  TelegramIdentifier,
  TelegramMessage,
  TelegramUpdate,
} from './types.js'

export type TelegramBridgeResult =
  | { kind: 'accepted' }
  | { kind: 'duplicate' }
  | { kind: 'ignored'; reason: string }
  | { kind: 'retryable_failure'; reason: string; statusCode: 500 | 503 }

export type HandleTelegramUpdateInput = {
  bridgeKey: string
  telegramSecretToken: string | null
  update: TelegramUpdate
  webhookPathSecret: string
}

type TelegramBridgeDelivery = {
  attemptCount: number
}

type StartUpdateProcessingResult =
  | { delivery: TelegramBridgeDelivery; outcome: 'acquired' }
  | { delivery: TelegramBridgeDelivery; outcome: 'in_progress' }
  | { delivery: TelegramBridgeDelivery; outcome: 'processed' }
  | { delivery: null; outcome: 'missing' }

type ConfigRepository = {
  findActiveBridgeConfigByPublicKey(input: {
    publicKey: string
    webhookPathSecret: string
  }): Promise<TelegramBridgeConfigLookupResult>
}

type DedupeRepository = {
  markUpdateFailed(input: {
    attemptCount?: number
    bridgeConfigId: string
    error: unknown
    now: Date
    sensitiveValues?: string[]
    updateId: number
  }): Promise<unknown>
  markUpdateProcessed(input: {
    attemptCount?: number
    bridgeConfigId: string
    now: Date
    updateId: number
  }): Promise<unknown>
  startUpdateProcessing(input: {
    bridgeConfigId: string
    now: Date
    staleProcessingBefore: Date
    telegramChatId: string | null
    telegramFromId: string | null
    updateId: number
  }): Promise<StartUpdateProcessingResult>
}

type ChatwootBridgeServiceClient = {
  createContactInbox(
    contactId: number,
    sourceId: string,
  ): Promise<ChatwootContactInboxLink>
  findContactInboxBySourceId(
    sourceId: string,
  ): Promise<ChatwootContactInboxLink | null>
  findSingleContactByPhone(
    phone: string,
  ): Promise<ChatwootSingleContactByPhoneResult>
  forwardTelegramUpdateToChatwoot(payload: TelegramUpdate): Promise<void>
}

type TelegramBridgeServiceClient = {
  sendPhoneLinked(chatId: TelegramIdentifier, text: string): Promise<void>
  sendPhoneNotFound(chatId: TelegramIdentifier, text: string): Promise<void>
  sendPhonePrompt(chatId: TelegramIdentifier, text: string): Promise<void>
}

type Logger = {
  info?(...input: unknown[]): void
  warn?(...input: unknown[]): void
}

export type TelegramBridgeServiceTexts = {
  ownPhonePrompt?: string
  phoneLinked: string
  phoneNotFound: string
  phonePrompt: string
}

type TelegramBridgeServiceOptions = {
  configRepository: ConfigRepository
  createChatwootClient(
    config: ResolvedTelegramBridgeConfig,
  ): ChatwootBridgeServiceClient
  createTelegramClient(
    config: ResolvedTelegramBridgeConfig,
  ): TelegramBridgeServiceClient
  dedupeRepository: DedupeRepository
  logger?: Logger
  now?: () => Date
  staleProcessingMs?: number
  texts?: TelegramBridgeServiceTexts
}

const defaultTexts = {
  ownPhonePrompt:
    'Отправьте свой номер телефона кнопкой ниже, чтобы мы нашли ваш контакт.',
  phoneLinked: 'Телефон подтвержден. Теперь можно отправить сообщение.',
  phoneNotFound:
    'Мы не нашли контакт с этим номером. Проверьте номер или напишите в поддержку.',
  phonePrompt:
    'Отправьте номер телефона кнопкой ниже, чтобы мы нашли ваш контакт.',
} satisfies Required<TelegramBridgeServiceTexts>

function secureCompare(a: string | null, b: string) {
  if (a === null) {
    return false
  }

  const left = Buffer.from(a)
  const right = Buffer.from(b)

  if (left.length !== right.length) {
    return false
  }

  return timingSafeEqual(left, right)
}

function readUpdateId(update: TelegramUpdate) {
  return typeof update.update_id === 'number' &&
    Number.isInteger(update.update_id)
    ? update.update_id
    : null
}

function stringifyTelegramId(value: TelegramIdentifier | undefined) {
  if (value === undefined) {
    return null
  }

  return String(value)
}

function buildTelegramSourceId(message: TelegramMessage) {
  return String(message.from?.id ?? message.chat.id)
}

function mapConfigLookupMiss(
  result: Exclude<TelegramBridgeConfigLookupResult, { outcome: 'found' }>,
): TelegramBridgeResult {
  if (
    result.outcome === 'inactive_config' ||
    result.outcome === 'inactive_tenant'
  ) {
    return {
      kind: 'ignored',
      reason: 'disabled',
    }
  }

  return {
    kind: 'ignored',
    reason: 'unauthorized',
  }
}

function buildSensitiveValues(config: ResolvedTelegramBridgeConfig) {
  return [
    config.telegram.botToken,
    config.telegram.secretToken,
    config.telegram.webhookPathSecret,
  ]
}

function resolveTexts(texts: TelegramBridgeServiceTexts | undefined) {
  return {
    ownPhonePrompt:
      texts?.ownPhonePrompt ?? texts?.phonePrompt ?? defaultTexts.ownPhonePrompt,
    phoneLinked: texts?.phoneLinked ?? defaultTexts.phoneLinked,
    phoneNotFound: texts?.phoneNotFound ?? defaultTexts.phoneNotFound,
    phonePrompt: texts?.phonePrompt ?? defaultTexts.phonePrompt,
  }
}

export function createTelegramBridgeService({
  configRepository,
  createChatwootClient,
  createTelegramClient,
  dedupeRepository,
  logger,
  now = () => new Date(),
  staleProcessingMs = 10 * 60 * 1000,
  texts,
}: TelegramBridgeServiceOptions) {
  const resolvedTexts = resolveTexts(texts)

  return {
    async handleTelegramUpdate({
      bridgeKey,
      telegramSecretToken,
      update,
      webhookPathSecret,
    }: HandleTelegramUpdateInput): Promise<TelegramBridgeResult> {
      const lookup = await configRepository.findActiveBridgeConfigByPublicKey({
        publicKey: bridgeKey,
        webhookPathSecret,
      })

      if (lookup.outcome !== 'found') {
        logger?.warn?.({
          bridgeKey,
          outcome: lookup.outcome,
          reason: 'bridge_config_rejected',
        })

        return mapConfigLookupMiss(lookup)
      }

      const { config } = lookup

      if (!secureCompare(telegramSecretToken, config.telegram.secretToken)) {
        logger?.warn?.({
          bridgeKey,
          reason: 'telegram_secret_rejected',
        })

        return {
          kind: 'ignored',
          reason: 'forbidden',
        }
      }

      const updateId = readUpdateId(update)

      if (updateId === null) {
        return {
          kind: 'ignored',
          reason: 'unsupported_update',
        }
      }

      const supportedMessage = extractSupportedMessage(update)
      const currentTime = now()
      const delivery = await dedupeRepository.startUpdateProcessing({
        bridgeConfigId: config.id,
        now: currentTime,
        staleProcessingBefore: new Date(
          currentTime.getTime() - staleProcessingMs,
        ),
        telegramChatId: supportedMessage
          ? String(supportedMessage.message.chat.id)
          : null,
        telegramFromId: supportedMessage
          ? stringifyTelegramId(supportedMessage.message.from?.id)
          : null,
        updateId,
      })

      if (delivery.outcome === 'processed') {
        return {
          kind: 'duplicate',
        }
      }

      if (delivery.outcome === 'in_progress') {
        return {
          kind: 'retryable_failure',
          reason: 'update_in_progress',
          statusCode: 503,
        }
      }

      if (delivery.outcome === 'missing') {
        return {
          kind: 'retryable_failure',
          reason: 'delivery_state_missing',
          statusCode: 503,
        }
      }

      try {
        if (
          !supportedMessage ||
          shouldIgnoreMessage(supportedMessage.message)
        ) {
          await dedupeRepository.markUpdateProcessed({
            attemptCount: delivery.delivery.attemptCount,
            bridgeConfigId: config.id,
            now: currentTime,
            updateId,
          })

          return {
            kind: 'accepted',
          }
        }

        const { message } = supportedMessage
        const chatType = getTelegramChatType(message)

        if (chatType === 'private') {
          const chatwootClient = createChatwootClient(config)
          const sourceId = buildTelegramSourceId(message)
          const existingContactInbox =
            await chatwootClient.findContactInboxBySourceId(sourceId)

          if (!existingContactInbox) {
            const telegramClient = createTelegramClient(config)
            const authorization =
              classifyPrivateAuthorizationMessage(message)

            if (authorization.kind === 'needs_phone_prompt') {
              await telegramClient.sendPhonePrompt(
                message.chat.id,
                resolvedTexts.phonePrompt,
              )
            } else if (authorization.kind === 'foreign_contact') {
              await telegramClient.sendPhonePrompt(
                message.chat.id,
                resolvedTexts.ownPhonePrompt,
              )
            } else {
              const contactLookup =
                await chatwootClient.findSingleContactByPhone(
                  authorization.phone,
                )

              if (contactLookup.outcome === 'found') {
                await chatwootClient.createContactInbox(
                  contactLookup.contact.id,
                  sourceId,
                )
                await telegramClient.sendPhoneLinked(
                  message.chat.id,
                  resolvedTexts.phoneLinked,
                )
              } else {
                await telegramClient.sendPhoneNotFound(
                  message.chat.id,
                  resolvedTexts.phoneNotFound,
                )
              }
            }

            await dedupeRepository.markUpdateProcessed({
              attemptCount: delivery.delivery.attemptCount,
              bridgeConfigId: config.id,
              now: currentTime,
              updateId,
            })

            return {
              kind: 'accepted',
            }
          }

          await chatwootClient.forwardTelegramUpdateToChatwoot(update)
        } else if (chatType === 'group' || chatType === 'supergroup') {
          const chatwootClient = createChatwootClient(config)

          await chatwootClient.forwardTelegramUpdateToChatwoot(
            transformGroupUpdate(update),
          )
        }

        await dedupeRepository.markUpdateProcessed({
          attemptCount: delivery.delivery.attemptCount,
          bridgeConfigId: config.id,
          now: currentTime,
          updateId,
        })

        return {
          kind: 'accepted',
        }
      } catch (error) {
        await dedupeRepository.markUpdateFailed({
          attemptCount: delivery.delivery.attemptCount,
          bridgeConfigId: config.id,
          error,
          now: currentTime,
          sensitiveValues: buildSensitiveValues(config),
          updateId,
        })

        return {
          kind: 'retryable_failure',
          reason: 'bridge_processing_failed',
          statusCode: 500,
        }
      }
    },
  }
}
