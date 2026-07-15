import { describe, expect, it } from 'vitest'

import { createChatwootFetchWithContacts } from './passwordlessLoginTestHelpers.js'

describe('createChatwootFetchWithContacts', () => {
  it('rejects requests routed through an unexpected Chatwoot account', async () => {
    const fetchFn = createChatwootFetchWithContacts(() => [
      {
        email: 'portal@example.test',
        id: 44,
        name: 'Portal User',
      },
    ])

    await expect(
      fetchFn(
        new URL(
          'https://chatwoot.example.test/api/v1/accounts/999/contacts/44',
        ),
      ),
    ).rejects.toThrow('Unexpected Chatwoot test account request.')
  })
})
