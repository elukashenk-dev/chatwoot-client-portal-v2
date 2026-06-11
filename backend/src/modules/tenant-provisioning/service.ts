import {
  type ChatwootClientConfig,
  type ChatwootCreatedApiInbox,
  type ChatwootInboxSummary,
  type ChatwootPortalInboxRouting,
  type ChatwootPortalInboxWebhook,
} from '../../integrations/chatwoot/client.js'
import type { ChatwootPlatformClient } from '../../integrations/chatwoot/platformClient.js'
import type { TenantProvisioningRun } from '../../db/schema.js'
import type { TenantsRepository } from '../tenants/repository.js'
import {
  decodeTenantSecretKey,
  encryptTenantSecret,
} from '../tenants/secrets.js'
import {
  buildProvisioningServiceUsers,
  normalizeTenantProvisioningInput,
  type TenantProvisioningInput,
} from './input.js'
import type { TenantProvisioningRepository } from './repository.js'
import {
  assertExistingTenantCanResume,
  assertExistingTenantMatchesInput,
  createDefaultPassword,
  findExistingPortalTenant,
  hasRunProgress,
  requireProvisionedId,
  requireSecret,
  resolveChatwootAccount,
  resolveUserId,
  sanitizeProvisioningError,
  toResultTenant,
} from './serviceHelpers.js'

export type ProvisionTenantResult = {
  action: 'already_exists' | 'created' | 'resumed'
  runId: number
  tenant: {
    chatwootAccountId: number
    chatwootPortalInboxId: number
    id: number
    primaryDomain: string
    publicBaseUrl: string
    slug: string
    status: 'active'
  }
}

export type TenantProvisioningChatwootAccountClient = {
  configurePortalInboxWebhook(input: {
    url: string
  }): Promise<ChatwootPortalInboxWebhook>
  createPortalApiInbox(input: {
    name: string
  }): Promise<ChatwootCreatedApiInbox>
  ensurePortalInboxSingleConversationRouting(): Promise<
    ChatwootPortalInboxRouting & { updated: boolean }
  >
  findPortalApiInboxByName(input: {
    name: string
  }): Promise<ChatwootInboxSummary | null>
}

type ProvisionTenantOptions = {
  chatwootAccountClientFactory: (
    config: ChatwootClientConfig,
  ) => TenantProvisioningChatwootAccountClient
  input: TenantProvisioningInput
  passwordGenerator?: () => string
  platformClient: ChatwootPlatformClient
  provisioningRepository: TenantProvisioningRepository
  tenantSecretKey: string
  tenantsRepository: TenantsRepository
}

