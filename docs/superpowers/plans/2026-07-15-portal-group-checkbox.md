# F-CHAT-012 Portal Group Checkbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let every portal-enabled ordinary Chatwoot contact open chat without
an explicit type value, while requiring an explicit `portal_is_group=true`
checkbox only for group contacts and preserving a distinct customer-facing
configuration error.

**Architecture:** Keep Chatwoot contact attributes behind the existing portal
backend authority boundary. Replace the retired `portal_contact_type` runtime
reader and provisioned list definition with a boolean `portal_is_group`
definition. Missing/false means `person`, true means `group`, and any
non-boolean value fails closed. Preserve backend error codes through the
frontend bootstrap state, but do not add a browser API, portal DB migration,
request-time lookup, or compatibility reader.

**Tech Stack:** TypeScript 6, Fastify 5, React 19, Chatwoot account API,
PostgreSQL/Drizzle test harness, Vitest 4, Playwright 1.59, pnpm 10.

## Global Constraints

- Approved design:
  `docs/superpowers/specs/2026-07-15-portal-group-checkbox-design.md`.
- Finding: `docs/findings/F-CHAT-012-chat-unavailable-after-code-login.md`.
- Work only on `fix/chat-unavailable-after-code-login` until the verified local
  merge step.
- `portal_enabled=true` remains the mandatory access gate. A contact does not
  become portal-eligible merely because an absent group flag defaults to
  `person`.
- `portal_is_group` accepts only actual booleans. `undefined`, `null`, and
  `false` mean `person`; `true` means `group`; strings and numbers fail closed.
- Remove the `portal_contact_type` reader, writer, provisioning requirement,
  active test fixture, and active operations instruction in this scope. Do not
  add a compatibility fallback.
- Keep `portal_client_group_contact_ids`, `portal_enabled`, and `curator_name`
  behavior unchanged.
- Do not change email-code authentication, session issuance, legal acceptance,
  password setup, the browser chat API shape, Chatwoot core, or portal DB
  schema.
- Add no per-login, per-request, per-thread, or per-message read/write/call.
  Keep group lookup bounded by the existing maximum of 20 configured IDs.
- Do not add a tenant-wide or account-wide runtime contact scan, polling loop,
  retry fan-out, or migration job.
- Do not log contact email, name, message content, attribute values, or other
  customer-identifying data while classifying the failure.
- Production definition creation, contact edits, deployment, smoke tests, and
  retired-definition deletion are a separate operator gate. Do not perform any
  production mutation without a fresh explicit user approval.
- Do not start the Deep audit in this plan. Deep remains blocked until the user
  explicitly authorizes it after F-CHAT-012 is closed.
- Use `apply_patch` for source and documentation edits. Preserve unrelated or
  unclear worktree changes.
- Follow TDD for changed behavior: establish the failing assertion first,
  observe the expected failure, then write the minimum implementation.
- Use cost-aware execution: one sequential implementer, targeted checks after
  each slice, and one independent high-risk review at final closure. Do not
  start a six-worker audit fan-out or duplicate review passes unless a
  Critical/Important review result requires revalidation.

---

## Error Contract

Use these exact backend configuration codes after the cutover:

| Code                                      | Meaning                                                               |
| ----------------------------------------- | --------------------------------------------------------------------- |
| `portal_contact_disabled`                 | the linked person's `portal_enabled` is absent, non-boolean, or false |
| `portal_group_contact_disabled`           | a confirmed group has `portal_enabled=false`                          |
| `portal_client_group_contact_ids_invalid` | a person's bounded group ID list is invalid                           |
| `portal_is_group_invalid`                 | `portal_is_group` contains a non-boolean value                        |
| `portal_person_contact_expected`          | the linked customer contact is flagged as a group                     |
| `portal_group_flag_required`              | a referenced group contact lacks `portal_is_group=true`               |
| `portal_contact_missing`                  | the tenant-scoped linked Chatwoot contact cannot be resolved          |

The frontend maps these codes to
`contact_configuration_invalid`. Network failures, unrecognized errors, and
upstream failures remain `chatwoot_unavailable`.

---

### Task 1: Establish The Failing Backend Regression Contract

**Files:**

- Modify: `backend/src/modules/chat-threads/contactAttributes.test.ts`
- Modify: `backend/src/modules/chat-threads/service.testSupport.ts`
- Modify: `backend/src/modules/chat-threads/service.test.ts`
- Modify: `backend/src/modules/chat-threads/app-integration.test.ts`
- Modify: `backend/src/test/passwordlessLoginTestHelpers.ts`
- Modify: `backend/src/app-passwordless-login.integration.test.ts`

**Interfaces:**

- Input: Chatwoot `custom_attributes`, the existing tenant-scoped contact link,
  and the normal email-code session cookie.
