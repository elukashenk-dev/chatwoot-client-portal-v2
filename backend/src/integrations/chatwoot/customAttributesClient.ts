import { ChatwootClientRequestError } from './errors.js'

export type ChatwootPortalContactCustomAttributeKey =
  | 'curator_name'
  | 'portal_client_group_contact_ids'
  | 'portal_enabled'
  | 'portal_is_group'

export type ChatwootPortalContactCustomAttributeDefinitionsResult = {
  created: ChatwootPortalContactCustomAttributeKey[]
  unchanged: ChatwootPortalContactCustomAttributeKey[]
  updated: ChatwootPortalContactCustomAttributeKey[]
}

type ChatwootContactCustomAttributeDefinition = {
  displayName: string
  displayType: 'checkbox' | 'list' | 'text'
  id: number
  key: ChatwootPortalContactCustomAttributeKey | string
  values: string[]
}

type DesiredPortalContactCustomAttributeDefinition = {
  displayName: string
  displayType: 'checkbox' | 'list' | 'text'
  key: ChatwootPortalContactCustomAttributeKey
  values?: string[]
}

type ResolvedChatwootAccountConfig = {
  accountId: number
  baseUrl: string
}

type RequestJson = (
  requestUrl: URL,
  unavailableMessage: string,
  options?: {
    body?: unknown
    method?: 'GET' | 'PATCH' | 'POST'
  },
) => Promise<unknown>

type CreateChatwootCustomAttributesClientOptions = {
  assertAccountConfigured: () => ResolvedChatwootAccountConfig
  requestJson: RequestJson
}

const PORTAL_CONTACT_CUSTOM_ATTRIBUTE_MODEL = 'contact_attribute'
const REQUIRED_PORTAL_CONTACT_CUSTOM_ATTRIBUTE_DEFINITIONS: DesiredPortalContactCustomAttributeDefinition[] =
  [
    {
      displayName: 'Доступен в портале',
      displayType: 'checkbox',
      key: 'portal_enabled',
    },
    {
      displayName: 'Это группа',
      displayType: 'checkbox',
      key: 'portal_is_group',
    },
    {
      displayName: 'ID групп портала',
      displayType: 'text',
      key: 'portal_client_group_contact_ids',
    },
    {
      displayName: 'Куратор',
      displayType: 'text',
      key: 'curator_name',
    },
  ]
const REQUIRED_PORTAL_CONTACT_CUSTOM_ATTRIBUTE_KEYS = new Set<string>(
  REQUIRED_PORTAL_CONTACT_CUSTOM_ATTRIBUTE_DEFINITIONS.map(
    (definition) => definition.key,
  ),
)

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : null
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is string => typeof item === 'string')
}

function mapContactCustomAttributeDefinition(
  payload: unknown,
): ChatwootContactCustomAttributeDefinition {
  if (!isPlainObject(payload)) {
    throw new ChatwootClientRequestError(
      'Chatwoot custom attribute definition returned an invalid payload.',
    )
  }

  const id = readInteger(payload.id)
  const key = readString(payload.attribute_key)
  const displayName = readString(payload.attribute_display_name)
  const displayType = readString(payload.attribute_display_type)

  if (
    id === null ||
    id <= 0 ||
    !key ||
    !displayName ||
    !['checkbox', 'list', 'text'].includes(displayType ?? '')
  ) {
    throw new ChatwootClientRequestError(
      'Chatwoot custom attribute definition returned an invalid payload.',
    )
  }

  return {
    displayName,
    displayType: displayType as 'checkbox' | 'list' | 'text',
    id,
    key,
    values: readStringArray(payload.attribute_values),
  }
}