export async function provisionTenant({
  chatwootAccountClientFactory,
  input,
  passwordGenerator = createDefaultPassword,
  platformClient,
  provisioningRepository,
  tenantSecretKey,
  tenantsRepository,
}: ProvisionTenantOptions): Promise<ProvisionTenantResult> {
  const normalizedInput = normalizeTenantProvisioningInput(input)
  const existingTenant = await findExistingPortalTenant({
    input: normalizedInput,
    tenantsRepository,
  })

  if (existingTenant) {
    assertExistingTenantMatchesInput({
      existingTenant,
      input: normalizedInput,
    })

    if (existingTenant.status === 'active') {
      return {
        action: 'already_exists',
        runId: 0,
        tenant: toResultTenant(existingTenant),
      }
    }

    assertExistingTenantCanResume(existingTenant)
  }

  let run: TenantProvisioningRun | null = null
  const tenantSecretKeyBuffer = decodeTenantSecretKey(tenantSecretKey)

  try {
    run = await provisioningRepository.createOrResumeRun({
      chatwootBaseUrl: normalizedInput.chatwootBaseUrl,
      clientAdminEmail: normalizedInput.clientAdminEmail,
      clientAdminName: normalizedInput.clientAdminName,
      displayName: normalizedInput.displayName,
      domainMode: normalizedInput.domainMode,
      primaryDomain: normalizedInput.primaryDomain,
      providerSubdomain: normalizedInput.providerSubdomain,
      providerTenantDomainSuffix: normalizedInput.providerTenantDomainSuffix,
      publicBaseUrl: normalizedInput.publicBaseUrl,
      slug: normalizedInput.slug,
    })

    const action = hasRunProgress(run) ? 'resumed' : 'created'

    run = await provisioningRepository.markStatus({
      id: run.id,
      status: 'creating_chatwoot_account',
    })
    run = await resolveChatwootAccount({
      input: normalizedInput,
      platformClient,
      provisioningRepository,
      run,
    })

    const chatwootAccountId = requireProvisionedId(
      run.chatwootAccountId,
      'chatwootAccountId',
    )
    const serviceUsers = buildProvisioningServiceUsers({
      serviceEmailDomain: normalizedInput.serviceEmailDomain,
      slug: normalizedInput.slug,
    })

    run = await provisioningRepository.markStatus({
      id: run.id,
      status: 'creating_client_admin',
    })
    const clientAdminResult = await resolveUserId({
      createUserInput: {
        customAttributes: {
          portal_managed: true,
          portal_tenant_slug: normalizedInput.slug,
          portal_user_kind: 'client_admin',
        },
        email: normalizedInput.clientAdminEmail,
        name: normalizedInput.clientAdminName,
        password: passwordGenerator(),
      },
      existingUserId: run.clientAdminUserId,
      platformClient,
      provisioningRepository,
      runId: run.id,
      store: (repository, { id, userId }) =>
        repository.storeClientAdminUserId({
          clientAdminUserId: userId,
          id,
        }),
    })
    run = clientAdminResult.run ?? run
    await platformClient.addAccountUser({
      accountId: chatwootAccountId,
      role: 'administrator',
      userId: clientAdminResult.userId,
    })

    run = await provisioningRepository.markStatus({
      id: run.id,
      status: 'creating_runtime_user',
    })
    const runtimeUserResult = await resolveUserId({
      createUserInput: {
        customAttributes: {
          portal_managed: true,
          portal_service_role: 'runtime',
        },
        email: serviceUsers.runtimeEmail,
        name: `Portal runtime ${normalizedInput.slug}`,
        password: passwordGenerator(),
      },
      existingUserId: run.runtimeServiceUserId,
      platformClient,
      provisioningRepository,
      runId: run.id,
      store: (repository, { id, userId }) =>
        repository.storeRuntimeServiceUserId({
          id,
          runtimeServiceUserId: userId,
        }),
    })
    run = runtimeUserResult.run ?? run
    await platformClient.addAccountUser({
      accountId: chatwootAccountId,
      role: 'administrator',
      userId: runtimeUserResult.userId,
    })

    run = await provisioningRepository.markStatus({
      id: run.id,
      status: 'creating_admin_verification_user',
    })
    const adminVerificationUserResult = await resolveUserId({
      createUserInput: {
        customAttributes: {
          portal_managed: true,
          portal_service_role: 'admin_verification',
        },
        email: serviceUsers.adminVerificationEmail,
        name: `Portal admin verification ${normalizedInput.slug}`,
        password: passwordGenerator(),
      },
      existingUserId: run.adminVerificationServiceUserId,
      platformClient,
      provisioningRepository,
      runId: run.id,
      store: (repository, { id, userId }) =>
        repository.storeAdminVerificationServiceUserId({
          adminVerificationServiceUserId: userId,
          id,
        }),
    })
    run = adminVerificationUserResult.run ?? run
    await platformClient.addAccountUser({
      accountId: chatwootAccountId,
      role: 'administrator',
      userId: adminVerificationUserResult.userId,
    })

    const runtimeToken = await platformClient.getUserToken(
      runtimeUserResult.userId,
    )
    const adminVerificationToken = await platformClient.getUserToken(
      adminVerificationUserResult.userId,
    )

    if (runtimeToken === adminVerificationToken) {
      throw new Error(
        'Runtime and admin-verification Chatwoot tokens must be different.',
      )
    }

    run = await provisioningRepository.markStatus({
      id: run.id,
      status: 'creating_portal_inbox',
    })
    const accountClient = chatwootAccountClientFactory({
      accountId: chatwootAccountId,
      apiAccessToken: runtimeToken,
      baseUrl: normalizedInput.chatwootBaseUrl,
    })
    const inboxName = `Portal ${normalizedInput.slug}`
    if (!run.chatwootPortalInboxId) {
      const existingInbox = await accountClient.findPortalApiInboxByName({
        name: inboxName,
      })
      const inbox =
        existingInbox ??
        (await accountClient.createPortalApiInbox({
          name: inboxName,
        }))
      run = await provisioningRepository.storePortalInboxId({
        chatwootPortalInboxId: inbox.id,
        id: run.id,
      })
    }

    const chatwootPortalInboxId = requireProvisionedId(
      run.chatwootPortalInboxId,
      'chatwootPortalInboxId',
    )
    const portalAccountClient = chatwootAccountClientFactory({
      accountId: chatwootAccountId,
      apiAccessToken: runtimeToken,
      baseUrl: normalizedInput.chatwootBaseUrl,
      portalInboxId: chatwootPortalInboxId,
    })
    const webhook = await portalAccountClient.configurePortalInboxWebhook({
      url: `${normalizedInput.publicBaseUrl}/api/chatwoot/webhooks`,
    })
    const webhookSecret = requireSecret(webhook.secret, 'Webhook secret')

    run = await provisioningRepository.markStatus({
      id: run.id,
      status: 'creating_portal_tenant',
    })
    let tenant = await tenantsRepository.upsertTenantBySlug({
      chatwootAccountId,
      chatwootAdminVerificationTokenCiphertext: encryptTenantSecret(
        adminVerificationToken,
        tenantSecretKeyBuffer,
      ),
      chatwootApiAccessTokenCiphertext: encryptTenantSecret(
        runtimeToken,
        tenantSecretKeyBuffer,
      ),
      chatwootBaseUrl: normalizedInput.chatwootBaseUrl,
      chatwootPortalInboxId,
      chatwootWebhookSecretCiphertext: encryptTenantSecret(
        webhookSecret,
        tenantSecretKeyBuffer,
      ),
      displayName: normalizedInput.displayName,
      primaryDomain: normalizedInput.primaryDomain,
      publicBaseUrl: normalizedInput.publicBaseUrl,
      slug: normalizedInput.slug,
      status: 'provisioning',
    })

    if (webhook.inboxIdentifier) {
      tenant = await tenantsRepository.updateChatwootPortalInboxIdentifier({
        chatwootPortalInboxIdentifier: webhook.inboxIdentifier,
        tenantId: tenant.id,
      })
    }

    run = await provisioningRepository.markStatus({
      id: run.id,
      status: 'verifying',
    })
    await portalAccountClient.ensurePortalInboxSingleConversationRouting()
    tenant = await tenantsRepository.updateTenantStatus({
      status: 'active',
      tenantId: tenant.id,
    })
    run = await provisioningRepository.markCompleted({
      id: run.id,
    })

    return {
      action,
      runId: run.id,
      tenant: toResultTenant(tenant),
    }
  } catch (error) {
    if (run) {
      await provisioningRepository.markFailed({
        id: run.id,
        message: sanitizeProvisioningError(error),
      })
    }

    throw error
  }
}