- Output: derived `person`/`group` authority, thread list response, and private
  `conversation_missing` snapshot.
- Invariant: ordinary person fixtures deliberately omit `portal_is_group`;
  group fixtures explicitly set it to `true`.

- [ ] **Step 1: Add unit cases for the new boolean contract**

Replace old type-list cases in `contactAttributes.test.ts` with assertions
equivalent to:

```ts
it.each([
  ['absent', undefined, 'person'],
  ['false', false, 'person'],
  ['true', true, 'group'],
] as const)(
  'derives %s portal contacts from the group flag',
  (_, value, type) => {
    expect(
      parsePortalContactAttributes({
        portal_enabled: true,
        ...(value === undefined ? {} : { portal_is_group: value }),
      }),
    ).toMatchObject({ enabled: true, type })
  },
)

it.each(['true', 'false', 0, 1, [], {}])(
  'rejects a non-boolean portal_is_group value: %j',
  (portalIsGroup) => {
    expect(() =>
      parsePortalContactAttributes({
        portal_enabled: true,
        portal_is_group: portalIsGroup,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'portal_is_group_invalid',
        statusCode: 403,
      }),
    )
  },
)
```

Keep the group ID limit/malformed-value tests and add exact assertion coverage
for:

```ts
portal_person_contact_expected
portal_group_flag_required
portal_contact_disabled
portal_group_contact_disabled
```

- [ ] **Step 2: Make service fixtures express the new default explicitly**

In `service.testSupport.ts`, make the person fixture omit the new flag and make
the group fixture include it:

```ts
// linked ordinary customer
customAttributes: {
  portal_client_group_contact_ids: groupContactIds,
  portal_enabled: true,
}

// referenced group
customAttributes: {
  portal_enabled: true,
  portal_is_group: true,
}
```

In `service.test.ts`:

- change the current-contact-is-group expectation to
  `portal_person_contact_expected`;
- add/retain a case proving a referenced contact without `portal_is_group=true`
  is skipped and never exposed as a group thread;
- retain the fail-closed disabled-person case and the bounded lookup
  assertions.

- [ ] **Step 3: Turn the app integration fixture into the core regression**

In `app-integration.test.ts`, remove `portal_contact_type` from contact `44`,
set `portal_is_group: true` only on contact `154`, and keep the existing
assertions that `/api/chat/threads` returns and persists both `private:me` and
`group:154`.

This proves that the ordinary linked contact succeeds without any type field,
while group exposure still requires an explicit flag.

- [ ] **Step 4: Extend the passwordless test Chatwoot stub to support contact details**

Extend `ChatwootTestContact`:

```ts
export type ChatwootTestContact = {
  customAttributes?: Record<string, unknown>
  email: string
  id: number
  name: string | null
}
```

Update `createChatwootFetchWithContacts` so `/contacts/search?q=...` preserves
its existing behavior and `/contacts/:id` returns:

```ts
{
  payload: {
    custom_attributes: contact.customAttributes ?? {},
    email: contact.email,
    id: contact.id,
    name: contact.name,
    phone_number: null,
  },
}
```

Return the current JSON 404 shape when the requested ID is absent. Do not add
fallback contacts or cross-tenant lookup behavior.

- [ ] **Step 5: Extend first-access integration through chat bootstrap**

In the existing test
`accepts legal continuation and creates a passwordless portal user session for a Chatwoot contact`,
seed contact `77` with only:

```ts
customAttributes: {
  portal_enabled: true,
}
```

After the legal response, extract the normal customer session cookie and call:

```ts
GET /api/chat/threads
GET /api/chat/messages?threadId=private%3Ame
```

Assert the thread response is `200` with `activeThreadId: 'private:me'` and a
private thread. Assert the messages response is `200` and matches:

```ts
{
  activeThread: { id: 'private:me', type: 'private' },
  reason: 'conversation_missing',
  result: 'not_ready',
}
```

- [ ] **Step 6: Run the red backend contract**

Run:

```bash
pnpm --dir backend exec vitest run --no-file-parallelism \
  src/modules/chat-threads/contactAttributes.test.ts \
  src/modules/chat-threads/service.test.ts \
  src/modules/chat-threads/app-integration.test.ts \
  src/app-passwordless-login.integration.test.ts
```

Expected before implementation: failures show that an absent
`portal_is_group` is still rejected through `portal_contact_type_invalid`, and
that `portal_is_group=true` is not yet recognized as a group. Unexpected
database, session, or tenant failures must be diagnosed before proceeding.

Do not commit the intentionally red state.

---

### Task 2: Implement The Backend Contact Authority Cutover

**Files:**

