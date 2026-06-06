import { describe, expect, it, vi } from 'vitest'

import type {
  ChatwootAdminAgent,
  ChatwootAdminAgentsClientConfig,
} from '../../integrations/chatwoot/adminAgents.js'
import { ChatwootClientRequestError } from '../../integrations/chatwoot/errors.js'
import {
  decodeTenantSecretKey,
  encryptTenantSecret,
} from '../tenants/secrets.js'
import { createTenantAdminVerificationService } from './adminVerification.js'

const tenantSecretKey = Buffer.alloc(32, 12).toString('base64')

type AdminVerificationConfig = {
  chatwootAccountId: number
  chatwootAdminVerificationTokenCiphertext: string | null
  chatwootBaseUrl: string
  id: number
  status: string
}

function encrypt(value: string) {
  return encryptTenantSecret(value, decodeTenantSecretKey(tenantSecretKey))
}

function createService({
  agents,
  config,
  listError,
}: {
  agents?: ChatwootAdminAgent[]
  config: AdminVerificationConfig | null
  listError?: Error
}) {
  const listAccountAgents = vi.fn(async () => {
    if (listError) {
      throw listError
    }

    return agents ?? []
  })
  const forTenant = vi.fn((config: ChatwootAdminAgentsClientConfig) => {
    void config

    return {
      listAccountAgents,
    }
  })
  const findAdminVerificationConfigByTenantId = vi.fn(async () => config)
  const service = createTenantAdminVerificationService({
    chatwootAdminAgentsClientFactory: { forTenant },
    tenantSecretKey,
    tenantsRepository: { findAdminVerificationConfigByTenantId },
  })

  return {
    findAdminVerificationConfigByTenantId,
    forTenant,
    listAccountAgents,
    service,
  }
}

describe('createTenantAdminVerificationService', () => {
  it('fails closed when the tenant has no admin verification token', async () => {
    const { forTenant, service } = createService({
      config: {
        chatwootAccountId: 3,
        chatwootAdminVerificationTokenCiphertext: null,
        chatwootBaseUrl: 'https://chatwoot.example.test',
        id: 1,
        status: 'active',
      },
    })

    await expect(
      service.verifyTenantAdminEmail({
        email: 'admin@example.test',
        tenantId: 1,
      }),
    ).resolves.toEqual({ result: 'not_configured' })
    expect(forTenant).not.toHaveBeenCalled()
  })

  it('fails closed when the admin verification token ciphertext is invalid', async () => {
    const { forTenant, service } = createService({
      config: {
        chatwootAccountId: 3,
        chatwootAdminVerificationTokenCiphertext: 'not-a-ciphertext',
        chatwootBaseUrl: 'https://chatwoot.example.test',
        id: 1,
        status: 'active',
      },
    })

    await expect(
      service.verifyTenantAdminEmail({
        email: 'admin@example.test',
        tenantId: 1,
      }),
    ).resolves.toEqual({ result: 'invalid_token_secret' })
    expect(forTenant).not.toHaveBeenCalled()
  })

  it('uses the decrypted admin verification token instead of a runtime token', async () => {
    const { forTenant, service } = createService({
      agents: [
        {
          accountId: 3,
          confirmed: true,
          email: 'admin@example.test',
          id: 11,
          role: 'administrator',
        },
      ],
      config: {
        chatwootAccountId: 3,
        chatwootAdminVerificationTokenCiphertext: encrypt(
          'admin-verification-token',
        ),
        chatwootBaseUrl: 'https://chatwoot.example.test',
        id: 1,
        status: 'active',
      },
    })

    await expect(
      service.verifyTenantAdminEmail({
        email: ' ADMIN@example.test ',
        tenantId: 1,
      }),
    ).resolves.toEqual({
      agent: {
        accountId: 3,
        email: 'admin@example.test',
        id: 11,
        role: 'administrator',
      },
      result: 'eligible',
    })
    expect(forTenant).toHaveBeenCalledWith({
      accountId: 3,
      apiAccessToken: 'admin-verification-token',
      baseUrl: 'https://chatwoot.example.test',
    })
  })

  it('returns a controlled result when Chatwoot rejects the token permission', async () => {
    const { service } = createService({
      config: {
        chatwootAccountId: 3,
        chatwootAdminVerificationTokenCiphertext: encrypt(
          'admin-verification-token',
        ),
        chatwootBaseUrl: 'https://chatwoot.example.test',
        id: 1,
        status: 'active',
      },
      listError: new ChatwootClientRequestError(
        'Chatwoot agents lookup failed. Status: 403.',
      ),
    })

    await expect(
      service.verifyTenantAdminEmail({
        email: 'admin@example.test',
        tenantId: 1,
      }),
    ).resolves.toEqual({ result: 'chatwoot_permission_denied' })
  })

  it('rejects cross-tenant admin attempts unless the current tenant account has a confirmed administrator row', async () => {
    const { service } = createService({
      agents: [
        {
          accountId: 3,
          confirmed: true,
          email: 'admin@example.test',
          id: 11,
          role: 'administrator',
        },
        {
          accountId: 5,
          confirmed: true,
          email: 'admin@example.test',
          id: 22,
          role: 'agent',
        },
      ],
      config: {
        chatwootAccountId: 5,
        chatwootAdminVerificationTokenCiphertext: encrypt(
          'tenant-b-admin-verification-token',
        ),
        chatwootBaseUrl: 'https://chatwoot.example.test',
        id: 2,
        status: 'active',
      },
    })

    await expect(
      service.verifyTenantAdminEmail({
        email: 'admin@example.test',
        tenantId: 2,
      }),
    ).resolves.toEqual({ result: 'not_eligible' })
  })
})
