import { describe, expect, it } from 'vitest'

import {
  buildAuthorName,
  buildGroupSourceId,
  classifyPrivateAuthorizationMessage,
  extractSupportedMessage,
  getTelegramChatType,
  isSelfTelegramContact,
  shouldIgnoreMessage,
  transformGroupUpdate,
} from './telegramPayload.js'
import type { TelegramMessage, TelegramUpdate } from './types.js'

type TelegramMessageOverrides = Omit<
  Partial<TelegramMessage>,
  'caption' | 'text'
> & {
  caption?: string | undefined
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

  if ('text' in overrides && overrides.text === undefined) {
    delete updatedMessage.text
  }

  if ('caption' in overrides && overrides.caption === undefined) {
    delete updatedMessage.caption
  }

  return updatedMessage as TelegramMessage
}

function privateTextUpdate(overrides: TelegramMessageOverrides = {}) {
  return {
    update_id: 101,
    message: applyMessageOverrides({
      chat: {
        first_name: 'Ivan',
        id: 10,
        type: 'private',
      },
      date: 1_700_000_000,
      from: {
        first_name: 'Ivan',
        id: 10,
        is_bot: false,
      },
      message_id: 5,
      text: 'hello',
    }, overrides),
  } satisfies TelegramUpdate
}

function groupUpdate(overrides: TelegramMessageOverrides = {}) {
  return {
    update_id: 202,
    message: applyMessageOverrides({
      chat: {
        id: -100123,
        title: 'Support Group',
        type: 'supergroup',
      },
      date: 1_700_000_000,
      from: {
        first_name: 'Ivan',
        id: 77,
        is_bot: false,
        last_name: 'Petrov',
      },
      message_id: 9,
      text: 'group hello',
    }, overrides),
  } satisfies TelegramUpdate
}

describe('telegram payload helpers', () => {
  it('extracts a supported private text message unchanged', () => {
    const update = privateTextUpdate()
    const supported = extractSupportedMessage(update)

    expect(supported).not.toBeNull()
    expect(supported?.update).toBe(update)
    expect(supported?.message).toBe(update.message)
    expect(getTelegramChatType(update.message)).toBe('private')
  })

  it('identifies private attachments without authorization as needing a phone prompt', () => {
    const update = privateTextUpdate({
      photo: [
        {
          file_id: 'file-id',
        },
      ],
      text: undefined,
    })

    expect(classifyPrivateAuthorizationMessage(update.message)).toEqual({
      kind: 'needs_phone_prompt',
    })
  })

  it('accepts only a Telegram self contact card before phone lookup', () => {
    const selfContact = privateTextUpdate({
      contact: {
        first_name: 'Ivan',
        phone_number: '89161234567',
        user_id: 10,
      },
      text: undefined,
    }).message
    const foreignContact = privateTextUpdate({
      contact: {
        first_name: 'Other',
        phone_number: '89161234567',
        user_id: 999,
      },
      text: undefined,
    }).message

    expect(isSelfTelegramContact(selfContact)).toBe(true)
    expect(classifyPrivateAuthorizationMessage(selfContact)).toEqual({
      kind: 'self_contact',
      phone: '+79161234567',
    })

    expect(isSelfTelegramContact(foreignContact)).toBe(false)
    expect(classifyPrivateAuthorizationMessage(foreignContact)).toEqual({
      kind: 'foreign_contact',
    })
  })

  it('ignores bot commands, bot senders, service messages and edited messages', () => {
    expect(
      shouldIgnoreMessage(
        privateTextUpdate({
          text: '/start',
        }).message,
      ),
    ).toBe(true)
    expect(
      shouldIgnoreMessage(
        privateTextUpdate({
          text: '/help please',
        }).message,
      ),
    ).toBe(true)
    expect(
      shouldIgnoreMessage(
        privateTextUpdate({
          from: {
            first_name: 'Bot',
            id: 99,
            is_bot: true,
          },
        }).message,
      ),
    ).toBe(true)
    expect(
      shouldIgnoreMessage(
        privateTextUpdate({
          new_chat_title: 'New title',
        }).message,
      ),
    ).toBe(true)
    expect(
      shouldIgnoreMessage(
        groupUpdate({
          migrate_to_chat_id: -1004333099080,
          text: undefined,
        }).message,
      ),
    ).toBe(true)
    expect(
      extractSupportedMessage({
        edited_message: privateTextUpdate().message,
        update_id: 303,
      }),
    ).toBeNull()
  })

  it('transforms group text into a private-looking Chatwoot payload', () => {
    const update = groupUpdate()
    const transformed = transformGroupUpdate(update)
    const message = transformed.message

    expect(buildGroupSourceId(-100123)).toBe('tg_group:-100123')
    expect(message.chat.id).toBe(-100123)
    expect(message.chat.type).toBe('private')
    expect(message.chat.first_name).toBe('Support Group')
    expect(message.chat.title).toBe('Support Group')
    expect(message.chat.original_id).toBe(-100123)
    expect(message.chat.original_type).toBe('supergroup')
    expect(message.from?.id).toBe('tg_group:-100123')
    expect(message.from?.first_name).toBe('Support Group')
    expect(message.from?.original_author).toEqual(update.message.from)
    expect(message.text).toBe('**Ivan Petrov:**\ngroup hello')
  })

  it('prefixes group captions with author names', () => {
    const transformed = transformGroupUpdate(
      groupUpdate({
        caption: 'photo caption',
        from: {
          id: 88,
          is_bot: false,
          username: 'support_user',
        },
        text: undefined,
      }),
    )

    expect(buildAuthorName({ username: 'support_user' })).toBe('@support_user')
    expect(transformed.message.caption).toBe('**@support_user:**\nphoto caption')
  })

  it('escapes markdown control characters in group author names', () => {
    const transformed = transformGroupUpdate(
      groupUpdate({
        from: {
          first_name: 'Ivan *VIP*',
          id: 88,
          is_bot: false,
        },
      }),
    )

    expect(transformed.message.text).toBe('**Ivan \\*VIP\\*:**\ngroup hello')
  })

  it('adds a clear author placeholder for group attachments without text or caption', () => {
    const transformed = transformGroupUpdate(
      groupUpdate({
        photo: [
          {
            file_id: 'file-id',
          },
        ],
        text: undefined,
      }),
    )

    expect(transformed.message.text).toBe('**Ivan Petrov:**\n[attachment]')
  })
})