- Modify: `backend/src/modules/chat-threads/contactAttributes.ts`
- Modify: `backend/src/modules/chat-threads/service.ts`
- Modify: `backend/src/integrations/chatwoot/contactLookup.test.ts`
- Modify: `backend/src/modules/chat-messages/service.attachment-proxy.test.ts`
- Modify: `backend/src/modules/chat-notifications/recipientResolver.test.ts`
- Modify: `backend/src/modules/chat-threads/service.info.test.ts`
- Modify: `backend/src/modules/chatwoot-webhooks/service.typing.test.ts`
- Test files already modified in Task 1.

**Interfaces:**

- `parsePortalContactAttributes(customAttributes)` continues to return
  `{ enabled, groupContactIds, type }` to avoid widening downstream runtime
  interfaces.
- `assertPortalPersonContactEnabled` and
  `assertPortalGroupContactEnabled` remain the sole contact-authority guards.
- No route response shape, DB schema, external call count, or loop bound
  changes.

- [ ] **Step 1: Replace the list reader with a strict boolean reader**

Delete `readPortalContactType` and add:

```ts
function readPortalIsGroup(value: unknown) {
  if (value === undefined || value === null || value === false) {
    return false
  }

  if (value === true) {
    return true
  }

  throw createContactConfigurationError('portal_is_group_invalid')
}
```

Derive the existing internal type without reading the retired key:

```ts
type: readPortalIsGroup(attributes.portal_is_group) ? 'group' : 'person'
```

- [ ] **Step 2: Give person/group mismatches distinct codes**

Use these exact checks:

```ts
if (attributes.type !== 'person') {
  throw createContactConfigurationError('portal_person_contact_expected')
}

if (attributes.type !== 'group') {
  throw createContactConfigurationError('portal_group_flag_required')
}
```

Keep `portal_contact_disabled` and `portal_group_contact_disabled` behavior
unchanged after type validation.

- [ ] **Step 3: Update the bounded group-list skip policy**

In `service.ts`, make only bad referenced-group configuration skippable:

```ts
function isSkippableGroupListConfigurationError(error: unknown) {
  return (
    error instanceof ApiError &&
    (error.code === 'portal_group_contact_disabled' ||
      error.code === 'portal_group_flag_required' ||
      error.code === 'portal_contact_disabled' ||
      error.code === 'portal_is_group_invalid')
  )
}
```

Do not add `portal_person_contact_expected`: a linked customer flagged as a
group must fail the whole bootstrap rather than silently becoming a person.

- [ ] **Step 4: Remove the retired key from remaining runtime-related fixtures**

For every ordinary-person fixture in the files listed for this task, remove
`portal_contact_type` and leave `portal_is_group` absent. For every fixture
that intentionally represents a group, replace the old type with:

```ts
portal_is_group: true
```

Do not set `portal_is_group: false` on ordinary fixtures; omission is the
incident regression that must remain covered.

- [ ] **Step 5: Re-run focused backend tests**

Run:

```bash
pnpm --dir backend exec vitest run --no-file-parallelism \
  src/modules/chat-threads/contactAttributes.test.ts \
  src/modules/chat-threads/service.test.ts \
  src/modules/chat-threads/service.info.test.ts \
  src/modules/chat-threads/app-integration.test.ts \
  src/modules/chat-messages/service.attachment-proxy.test.ts \
  src/modules/chat-notifications/recipientResolver.test.ts \
  src/modules/chatwoot-webhooks/service.typing.test.ts \
  src/integrations/chatwoot/contactLookup.test.ts \
  src/app-passwordless-login.integration.test.ts
```

Expected: all listed files pass; the first-access test reaches
`conversation_missing` with no type field; group lookups remain bounded.

- [ ] **Step 6: Review and checkpoint the backend runtime slice**

Inspect:

```bash
git diff -- backend/src/modules/chat-threads \
  backend/src/modules/chat-messages \
  backend/src/modules/chat-notifications \
  backend/src/modules/chatwoot-webhooks \
  backend/src/integrations/chatwoot/contactLookup.test.ts \
  backend/src/app-passwordless-login.integration.test.ts \
  backend/src/test/passwordlessLoginTestHelpers.ts
git diff --check
```

Verify no access gate was weakened and no extra external call or DB operation
was added. Then commit the cohesive green slice:

```bash
git add backend/src/modules/chat-threads \
  backend/src/modules/chat-messages/service.attachment-proxy.test.ts \
  backend/src/modules/chat-notifications/recipientResolver.test.ts \
  backend/src/modules/chatwoot-webhooks/service.typing.test.ts \
  backend/src/integrations/chatwoot/contactLookup.test.ts \
  backend/src/app-passwordless-login.integration.test.ts \
  backend/src/test/passwordlessLoginTestHelpers.ts
git commit -m "fix(chat): default portal contacts to person"
```

---

### Task 3: Provision The New Chatwoot Checkbox Definition

**Files:**