function parseContactCustomAttributeDefinitionsResponse(payload: unknown) {
  if (!Array.isArray(payload)) {
    throw new ChatwootClientRequestError(
      'Chatwoot custom attribute definitions lookup returned an unexpected response shape.',
    )
  }

  return payload.flatMap((definition) => {
    if (!isPlainObject(definition)) {
      throw new ChatwootClientRequestError(
        'Chatwoot custom attribute definition returned an invalid payload.',
      )
    }

    const key = readString(definition.attribute_key)

    if (!key) {
      throw new ChatwootClientRequestError(
        'Chatwoot custom attribute definition returned an invalid payload.',
      )
    }

    return REQUIRED_PORTAL_CONTACT_CUSTOM_ATTRIBUTE_KEYS.has(key)
      ? [mapContactCustomAttributeDefinition(definition)]
      : []
  })
}

function buildContactCustomAttributeDefinitionPayload(
  definition: DesiredPortalContactCustomAttributeDefinition,
) {
  return {
    custom_attribute_definition: {
      attribute_display_name: definition.displayName,
      attribute_display_type: definition.displayType,
      attribute_key: definition.key,
      attribute_model: PORTAL_CONTACT_CUSTOM_ATTRIBUTE_MODEL,
      ...(definition.values ? { attribute_values: definition.values } : {}),
    },
  }
}

function contactCustomAttributeDefinitionNeedsUpdate({
  desired,
  existing,
}: {
  desired: DesiredPortalContactCustomAttributeDefinition
  existing: ChatwootContactCustomAttributeDefinition
}) {
  if (
    existing.displayName !== desired.displayName ||
    existing.displayType !== desired.displayType
  ) {
    return true
  }

  if (!desired.values) {
    return false
  }

  return (
    existing.values.length !== desired.values.length ||
    existing.values.some((value, index) => value !== desired.values?.[index])
  )
}

export function createChatwootCustomAttributesClient({
  assertAccountConfigured,
  requestJson,
}: CreateChatwootCustomAttributesClientOptions) {
  return {
    async ensurePortalContactCustomAttributeDefinitions(): Promise<ChatwootPortalContactCustomAttributeDefinitionsResult> {
      const resolvedConfig = assertAccountConfigured()
      const requestUrl = new URL(
        `/api/v1/accounts/${resolvedConfig.accountId}/custom_attribute_definitions`,
        resolvedConfig.baseUrl,
      )

      requestUrl.searchParams.set(
        'attribute_model',
        PORTAL_CONTACT_CUSTOM_ATTRIBUTE_MODEL,
      )

      const existingDefinitions =
        parseContactCustomAttributeDefinitionsResponse(
          await requestJson(
            requestUrl,
            'Chatwoot custom attribute definitions lookup is unavailable.',
          ),
        )
      const existingByKey = new Map(
        existingDefinitions.map((definition) => [definition.key, definition]),
      )
      const result: ChatwootPortalContactCustomAttributeDefinitionsResult = {
        created: [],
        unchanged: [],
        updated: [],
      }

      for (const desired of REQUIRED_PORTAL_CONTACT_CUSTOM_ATTRIBUTE_DEFINITIONS) {
        const existing = existingByKey.get(desired.key)
        const body = buildContactCustomAttributeDefinitionPayload(desired)

        if (!existing) {
          const createUrl = new URL(
            `/api/v1/accounts/${resolvedConfig.accountId}/custom_attribute_definitions`,
            resolvedConfig.baseUrl,
          )

          mapContactCustomAttributeDefinition(
            await requestJson(
              createUrl,
              'Chatwoot custom attribute definition create is unavailable.',
              {
                body,
                method: 'POST',
              },
            ),
          )
          result.created.push(desired.key)
          continue
        }

        if (
          !contactCustomAttributeDefinitionNeedsUpdate({
            desired,
            existing,
          })
        ) {
          result.unchanged.push(desired.key)
          continue
        }

        const updateUrl = new URL(
          `/api/v1/accounts/${resolvedConfig.accountId}/custom_attribute_definitions/${existing.id}`,
          resolvedConfig.baseUrl,
        )

        mapContactCustomAttributeDefinition(
          await requestJson(
            updateUrl,
            'Chatwoot custom attribute definition update is unavailable.',
            {
              body,
              method: 'PATCH',
            },
          ),
        )
        result.updated.push(desired.key)
      }

      return result
    },
  }
}
