import { describe, expect, it } from 'vitest'

import { ChatApiClientError } from '../api/chatClient'
import { getChatBootstrapErrorReason } from './chatBootstrapErrorReason'

const contactConfigurationErrorCodes = [
  'portal_client_group_contact_ids_invalid',
  'portal_contact_disabled',
  'portal_contact_missing',
  'portal_group_contact_disabled',
  'portal_group_flag_required',
  'portal_is_group_invalid',
  'portal_person_contact_expected',
] as const

describe('getChatBootstrapErrorReason', () => {
  it.each(contactConfigurationErrorCodes)(
    'maps %s to a non-retryable contact configuration state',
    (code) => {
      expect(
        getChatBootstrapErrorReason(
          new ChatApiClientError({
            code,
            message: 'Contact configuration is invalid.',
            statusCode: 403,
          }),
        ),
      ).toBe('contact_configuration_invalid')
    },
  )

  it.each([
    new ChatApiClientError({
      message: 'Network request failed.',
      statusCode: 0,
    }),
    new ChatApiClientError({
      code: 'chatwoot_unavailable',
      message: 'Support service is unavailable.',
      statusCode: 503,
    }),
    new ChatApiClientError({
      code: 'INTERNAL_ERROR',
      message: 'Unexpected server error.',
      statusCode: 500,
    }),
    new Error('Unexpected error.'),
  ])('keeps other failures retryable', (error) => {
    expect(getChatBootstrapErrorReason(error)).toBe('chatwoot_unavailable')
  })
})