- Modify: `backend/src/integrations/chatwoot/client.custom-attributes.test.ts`
- Modify: `backend/src/integrations/chatwoot/customAttributesClient.ts`
- Modify: `backend/src/scripts/ensure-tenant-portal-attributes-core.test.ts`
- Modify: `backend/src/modules/tenant-provisioning/service.test.ts`

**Interfaces:**

- `ensurePortalContactCustomAttributeDefinitions()` still returns
  `{ created, unchanged, updated }`.
- The desired key union replaces `portal_contact_type` with
  `portal_is_group`.
- Existing unrelated Chatwoot definitions, including the retired key during
  rollout, are ignored rather than automatically deleted.

- [ ] **Step 1: Change reconciliation tests before production code**

In `client.custom-attributes.test.ts`, expect this desired definition:

```ts
{
  attribute_display_name: 'Это группа',
  attribute_display_type: 'checkbox',
  attribute_key: 'portal_is_group',
  attribute_model: 'contact_attribute',
}
```

The create result must be:

```ts
{
  created: [
    'portal_enabled',
    'portal_is_group',
    'portal_client_group_contact_ids',
    'curator_name',
  ],
  unchanged: [],
  updated: [],
}
```

In the drift test, include:

- an incorrectly typed/display-named `portal_is_group` definition that must be
  patched to the checkbox schema;
- an extra unrelated Chatwoot contact definition that must receive no PATCH or
  DELETE request.

Update provisioning/script result fixtures to list `portal_is_group` in place
of `portal_contact_type`.

- [ ] **Step 2: Observe the red reconciliation tests**

Run:

```bash
pnpm --dir backend exec vitest run --no-file-parallelism \
  src/integrations/chatwoot/client.custom-attributes.test.ts \
  src/scripts/ensure-tenant-portal-attributes-core.test.ts \
  src/modules/tenant-provisioning/service.test.ts
```

Expected before implementation: definition/result assertions fail because the
client still requires the old list key.

- [ ] **Step 3: Replace the desired definition**

In `customAttributesClient.ts`, change the key union and desired model to:

```ts
export type ChatwootPortalContactCustomAttributeKey =
  | 'curator_name'
  | 'portal_client_group_contact_ids'
  | 'portal_enabled'
  | 'portal_is_group'

// Inside REQUIRED_PORTAL_CONTACT_CUSTOM_ATTRIBUTE_DEFINITIONS
{
  displayName: 'Это группа',
  displayType: 'checkbox',
  key: 'portal_is_group',
},
```

Delete the desired `portal_contact_type` list definition entirely. Do not add
automatic deletion logic for existing Chatwoot definitions.

- [ ] **Step 4: Run the green reconciliation tests**

Run the same command from Step 2.

Expected: all three files pass; a missing checkbox is created, schema drift is
repaired, and the legacy extra is untouched.

- [ ] **Step 5: Prove the retired key is gone from active backend/tests**

Run:

```bash
if rg -n "portal_contact_type" backend/src; then
  exit 1
fi
```

Expected: no output and exit `0`.

- [ ] **Step 6: Review and checkpoint the provisioning slice**

Run `git diff --check`, inspect the four files, and commit only after the tests
are green:

```bash
git add backend/src/integrations/chatwoot/client.custom-attributes.test.ts \
  backend/src/integrations/chatwoot/customAttributesClient.ts \
  backend/src/scripts/ensure-tenant-portal-attributes-core.test.ts \
  backend/src/modules/tenant-provisioning/service.test.ts
git commit -m "fix(chat): provision portal group checkbox"
```

---

### Task 4: Preserve Contact Configuration Errors In The Frontend

**Files:**

- Create: `frontend/src/features/chat/pages/chatBootstrapErrorReason.ts`
- Create: `frontend/src/features/chat/pages/chatBootstrapErrorReason.test.ts`
- Modify: `frontend/src/features/chat/types.ts`
- Modify: `frontend/src/features/chat/components/ChatNotReadyState.tsx`
- Modify: `frontend/src/features/chat/pages/chatPageState.ts`
- Modify: `frontend/src/features/chat/pages/useChatThreadSelection.ts`
- Modify: `frontend/src/features/chat/pages/ChatPage.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.test.tsx`

**Interfaces:**

- Input: `ChatApiClientError.code` already returned by the backend.
- Output: an internal `ChatThreadReason` stored on the error state.
- Browser API payloads remain unchanged; classification is local frontend
  state only.

- [ ] **Step 1: Add the classifier unit test first**

Create `chatBootstrapErrorReason.test.ts` and assert every code in the Error
Contract maps to `contact_configuration_invalid`:

```ts
expect(
  getChatBootstrapErrorReason(
    new ChatApiClientError({
      code: 'portal_contact_disabled',
      message: 'configuration',
      statusCode: 403,
    }),
  ),
).toBe('contact_configuration_invalid')
```

Use `it.each` for all seven codes. Add cases proving a status `0` network
error, a `503` upstream error, an `INTERNAL_ERROR`, and a plain `Error` map to
`chatwoot_unavailable`.

- [ ] **Step 2: Change the page test to the approved customer behavior**

Update
`does not fallback to a group thread after backend rejects person contact authority`
so a `403 portal_contact_disabled` response expects:

```text
Чат не подключён
Настройка профиля клиента не завершена. Обратитесь в поддержку.
```

Also assert there is no `Повторить` button, no messages request, and no group
fallback. Add a separate `503`/upstream-error test that expects the existing
`Чат временно недоступен` copy and a visible `Повторить` button.

- [ ] **Step 3: Observe the red frontend tests**

Run:

```bash
pnpm --dir frontend exec vitest run \
  src/features/chat/pages/chatBootstrapErrorReason.test.ts \
  src/features/chat/pages/ChatPage.test.tsx
```

Expected before implementation: the new module/reason does not exist and the
existing page still labels the configuration response as an outage.

- [ ] **Step 4: Implement the classifier**

Add `contact_configuration_invalid` to `ChatThreadReason` and create:

```ts
import { ChatApiClientError } from '../api/chatClient'
import type { ChatThreadReason } from '../types'

const CONTACT_CONFIGURATION_ERROR_CODES = new Set([
  'portal_client_group_contact_ids_invalid',
  'portal_contact_disabled',
  'portal_contact_missing',
  'portal_group_contact_disabled',
  'portal_group_flag_required',
  'portal_is_group_invalid',
  'portal_person_contact_expected',
])

export function getChatBootstrapErrorReason(error: unknown): ChatThreadReason {
  if (
    error instanceof ChatApiClientError &&
    error.code !== undefined &&
    CONTACT_CONFIGURATION_ERROR_CODES.has(error.code)
  ) {
    return 'contact_configuration_invalid'
  }

  return 'chatwoot_unavailable'
}
```

- [ ] **Step 5: Carry the reason through both bootstrap error paths**

Add `errorReason: ChatThreadReason` to the `status: 'error'` variant in
`chatPageState.ts`. In both catches in `useChatThreadSelection.ts`, set:

```ts
errorReason: getChatBootstrapErrorReason(error),
```

Keep the existing error message, cache fallback, offline detection,
unauthorized handling, request cancellation, and selected-thread behavior.

- [ ] **Step 6: Render distinct copy and retry behavior**

Add this entry to `ChatNotReadyState.tsx`:

```ts
contact_configuration_invalid: {
  description:
    'Настройка профиля клиента не завершена. Обратитесь в поддержку.',
  title: 'Чат не подключён',
},
```

In the `pageState.status === 'error'` branch of `ChatPage.tsx`, use:

```tsx
<ChatNotReadyState
  isUnavailable={pageState.errorReason === 'chatwoot_unavailable'}
  onRetry={() => void loadInitialChat()}
  reason={pageState.errorReason}
/>
```

The normal snapshot-based not-ready branch remains unchanged.

- [ ] **Step 7: Run focused frontend verification**

Run:

```bash
pnpm --dir frontend exec vitest run \
  src/features/chat/pages/chatBootstrapErrorReason.test.ts \
  src/features/chat/pages/ChatPage.test.tsx
pnpm --dir frontend typecheck
```

Expected: classifier and page tests pass, configuration has no retry CTA,
upstream failure retains retry, and TypeScript accepts every state variant.

- [ ] **Step 8: Review and checkpoint the frontend slice**

Inspect the exact frontend diff and verify no auth/session/offline path was
changed. Run `git diff --check`, then commit:

```bash
git add frontend/src/features/chat
git commit -m "fix(chat): show contact configuration failures"
```

---

### Task 5: Add The Browser Email-Code Regression

**Files:**

- Modify: `tests/e2e/support/chatwoot.ts`
- Create: `tests/e2e/chat-code-login-bootstrap.spec.ts`

**Interfaces:**

- Uses only local Chatwoot, Mailpit, portal frontend/backend, and isolated
  portal PostgreSQL described by the existing E2E environment.
- Creates one uniquely named local Chatwoot contact with
  `portal_enabled=true` and no `portal_is_group`.
- Proves email code -> legal acceptance -> authenticated private chat
  bootstrap in a real browser.

- [ ] **Step 1: Make the local Chatwoot helper accept custom attributes safely**

Extend the helper input:

```ts
customAttributes?: Record<string, unknown>
```

Send it as `custom_attributes` in the contact POST body. Before the mutating
request, parse `E2E_CHATWOOT_BASE_URL` and reject hosts other than loopback
local development hosts (`127.0.0.1`, `localhost`, or the bracketed IPv6 host
`[::1]`). Never print the API token or `.env` contents.

- [ ] **Step 2: Create the focused browser scenario**

The new spec must:

1. Create a unique `@example.test` contact with:

   ```ts
   customAttributes: {
     portal_enabled: true
   }
   ```

2. Open `/auth/login`, enter email, and click `Получить код`.
3. Read subject `Код входа в Client Portal` from local Mailpit.
4. Fill the six `Код из письма` controls and click `Войти`.
5. On first access, check both legal-consent checkboxes and click
   `Продолжить`.
6. Assert URL `/app/chat`, heading `Личный чат`, and the supported
   `Переписка пока не создана` state.
7. Assert neither `Чат временно недоступен` nor `Чат не подключён` is visible.

Use the existing `waitForMailpitCode` helper and the same OTP accessible labels
as the current auth tests. Do not revive removed registration routes.

- [ ] **Step 3: Run the focused local browser test**

Run only after confirming the local services and loopback Chatwoot preflight:

```bash
pnpm exec playwright test \
  tests/e2e/chat-code-login-bootstrap.spec.ts \
  --project=chromium
```

Expected: `1 passed`. The test must prove the no-group-flag contact reaches the
private chat state.

If a required local service is genuinely unavailable, record the exact
service/command/error and the next action. This browser regression is a merge
gate for F-CHAT-012; do not silently omit it or replace it with a manual claim.

- [ ] **Step 4: Review and checkpoint the browser safety net**

Run:

```bash
pnpm exec prettier --check \
  tests/e2e/support/chatwoot.ts \
  tests/e2e/chat-code-login-bootstrap.spec.ts
git diff --check
```

Then commit the green focused safety net:

```bash
git add tests/e2e/support/chatwoot.ts \
  tests/e2e/chat-code-login-bootstrap.spec.ts
git commit -m "test(chat): cover code-login person bootstrap"
```

---

### Task 6: Update Active Operations Guidance And The Open Finding

**Files:**

- Modify: `docs/operations/local-cross-tenant-test-data.md`
- Modify: `docs/operations/mt-10-deployment-runbooks.md`
- Modify: `docs/findings/F-CHAT-012-chat-unavailable-after-code-login.md`

**Interfaces:**

- Active operator docs teach only the new checkbox model.
- The finding remains `open` until production cutover and customer-path smoke
  complete.
- Historical design context may still name the retired field when explaining
  the incident; active setup instructions may not.

- [ ] **Step 1: Rewrite local contact setup guidance**

Update terminology, attribute tables, Rails/local helper examples, validation
instructions, and troubleshooting rows so they state:

```text
ordinary customer: portal_enabled=true; portal_is_group absent/false
group contact:      portal_enabled=true; portal_is_group=true
invalid flag:       portal_is_group_invalid
wrong group config: portal_group_flag_required
```

Keep the existing group ID limit and the fact that
`portal_client_group_contact_ids` lives on the ordinary customer contact.

- [ ] **Step 2: Update tenant provisioning/deployment guidance**

Replace the required definition list with:

```text
portal_enabled, portal_is_group, portal_client_group_contact_ids, curator_name
```

Add a bounded cutover note in `mt-10-deployment-runbooks.md`:

1. run the updated ensure-attributes command once per selected tenant;
2. set the checkbox only on the already-known configured group contacts;
3. do not deploy the new runtime until those group flags are ready;
4. verify ordinary and group chat after deploy;
5. delete the old definition only after successful smoke.

- [ ] **Step 3: Record the confirmed root cause without customer data**

Keep finding status `open`, but change confidence/evidence/fix summary to state
that the production failure was caused by an eligible ordinary contact missing
the formerly required person type. Point to the approved design and automated
regression paths. Do not include the affected email, name, tenant secrets, or
message data.

- [ ] **Step 4: Verify active docs contain no retired instruction**

Run:

```bash
if rg -n "portal_contact_type" \
  docs/operations/local-cross-tenant-test-data.md \
  docs/operations/mt-10-deployment-runbooks.md; then
  exit 1
fi
pnpm exec prettier --check \
  docs/operations/local-cross-tenant-test-data.md \
  docs/operations/mt-10-deployment-runbooks.md \
  docs/findings/F-CHAT-012-chat-unavailable-after-code-login.md
git diff --check
```

Expected: no retired-key matches in active operations docs; formatting and
whitespace checks pass.

- [ ] **Step 5: Checkpoint the operations/finding update**

```bash
git add docs/operations/local-cross-tenant-test-data.md \
  docs/operations/mt-10-deployment-runbooks.md \
  docs/findings/F-CHAT-012-chat-unavailable-after-code-login.md
git commit -m "docs(chat): document portal group checkbox rollout"
```

Do not delete the finding and do not claim production closure in this task.

---

### Task 7: Complete High-Risk Review, Verification, Work Log, And Local Merge

**Files:**

- Modify after all gates pass: `docs/roadmap/work-log.md`
- Review all files changed by Tasks 1-6.

**Interfaces:**

- Produces a reviewed, green branch and a local `main` containing the code-ready
  fix.
- Does not deploy, push, edit production Chatwoot contacts, or close the
  production finding.

- [ ] **Step 1: Run independent high-risk code review**

Invoke `superpowers:requesting-code-review`. Give the reviewer the approved
design, this plan, and the diff from `fe5a183` to branch HEAD. Require focused
review of:

- `portal_enabled` access preservation;
- strict boolean parsing and fail-closed behavior;
- group exposure and bounded lookup behavior;
- tenant/contact/session authority boundaries;
- frontend configuration-vs-outage classification;
- local-only E2E mutation guard;
- absence of old-key runtime compatibility.

Fix every in-scope Critical/Important finding, rerun its targeted test, and
request independent re-review for any Critical/Important change. Record an
adjacent out-of-scope risk in `docs/findings/` rather than silently widening
the fix.

- [ ] **Step 2: Run full automated gates**

Run:

```bash
pnpm --dir backend test
pnpm --dir frontend test
pnpm lint
pnpm build
pnpm exec playwright test \
  tests/e2e/chat-code-login-bootstrap.spec.ts \
  --project=chromium
git diff --check
```

Expected: every command exits `0`; the focused browser test reports `1 passed`.
No failing gate may be described as successful or ignored before merge.

- [ ] **Step 3: Run contract and load-regression checks**

Run:

```bash
if rg -n "portal_contact_type" backend/src frontend/src tests/e2e \
  docs/operations; then
  exit 1
fi
rg -n "portal_is_group" backend/src tests/e2e docs/operations
git status --short --branch
```

Manually confirm from the diff that:

- no new DB migration/table/index exists;
- no new external call, DB call, loop, poll, retry, or fan-out exists;
- the existing 20-ID bound remains intact;
- no PII or secret entered source, tests, docs, or command output.

- [ ] **Step 4: Update the durable code baseline only after green closure**

In `docs/roadmap/work-log.md`:

- replace the old provisioning attribute list with
  `portal_enabled`, `portal_is_group`,
  `portal_client_group_contact_ids`, and `curator_name`;
- state briefly that ordinary enabled contacts default to person and only
  groups require the explicit checkbox;
- replace the single stale `Recommended Next Step` block with:

```markdown
## Recommended Next Step

- Complete the operator-gated production rollout for F-CHAT-012, verify an
  ordinary email-code login plus known group chats, and only then close the
  finding. Do not start Deep without explicit user approval.
```

Run:

```bash
pnpm exec prettier --check docs/roadmap/work-log.md
if rg -n "portal_contact_type" docs/roadmap/work-log.md; then
  exit 1
fi
git diff --check
git add docs/roadmap/work-log.md
git commit -m "docs(chat): record group checkbox baseline"
```

- [ ] **Step 5: Verify exact branch contents before integration**

Run:

```bash
git status --short --branch
git log --oneline --decorate fe5a183..HEAD
git diff --stat fe5a183..HEAD
git diff --check fe5a183..HEAD
```

Expected: clean `fix/chat-unavailable-after-code-login`, only F-CHAT-012 scope,
and all planned commits present.

- [ ] **Step 6: Perform the already-authorized local merge**

Invoke `superpowers:finishing-a-development-branch` and use the local merge
path. Do not push or deploy. With a clean unchanged `main`, run:

```bash
git checkout main
git merge --ff-only fix/chat-unavailable-after-code-login
git status --short --branch
git log --oneline --decorate -8
```

Expected: clean local `main` at the verified branch tip. If fast-forward is no
longer possible or unrelated changes appeared, stop for ownership review; do
not force, reset, or overwrite them.

Report that the code is merged locally but the finding remains open pending
the separately approved production rollout.

---

### Task 8: Operator-Gated Production Cutover And Finding Closure

**Files after successful production verification:**

- Delete:
  `docs/findings/F-CHAT-012-chat-unavailable-after-code-login.md`
- Modify: `docs/roadmap/work-log.md`

**Interfaces:**

- Consumes the merged, reviewed release candidate and an explicitly selected
  list of active tenants/known group contacts.
- Mutates Chatwoot definitions/contact flags and deploy state only after a
  fresh explicit user approval.
- Produces verified production person/group chat behavior and closes the
  finding in a separate docs-only closure branch.

- [ ] **Step 1: Stop at the production approval gate**

Present the exact tenants, known group contacts, release commit, commands, smoke
accounts, rollback point, and expected results without exposing secrets or PII.
Ask for explicit permission. If permission is absent, stop here with
F-CHAT-012 open. Do not start Deep.

- [ ] **Step 2: Reconcile the checkbox definition before runtime deploy**

From the reviewed release checkout and approved production environment, run
once for each explicitly selected tenant:

Set `APPROVED_TENANT_SLUG` to one exact slug from the user-approved rollout
list, then run:

```bash
test -n "$APPROVED_TENANT_SLUG"
pnpm --dir backend tenant:chatwoot:ensure-portal-attributes -- \
  --tenant="$APPROVED_TENANT_SLUG"
```

Expected result for `portal_is_group`: `created`, `updated`, or `unchanged` as
appropriate. Review output without printing tokens or environment contents.
This command must run before the backend process is replaced.

- [ ] **Step 3: Flag only known group contacts**

In the Chatwoot admin UI, set `Это группа` on the already-known group contacts
referenced by the controlled group configuration. Leave ordinary contacts
untouched. Do not perform an account-wide runtime scan or guess from names.

Verify each known group has both:

```text
portal_enabled = true
portal_is_group = true
```

- [ ] **Step 4: Deploy and run bounded production smoke**

Deploy the exact reviewed commit through the existing production runbook.
For each affected tenant, verify:

- one approved ordinary customer completes email-code login and reaches
  private chat without `portal_is_group`;
- each known group remains visible only to an allowed person contact;
- a real retryable upstream failure still renders the unavailable state;
- logs contain no new PII and show no repeated/fan-out bootstrap behavior.

If smoke fails, stop rollout, preserve evidence, and use the runbook rollback
point. Do not delete the old definition.

- [ ] **Step 5: Retire the old Chatwoot definition after successful smoke**

Only after every selected tenant passes, delete the retired
`portal_contact_type` definition through the approved Chatwoot operator UI.
Recheck one ordinary and one group chat. No portal DB migration is required.

- [ ] **Step 6: Perform the required docs-preservation audit**

Create `docs/f-chat-012-production-closure` from the current clean `main`, then
run before deleting the finding:

```bash
git status --short --branch
git log --all -- \
  docs/findings/F-CHAT-012-chat-unavailable-after-code-login.md
rg -n "F-CHAT-012|chat-unavailable-after-code-login" docs
```

Confirm the approved design and implementation plan remain as the historical
source, and that production acceptance actually satisfies the finding.

- [ ] **Step 7: Close the finding and restore one current next step**

Delete the finding file. In `docs/roadmap/work-log.md`, keep the implemented
checkbox baseline and replace the sole `Recommended Next Step` with:

```markdown
## Recommended Next Step

- Await explicit user approval before starting the deferred Deep security
  audit; do not start it automatically after F-CHAT-012 closure.
```

Run:

```bash
pnpm exec prettier --check docs/roadmap/work-log.md \
  docs/superpowers/specs/2026-07-15-portal-group-checkbox-design.md \
  docs/superpowers/plans/2026-07-15-portal-group-checkbox.md
git diff --check
git status --short --branch
```

- [ ] **Step 8: Commit and locally merge the docs-only closure**

```bash
git add docs/roadmap/work-log.md
git add -u docs/findings/F-CHAT-012-chat-unavailable-after-code-login.md
git commit -m "docs(chat): close F-CHAT-012"
git checkout main
git merge --ff-only docs/f-chat-012-production-closure
git status --short --branch
```

Do not push and do not start Deep. Report the exact production smoke outcome,
the deleted finding path, the preserved design/plan paths, and the clean local
main commit.

---

## Final Acceptance Checklist

- [ ] An ordinary contact with `portal_enabled=true` and no
      `portal_is_group` completes email-code login and opens private chat.
- [ ] `portal_is_group=false` behaves as person and `true` behaves as group.
- [ ] Non-boolean group flags fail closed with `portal_is_group_invalid`.
- [ ] A linked customer flagged as group fails with
      `portal_person_contact_expected`.
- [ ] A referenced contact is exposed as a group only with both required true
      booleans.
- [ ] `portal_enabled` remains mandatory and unchanged.
- [ ] Other portal contact attributes remain unchanged.
- [ ] Frontend configuration copy is distinct and non-retryable; a real
      upstream failure remains retryable.
- [ ] No active backend/test/E2E/operations/work-log reference requires the
      retired key.
- [ ] No portal DB migration, request-time scan, extra call, polling, or
      unbounded work was added.
- [ ] Targeted tests, full backend/frontend tests, typecheck, lint, build,
      Playwright, formatting, and whitespace checks pass.
- [ ] Independent high-risk review has no unresolved in-scope
      Critical/Important result.
- [ ] Local `main` contains the reviewed code-ready fix before any production
      action.
- [ ] Production rollout and finding deletion occur only after explicit
      approval and successful bounded smoke.
- [ ] Deep does not start without a later explicit user instruction.
