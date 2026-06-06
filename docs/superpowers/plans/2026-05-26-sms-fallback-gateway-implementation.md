# SMS Fallback Gateway Implementation Plan

## Current Preservation Status

Status: deferred, not implemented.

This plan is preserved because the SMS fallback gateway remains a possible
future feature and this file contains useful task decomposition. Do not execute
it blindly: if SMS fallback is reopened, first run a fresh feature intake and
update the plan against the current offline-first PWA, chat runtime,
multi-tenant and production operations baseline.

> **Для агентных исполнителей:** ОБЯЗАТЕЛЬНЫЙ SUB-SKILL: используйте `superpowers:subagent-driven-development` (recommended) или `superpowers:executing-plans`, чтобы выполнять этот план task-by-task. Steps используют checkbox (`- [ ]`) syntax для tracking.

**Goal:** реализовать аварийный двусторонний SMS fallback для `private:me` сразу после закрытия Offline-first PWA MVP: клиент открывает native SMS из offline-first PWA, Android SMS Gateway доставляет входящие SMS в отдельный Chatwoot SMS Fallback inbox, а ответы агента из этого inbox уходят клиенту обратно через SMS.

**Architecture:** SMS fallback остается отдельным backend-модулем `sms-fallback`, отдельным Chatwoot API Channel inbox и отдельной Chatwoot conversation history. Browser получает только безопасную metadata для native `sms:` link и никогда не получает Chatwoot/gateway credentials. MVP routes by tenant-owned gateway + verified webhook + known Chatwoot `phone_number` + active portal user link; `smsCode` не используется. Frontend SMS cache and offline entrypoints reuse the completed Offline-first PWA MVP boot coordinator, IndexedDB wrapper, scoped tenant/user identity and cached `private:me` read model.

**Tech Stack:** TypeScript, Fastify, Drizzle/Postgres, Vitest, React 19, Vite, Testing Library, Playwright, Chatwoot Application API, SMSGate Android Gateway Private Server.

---

## Source Documents

- Spec: `docs/superpowers/specs/2026-05-26-sms-fallback-gateway-design.md`
- Stable architecture: `docs/architecture/overview.md`
- Roadmap baseline: `docs/roadmap/implementation-plan.md`
- Current repository rule: `AGENTS.md`

## Execution Rules

- Do not implement this feature on a docs branch or from this preserved plan
  without a fresh feature-intake update.
- Do not start SMS fallback implementation until Offline-first PWA MVP is
  completed, reviewed, tested, checkpointed, and merged into the baseline branch
  used for SMS work.
- SMS fallback must not introduce a second frontend offline storage system.
  Reuse the Offline-first PWA IndexedDB wrapper and scoped tenant/user/thread
  keying.
- SMS fallback must not change the Offline-first PWA outbox semantics. Native
  SMS is a separate emergency path, not a transport for queued PWA messages.
- Start each implementation slice from post-Offline-first `main` in its own
  branch or worktree.
- Required branch order:
  1. post-Offline-first `main` baseline
  2. `feature/sms-gateway-private-spike`
  3. `feature/sms-fallback-bridge`
  4. `feature/sms-fallback-pwa`
  5. `feature/sms-fallback-ops`
- The backend bridge must not start until the SMSGate Private Server gate is closed with a written go/no-go note.
- Keep Chatwoot core external. Do not patch or restart Chatwoot unless a separate explicit operational step requires it.
- `docs/roadmap/work-log.md` is updated only after an implementation slice is complete, reviewed, checked, and accepted as stable baseline.
- After each branch reaches closure, propose a checkpoint commit; do not make WIP commits by default.

## File Structure

### Spike Artifacts

- Create `docs/spikes/2026-05-26-smsgate-private-server.md`: production-mode gateway spike result.
- Create `docs/spikes/2026-05-26-chatwoot-api-channel-status.md`: Chatwoot external delivery status spike result.
- Create `docs/spikes/2026-05-26-native-sms-uri.md`: Android/iOS native `sms:` behavior check.
- Create `tools/sms-fallback-spike/smsgate-webhook-capture.ts`: temporary local capture server for raw SMSGate webhooks.

### Backend

- Modify `backend/src/db/schema.ts`: tenant SMS Chatwoot config and SMS fallback tables.
- Add generated migration under `backend/drizzle/`.
- Create `backend/src/modules/sms-fallback/types.ts`: DTOs, statuses, provider payload types.
- Create `backend/src/modules/sms-fallback/phone.ts`: RU/E.164 normalization and masking.
- Create `backend/src/modules/sms-fallback/phone.test.ts`: exact phone examples from the spec.
- Create `backend/src/modules/sms-fallback/signature.ts`: SMSGate raw-body HMAC verification.
- Create `backend/src/modules/sms-fallback/signature.test.ts`: valid, invalid, stale timestamp cases.
- Create `backend/src/modules/sms-fallback/smsgateClient.ts`: outbound SMSGate REST adapter.
- Create `backend/src/modules/sms-fallback/smsgateClient.test.ts`: deterministic message id and failure mapping.
- Create `backend/src/modules/sms-fallback/chatwootAdapter.ts`: SMS-specific Chatwoot adapter.
- Create `backend/src/modules/sms-fallback/chatwootAdapter.test.ts`: SMS inbox isolation and private note behavior.
- Create `backend/src/modules/sms-fallback/repository.ts`: gateway config, route cache, conversation mapping, webhook delivery, outbound job locking.
- Create `backend/src/modules/sms-fallback/repository.test.ts`: uniqueness, advisory lock, job acquisition, idempotency.
- Create `backend/src/modules/sms-fallback/service.ts`: metadata, inbound SMS, outgoing Chatwoot webhook, status callback orchestration.
- Create `backend/src/modules/sms-fallback/service.test.ts`: fail-closed routing, length limits, job creation, status updates.
- Create `backend/src/modules/sms-fallback/routes.ts`: gateway webhook, Chatwoot SMS webhook, authenticated metadata endpoint.
- Create `backend/src/modules/sms-fallback/routes.test.ts`: auth, raw body, signature, unsupported group route.
- Create `backend/src/modules/sms-fallback/worker.ts`: outbound job processor.
- Create `backend/src/modules/sms-fallback/worker.test.ts`: retry, lock reclaim, deterministic id reuse.
- Modify `backend/src/app.ts`: wire SMS fallback routes and service factories.
- Modify `backend/src/integrations/chatwoot/client.ts`: add contact phone search and private note support if the SMS adapter cannot do it via existing generic request helpers.
- Modify `backend/src/integrations/chatwoot/client.test.ts`: contract tests for the added Chatwoot methods.
- Modify `backend/src/modules/maintenance/cleanup.ts`: prune terminal SMS traces by TTL, never delete Chatwoot-owned history.
- Modify `backend/src/modules/maintenance/cleanup.test.ts`: SMS cleanup coverage.

### Frontend

- Modify `frontend/src/features/chat/types.ts`: SMS fallback metadata and local system marker types.
- Modify `frontend/src/features/chat/api/chatClient.ts`: `getSmsFallbackMetadata(threadId)`.
- Create `frontend/src/features/chat/lib/smsFallbackMetadataCache.ts`: cached public decision by tenant/user/thread using the Offline-first PWA IndexedDB wrapper.
- Create `frontend/src/features/chat/lib/smsFallbackMetadataCache.test.ts`: fresh/stale/enabled/disabled cache behavior.
- Create `frontend/src/features/chat/lib/smsFallbackUri.ts`: native `sms:` URI builder with 500-char body cap.
- Create `frontend/src/features/chat/lib/smsFallbackUri.test.ts`: encoding, no `#CODE`, long draft truncation.
- Create `frontend/src/features/chat/pages/useSmsFallbackMetadata.ts`: fetch, cache, refresh-on-online/resume hook.
- Create `frontend/src/features/chat/pages/useSmsFallbackMetadata.test.tsx`: hook state tests.
- Modify `frontend/src/features/chat/components/MessageComposer.tsx`: offline SMS/call fallback UI using the current draft.
- Modify `frontend/src/features/chat/components/MessageComposer.test.tsx`: SMS/call rendering and click behavior.
- Modify `frontend/src/features/chat/components/ChatTranscript.tsx`: accept local system marker.
- Modify `frontend/src/features/chat/components/chat-transcript/MessageBubble.tsx`: render compact system marker.
- Modify `frontend/src/features/chat/components/ChatTranscript.test.tsx`: marker rendering.
- Modify `frontend/src/features/chat/pages/ChatPage.tsx`: integrate metadata hook, offline state, local marker.
- Modify `frontend/src/features/chat/pages/ChatPage.runtime.test.tsx`: offline/API unavailable behavior.
- Modify `frontend/src/features/chat/pages/ChatPage.test.tsx`: metadata fetch and no-SMS group thread behavior.
- Modify `tests/e2e/chat-read-model.spec.ts`: browser invariant and offline SMS UI coverage.

### Ops Docs

- Create `docs/operations/sms-fallback.md`: setup, monitoring, recovery, secrets, tenant-owned Android/SIM rules.
- Modify `.env.example` only if runtime needs a non-secret public setting or worker tuning setting.
- Modify backend tenant bootstrap/verification scripts only after the schema and manual provisioning contract are stable.

---

## Task 0: Branch And Gate Setup

**Files:**

- Read: `AGENTS.md`
- Read: `docs/roadmap/work-log.md`
- Read: `docs/architecture/overview.md`
- Read: `docs/roadmap/implementation-plan.md`
- Read: `docs/architecture/decisions.md`
- Read: `docs/operations/installed-pwa-smoke.md`

- [ ] **Step 1: Confirm Offline-first PWA MVP baseline exists**

Read `docs/roadmap/work-log.md`, `docs/architecture/decisions.md` and
`docs/architecture/overview.md`. Confirm that the current `main` baseline
includes Offline-first PWA MVP, durable text outbox and the PWA startup/connection
UX decisions.

Expected:

```text
Offline-first PWA MVP is complete, reviewed, tested, checkpointed, and merged
or otherwise explicitly accepted as the baseline for SMS fallback.
```

If this is not true, do not start SMS implementation. Fix the current
Offline-first PWA baseline first or keep this branch docs-only.

- [ ] **Step 2: Start from a clean post-Offline-first `main` worktree**

Run:

```bash
git status --short --branch
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c feature/sms-gateway-private-spike
```

Expected:

```text
## feature/sms-gateway-private-spike
```

If the current worktree is dirty with unrelated changes, create a sibling worktree instead of reusing it.

- [ ] **Step 3: Confirm this scope is approved as the next follow-up slice**

Read the end of `docs/roadmap/work-log.md`. If SMS fallback is not listed as
the recommended next implementation scope, add no code. Ask for explicit
approval or keep this branch docs-only.

- [ ] **Step 4: Keep the implementation branches separate**

Use this branch map during execution:

```text
feature/sms-gateway-private-spike -> gate evidence only
feature/sms-fallback-bridge       -> backend schema, bridge, worker, backend tests
feature/sms-fallback-pwa          -> frontend metadata cache and offline SMS UI
feature/sms-fallback-ops          -> runbook, setup scripts, health checks
```

Expected: no branch contains unrelated feature code.

---

## Task 1: SMSGate Private Server Gate

**Files:**

- Create: `docs/spikes/2026-05-26-smsgate-private-server.md`
- Create: `tools/sms-fallback-spike/smsgate-webhook-capture.ts`

- [ ] **Step 1: Write the capture tool**

Create `tools/sms-fallback-spike/smsgate-webhook-capture.ts`:

```ts
import { createServer } from 'node:http'

const port = Number(process.env.PORT ?? 4477)

createServer((request, response) => {
  const chunks: Buffer[] = []

  request.on('data', (chunk: Buffer) => chunks.push(chunk))
  request.on('end', () => {
    const body = Buffer.concat(chunks)

    console.log(
      JSON.stringify(
        {
          bodyBase64: body.toString('base64'),
          bodyText: body.toString('utf8'),
          headers: request.headers,
          method: request.method,
          url: request.url,
        },
        null,
        2,
      ),
    )

    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ ok: true }))
  })
}).listen(port, () => {
  console.log(`SMSGate webhook capture listening on :${port}`)
})
```

- [ ] **Step 2: Run the capture tool**

Run:

```bash
pnpm exec tsx tools/sms-fallback-spike/smsgate-webhook-capture.ts
```

Expected:

```text
SMSGate webhook capture listening on :4477
```

- [ ] **Step 3: Deploy and connect SMSGate Private Server**

Record the exact deployed mode in `docs/spikes/2026-05-26-smsgate-private-server.md` with this table:

```markdown
| Check                                            | Result                                    |
| ------------------------------------------------ | ----------------------------------------- |
| Private Server URL                               | `<internal URL without secrets>`          |
| Android app version                              | `<version>`                               |
| Android device model                             | `<model>`                                 |
| SIM operator/tariff class                        | `<operator, no full phone if not needed>` |
| External SMSGate cloud account required          | `yes` or `no`                             |
| FCM/Firebase required for outbound commands      | `yes` or `no`                             |
| SSE/private path available for outbound commands | `yes` or `no`                             |
```

The final value for `SSE/private path available for outbound commands` must be `yes` to proceed with production Private Server mode without explicit product acceptance of cloud/FCM dependency.

- [ ] **Step 4: Capture one inbound SMS webhook**

Send a test SMS from a known test phone to the Android gateway SIM.

Record these fields in the spike note:

```markdown
## Inbound Payload

- event name:
- event id field:
- sender phone field:
- receiver/gateway phone field:
- message text field:
- device id field:
- SIM field:
- timestamp field:
- signature header names:
- timestamp header name:
- HMAC input rule confirmed:
```

Expected: one inbound event reaches the capture tool and includes enough information to identify sender phone, event id, message text, device/SIM, and timestamp.

- [ ] **Step 5: Send one outbound SMS by API**

Use the SMSGate REST API from a terminal with throwaway test credentials. Pass a deterministic id:

```json
{
  "id": "sms-fallback-spike-0001",
  "phoneNumbers": ["+79060000000"],
  "message": "SMSGate private server spike"
}
```

Expected: the destination phone receives exactly one visible SMS.

- [ ] **Step 6: Capture outbound status events**

Record status payload fields in the spike note:

```markdown
## Outbound Status Payload

- accepted/queued status field:
- sent status field:
- delivered status field:
- failed status field:
- gateway message id field:
- retry behavior observed:
- duplicate deterministic id behavior:
```

Expected: at least `sent` or `failed` is observable for the deterministic id.

- [ ] **Step 7: Make a gate decision**

End `docs/spikes/2026-05-26-smsgate-private-server.md` with:

```markdown
## Decision

Result: `go` or `no-go`

Reasons:

- Private Server deployment result:
- Android device connection result:
- external cloud/FCM dependency result:
- inbound webhook signature result:
- outbound API/status result:

Bridge assumptions allowed after this spike:

- provider: `smsgate`
- mode allowed for production:
- required webhook headers:
- required outbound API fields:
- required status event names:
```

Expected: bridge implementation starts only when `Result: go`.

---

## Task 2: Chatwoot Status And Native SMS URI Spikes

**Files:**

- Create: `docs/spikes/2026-05-26-chatwoot-api-channel-status.md`
- Create: `docs/spikes/2026-05-26-native-sms-uri.md`

- [ ] **Step 1: Confirm Chatwoot external message status support**

Check official Chatwoot docs first, then `../chatwoot-ce-stable` if docs do not answer the exact API path.

Record this in `docs/spikes/2026-05-26-chatwoot-api-channel-status.md`:

```markdown
# Chatwoot API Channel Status Spike

## Question

Can an external API Channel integration update outgoing provider delivery
status for a Chatwoot message in CE v4.13.0 without Chatwoot core changes?

## Result

Result: `supported` or `unsupported`

## Supported Path

- method:
- URL:
- auth header:
- request body:
- success response:
- failure response:

## Fallback If Unsupported

- store status in portal DB;
- add a private Chatwoot note only on terminal outbound failure;
- do not patch Chatwoot core.
```

Expected: the bridge has one of two exact paths: supported status endpoint or local DB/private-note fallback.

- [ ] **Step 2: Test native `sms:` URI behavior**

On Android Chrome/PWA and iOS Safari/PWA, open these URLs manually from a test page or address bar:

```text
sms:+79991234567
sms:+79991234567?body=%D0%A2%D0%B5%D1%81%D1%82
```

Record this in `docs/spikes/2026-05-26-native-sms-uri.md`:

```markdown
# Native SMS URI Spike

| Platform           | Number prefilled | Body prefilled | User confirmation required | Notes |
| ------------------ | ---------------- | -------------- | -------------------------- | ----- |
| Android Chrome/PWA | yes/no           | yes/no         | yes/no                     |       |
| iOS Safari/PWA     | yes/no           | yes/no         | yes/no                     |       |

Implementation decision:

- use `sms:+number` always;
- append `?body=` only where supported by normal browser URL behavior;
- browser tests assert href only and never attempt to open the OS SMS app.
```

Expected: PWA implementation knows whether body prefill is reliable enough to use. The security decision stays the same: native SMS app confirmation is required.

---

## Task 3: Backend Schema And Migration

**Files:**

- Modify: `backend/src/db/schema.ts`
- Add generated migration: `backend/drizzle/<next>_sms_fallback.sql`
- Test: `backend/src/modules/sms-fallback/repository.test.ts`

- [ ] **Step 1: Write failing repository schema smoke tests**

Create `backend/src/modules/sms-fallback/repository.test.ts` with these first test names:

```ts
import { describe, expect, it } from 'vitest'

describe('sms fallback repository schema', () => {
  it('stores one enabled tenant-owned SMSGate gateway with encrypted credentials', async () => {
    expect(true).toBe(false)
  })

  it('enforces one active SMS fallback conversation for one tenant gateway phone user private thread route', async () => {
    expect(true).toBe(false)
  })

  it('enforces one outbound SMS job per Chatwoot outgoing message id', async () => {
    expect(true).toBe(false)
  })
})
```

Run:

```bash
pnpm --dir backend test -- sms-fallback/repository.test.ts
```

Expected: tests fail because repository and schema do not exist.

- [ ] **Step 2: Add tenant SMS Chatwoot fields**

In `backend/src/db/schema.ts`, extend `portalTenants` with nullable SMS fallback Chatwoot config:

```ts
chatwootSmsFallbackInboxId: integer('chatwoot_sms_fallback_inbox_id'),
chatwootSmsFallbackWebhookSecretCiphertext: text(
  'chatwoot_sms_fallback_webhook_secret_ciphertext',
),
```

Do not overload `chatwootPortalInboxId` or `chatwootWebhookSecretCiphertext`.

- [ ] **Step 3: Add SMS fallback tables**

Add these Drizzle tables to `backend/src/db/schema.ts`:

```text
portal_sms_gateways
portal_sms_phone_routes
portal_sms_fallback_conversations
portal_sms_messages
portal_sms_webhook_deliveries
```

Required constraints:

```text
portal_sms_gateways.public_id unique
portal_sms_gateways.provider in ('smsgate')
portal_sms_gateways.mode in ('private', 'local', 'cloud')
portal_sms_gateways.status in ('enabled', 'disabled', 'error')
portal_sms_phone_routes.status in ('active', 'ambiguous', 'disabled')
portal_sms_fallback_conversations.status in ('active', 'disabled')
portal_sms_messages.direction in ('inbound', 'outbound', 'service')
portal_sms_messages.status in ('queued', 'sending', 'sent', 'delivered', 'failed_retryable', 'failed_terminal', 'abandoned', 'received', 'rejected')
portal_sms_webhook_deliveries.status in ('received', 'processed', 'ignored', 'failed')
```

Required unique indexes:

```text
portal_sms_fallback_conversations:
  tenant_id + gateway_id + normalized_phone + portal_user_id + portal_private_chat_thread_id
  where status = 'active'

portal_sms_messages:
  tenant_id + chatwoot_message_id
  where direction = 'outbound' and chatwoot_message_id is not null

portal_sms_webhook_deliveries:
  tenant_id + provider + event_id
```

Required job columns on `portal_sms_messages`:

```text
gateway_message_id
gateway_message_id_set_at
encrypted_outbound_body_ciphertext
attempts_count
max_attempts
next_attempt_at
processing_token
locked_at
last_error
```

- [ ] **Step 4: Generate the migration**

Run:

```bash
pnpm --dir backend db:generate
```

Expected: one migration file is created under `backend/drizzle/` and includes all schema changes from this task.

- [ ] **Step 5: Implement repository insert/read helpers**

Create `backend/src/modules/sms-fallback/repository.ts` with these exported functions:

```ts
export type SmsFallbackRepository = ReturnType<
  typeof createSmsFallbackRepository
>

export function createSmsFallbackRepository(
  db: DatabaseClient['db'],
  options: { tenantId?: number } = {},
) {
  return {
    createGateway,
    findEnabledGatewayByPublicId,
    upsertPhoneRoute,
    findActiveFallbackConversation,
    createActiveFallbackConversation,
    recordWebhookDelivery,
    createOutboundJob,
    acquireNextOutboundJob,
    markOutboundJobSent,
    markOutboundJobDelivered,
    markOutboundJobFailedRetryable,
    markOutboundJobFailedTerminal,
  }
}
```

Each helper must require an explicit `tenantId` argument or use the repository-scoped `tenantId`. Gateway webhook lookup may omit scoped tenant only for `findEnabledGatewayByPublicId(publicId)` because tenant is derived from the trusted gateway row.

- [ ] **Step 6: Replace the failing tests with real assertions**

The repository tests must assert:

```text
createGateway stores encrypted credential ciphertext fields and public phone fields
duplicate active fallback conversation insert fails or resolves to one row
duplicate outbound job for the same tenant/chatwoot_message_id returns the existing job
acquireNextOutboundJob changes queued -> sending and sets processing_token
terminal statuses are never acquired again
```

Run:

```bash
pnpm --dir backend test -- sms-fallback/repository.test.ts
```

Expected: all repository schema tests pass.

---

## Task 4: Phone Normalization, Public DTOs, And Signature Verification

**Files:**

- Create: `backend/src/modules/sms-fallback/types.ts`
- Create: `backend/src/modules/sms-fallback/phone.ts`
- Create: `backend/src/modules/sms-fallback/phone.test.ts`
- Create: `backend/src/modules/sms-fallback/signature.ts`
- Create: `backend/src/modules/sms-fallback/signature.test.ts`

- [ ] **Step 1: Define public and private types**

Create `backend/src/modules/sms-fallback/types.ts`:

```ts
export const SMS_FALLBACK_TEXT_LIMIT = 500

export type SmsFallbackMetadata =
  | {
      cacheUntil: string
      enabled: true
      gatewayPhoneNumber: string
      knownPhoneMasked: string
      smsUri: string
      targetThreadId: 'private:me'
    }
  | {
      cacheUntil: string
      enabled: false
      reason:
        | 'disabled'
        | 'no_gateway'
        | 'no_sms_inbox'
        | 'no_contact_link'
        | 'no_verified_phone'
        | 'ambiguous_phone'
      supportCallLabel?: string
      supportCallPhoneNumber?: string
    }

export type SmsOutboundJobStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'failed_retryable'
  | 'failed_terminal'
  | 'abandoned'

export type SmsInboundProcessingResult =
  | { status: 'delivered'; chatwootMessageId: number }
  | { reason: string; status: 'ignored' | 'rejected' }
```

- [ ] **Step 2: Write phone tests**

Create `backend/src/modules/sms-fallback/phone.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { maskPhoneForSmsFallback, normalizeRuPhoneToE164 } from './phone.js'

describe('sms fallback phone normalization', () => {
  it.each([
    ['+7 906 129-55-12', '+79061295512'],
    ['7 906 129-55-12', '+79061295512'],
    ['8 906 129-55-12', '+79061295512'],
    ['79061295512', '+79061295512'],
    ['89061295512', '+79061295512'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeRuPhoneToE164(input)).toBe(expected)
  })

  it.each(['', '123', '+1 555 0100', '7906129551x'])(
    'returns null for unsupported phone %s',
    (input) => {
      expect(normalizeRuPhoneToE164(input)).toBeNull()
    },
  )

  it('masks a known phone without leaking the full number', () => {
    expect(maskPhoneForSmsFallback('+79061295512')).toBe('+7 *** ***-55-12')
  })
})
```

- [ ] **Step 3: Implement phone helpers**

Create `backend/src/modules/sms-fallback/phone.ts`:

```ts
export function normalizeRuPhoneToE164(value: string | null | undefined) {
  const digits = (value ?? '').replace(/\D/g, '')

  if (digits.length !== 11) {
    return null
  }

  if (digits.startsWith('8')) {
    return `+7${digits.slice(1)}`
  }

  if (digits.startsWith('7')) {
    return `+${digits}`
  }

  return null
}

export function maskPhoneForSmsFallback(e164Phone: string) {
  const normalized = normalizeRuPhoneToE164(e164Phone)

  if (!normalized) {
    return null
  }

  return `+7 *** ***-${normalized.slice(-4, -2)}-${normalized.slice(-2)}`
}
```

- [ ] **Step 4: Write signature tests**

Create `backend/src/modules/sms-fallback/signature.test.ts` with cases:

```text
valid HMAC over raw body and timestamp returns ok
wrong signature returns false
missing timestamp returns false
timestamp older than 5 minutes returns false
timestamp more than 5 minutes in the future returns false
```

Use the exact SMSGate header names found in Task 1. If Task 1 found different header names than docs, code those names here and reference the spike note in a comment.

- [ ] **Step 5: Implement signature verification**

Create `backend/src/modules/sms-fallback/signature.ts`:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto'

const SMSGATE_SIGNATURE_HEADER = 'x-signature'
const SMSGATE_TIMESTAMP_HEADER = 'x-timestamp'

function readHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
) {
  const value = headers[name] ?? headers[name.toLowerCase()]

  return Array.isArray(value) ? value[0] : value
}

export function verifySmsgateWebhookSignature({
  headers,
  now,
  rawBody,
  secret,
  toleranceMs = 5 * 60 * 1000,
}: {
  headers: Record<string, string | string[] | undefined>
  now: Date
  rawBody: Buffer
  secret: string
  toleranceMs?: number
}): boolean {
  const signature = readHeader(headers, SMSGATE_SIGNATURE_HEADER)
  const timestamp = readHeader(headers, SMSGATE_TIMESTAMP_HEADER)

  if (!signature || !timestamp || !/^\d+$/.test(timestamp)) {
    return false
  }

  const timestampMs = Number(timestamp) * 1000

  if (!Number.isSafeInteger(timestampMs)) {
    return false
  }

  if (Math.abs(now.getTime() - timestampMs) > toleranceMs) {
    return false
  }

  const expectedHex = createHmac('sha256', secret)
    .update(Buffer.concat([rawBody, Buffer.from(timestamp)]))
    .digest('hex')

  const expected = Buffer.from(expectedHex, 'hex')
  const received = Buffer.from(signature, 'hex')

  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  )
}
```

Task 1 must confirm that SMSGate still uses `X-Signature`, `X-Timestamp`, and
`rawBody + timestamp` as the HMAC input. If the spike captures different
headers or signing input, update the constants and tests in this same task.

- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm --dir backend test -- sms-fallback/phone.test.ts sms-fallback/signature.test.ts
```

Expected: all phone and signature tests pass.

---

## Task 5: SMSGate Client

**Files:**

- Create: `backend/src/modules/sms-fallback/smsgateClient.ts`
- Create: `backend/src/modules/sms-fallback/smsgateClient.test.ts`

- [ ] **Step 1: Write SMSGate client tests**

Create tests for:

```text
sends one outbound request with deterministic id
includes default device id when configured
includes default SIM number when configured
maps 2xx API response to accepted
maps timeout/network error to retryable
maps 4xx validation/auth error to terminal
never generates a gateway_message_id internally
```

Use this required call shape:

```ts
await client.sendSms({
  deviceId: 'phone-1',
  message: 'Короткое сообщение',
  messageId: 'sms-fallback:tenant-1:12345',
  phoneNumber: '+79061295512',
  simNumber: 1,
})
```

- [ ] **Step 2: Implement the client interface**

Create `backend/src/modules/sms-fallback/smsgateClient.ts`:

```ts
export type SmsgateSendSmsInput = {
  deviceId: string | null
  message: string
  messageId: string
  phoneNumber: string
  simNumber: number | null
}

export type SmsgateSendSmsResult =
  | { providerStatus: string | null; status: 'accepted' }
  | { error: string; status: 'retryable' | 'terminal' }

export type SmsgateClient = {
  sendSms(input: SmsgateSendSmsInput): Promise<SmsgateSendSmsResult>
}

export function createSmsgateClient(options: {
  baseUrl: string
  fetchFn?: typeof fetch
  password?: string | null
  requestTimeoutMs: number
  username?: string | null
}): SmsgateClient {
  const fetchFn = options.fetchFn ?? fetch
  const baseUrl = options.baseUrl.replace(/\/+$/, '')
  const authHeader =
    options.username && options.password
      ? `Basic ${Buffer.from(`${options.username}:${options.password}`).toString('base64')}`
      : null

  return {
    async sendSms(input) {
      const controller = new AbortController()
      const timeout = setTimeout(
        () => controller.abort(),
        options.requestTimeoutMs,
      )

      try {
        const response = await fetchFn(`${baseUrl}/messages`, {
          body: JSON.stringify({
            id: input.messageId,
            message: input.message,
            phoneNumbers: [input.phoneNumber],
            ...(input.deviceId ? { deviceId: input.deviceId } : {}),
            ...(input.simNumber === null ? {} : { simNumber: input.simNumber }),
          }),
          headers: {
            Accept: 'application/json',
            ...(authHeader ? { Authorization: authHeader } : {}),
            'Content-Type': 'application/json',
          },
          method: 'POST',
          signal: controller.signal,
        })

        if (response.ok) {
          return {
            providerStatus: response.statusText || null,
            status: 'accepted',
          }
        }

        return {
          error: `SMSGate send failed with status ${response.status}.`,
          status: response.status >= 500 ? 'retryable' : 'terminal',
        }
      } catch (error) {
        return {
          error:
            error instanceof Error ? error.message : 'SMSGate send failed.',
          status: 'retryable',
        }
      } finally {
        clearTimeout(timeout)
      }
    },
  }
}
```

Task 1 must confirm the final endpoint path and auth header for Private Server
mode. Keep `input.messageId` as the provider id exactly as received and do not
create UUIDs for outbound provider messages.

- [ ] **Step 3: Run focused tests**

Run:

```bash
pnpm --dir backend test -- sms-fallback/smsgateClient.test.ts
```

Expected: SMSGate client tests pass.

---

## Task 6: Chatwoot SMS Adapter

**Files:**

- Create: `backend/src/modules/sms-fallback/chatwootAdapter.ts`
- Create: `backend/src/modules/sms-fallback/chatwootAdapter.test.ts`
- Modify: `backend/src/integrations/chatwoot/client.ts`
- Modify: `backend/src/integrations/chatwoot/client.test.ts`

- [ ] **Step 1: Add Chatwoot phone search tests**

In `backend/src/integrations/chatwoot/client.test.ts`, add tests for:

```text
findContactsByPhoneNumber calls /contacts/search?q=<encoded phone>
findContactsByPhoneNumber returns all candidates whose phone_number normalizes to the requested E.164 phone
findContactsByPhoneNumber drops candidates without numeric id
findContactsByPhoneNumber returns [] when no exact normalized phone match exists
```

Expected failing reason: `findContactsByPhoneNumber` is not defined.

- [ ] **Step 2: Add Chatwoot private note tests**

In `backend/src/integrations/chatwoot/client.test.ts`, add a test that `createConversationPrivateNote` posts to:

```text
/api/v1/accounts/:accountId/conversations/:conversationId/messages
```

with body:

```json
{
  "content": "SMS не отправлена: ответ длиннее 500 символов.",
  "content_type": "text",
  "message_type": "outgoing",
  "private": true
}
```

Expected failing reason: `createConversationPrivateNote` is not defined.

- [ ] **Step 3: Implement Chatwoot client additions**

Add methods to the existing client:

```ts
async findContactsByPhoneNumber(e164Phone: string): Promise<ChatwootContact[]>
async createConversationPrivateNote(input: {
  content: string
  conversationId: number
}): Promise<{ id: number } | null>
```

Use `contacts/search?q=` for lookup and normalize candidate `phone_number` through `normalizeRuPhoneToE164` inside the SMS adapter layer or a shared helper.

- [ ] **Step 4: Write SMS adapter tests**

Create `backend/src/modules/sms-fallback/chatwootAdapter.test.ts` with cases:

```text
requires explicit smsFallbackInboxId
creates contact_inbox in SMS inbox, not portal inbox
creates conversation in SMS inbox, not portal inbox
creates incoming message with [SMS fallback] prefix
rejects outgoing webhook from non-SMS inbox
ignores private notes
ignores incoming contact messages
accepts public outgoing agent message from SMS inbox
creates private note for terminal outbound failure when status API unsupported
```

- [ ] **Step 5: Implement SMS adapter**

Create `backend/src/modules/sms-fallback/chatwootAdapter.ts` with a narrow interface:

```ts
export type SmsChatwootAdapter = {
  createIncomingSmsMessage(input: {
    body: string
    chatwootConversationId: number
    fromPhone: string
    sourceId: string
  }): Promise<{ id: number } | null>
  createOrReuseSmsContactInbox(input: {
    chatwootContactId: number
    sourceId: string
  }): Promise<{ sourceId: string }>
  createSmsConversation(input: {
    chatwootContactId: number
    sourceId: string
  }): Promise<{ id: number; inboxId: number }>
  parseOutgoingWebhook(payload: unknown): SmsChatwootOutgoingEvent | null
  writePrivateFailureNote(input: {
    chatwootConversationId: number
    reason: string
  }): Promise<void>
}
```

`createIncomingSmsMessage` content format must be:

```text
[SMS fallback]
От: +79061295512
Чат: private:me

Текст сообщения
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm --dir backend test -- integrations/chatwoot/client.test.ts sms-fallback/chatwootAdapter.test.ts
```

Expected: Chatwoot client and SMS adapter tests pass.

---

## Task 7: Metadata Endpoint

**Files:**

- Create: `backend/src/modules/sms-fallback/service.ts`
- Create: `backend/src/modules/sms-fallback/routes.ts`
- Create: `backend/src/modules/sms-fallback/service.test.ts`
- Create: `backend/src/modules/sms-fallback/routes.test.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Write service tests for metadata**

In `backend/src/modules/sms-fallback/service.test.ts`, add tests:

```text
returns enabled true for private:me when gateway, SMS inbox, active contact link, and valid phone_number exist
returns enabled false no_verified_phone when the contact has no valid phone_number
returns enabled false ambiguous_phone when more than one Chatwoot contact matches the normalized phone
returns enabled false no_sms_inbox when tenant SMS inbox is not configured
returns enabled false no_gateway when tenant gateway is disabled or missing
returns call fallback fields only from supportCallPhoneNumber, never from gatewayPhoneNumber
returns unsupported for any thread id other than private:me
caches or refreshes portal_sms_phone_routes as a cache only after live validation
```

Expected failing reason: `createSmsFallbackService` is not defined.

- [ ] **Step 2: Implement metadata service method**

In `backend/src/modules/sms-fallback/service.ts`, expose:

```ts
export function createSmsFallbackService(options: {
  chatwootAdapterFactory: SmsChatwootAdapterFactory
  contactRepository: ChatThreadContactRepository
  now?: () => Date
  repository: SmsFallbackRepository
  tenant: SmsFallbackTenantRuntime
}) {
  return {
    getMetadataForThread,
    handleInboundGatewayEvent,
    handleChatwootOutgoingWebhook,
    handleGatewayStatusEvent,
  }
}
```

`getMetadataForThread({ threadId, userId })` must:

```text
accept only private:me
load active portal user/contact link
load Chatwoot contact by id
normalize contact.phone_number
verify exactly one Chatwoot contact in the same tenant matches that normalized phone
upsert portal_sms_phone_routes as active
return enabled true metadata with cacheUntil
return disabled metadata with reason and optional supportCall fields when any check fails
```

- [ ] **Step 3: Write route tests**

In `backend/src/modules/sms-fallback/routes.test.ts`, assert:

```text
GET /api/chat/threads/private%3Ame/sms-fallback requires authenticated session
authenticated private:me returns metadata DTO
GET /api/chat/threads/group%3A123/sms-fallback returns controlled unsupported response
response never includes Chatwoot token, gateway credential, webhook secret, contact id, or conversation id
```

- [ ] **Step 4: Implement routes and app wiring**

Register:

```text
GET /api/chat/threads/:threadId/sms-fallback
```

Use existing tenant/session auth patterns from chat routes. Wire the service factory in `backend/src/app.ts` without reusing the PWA Chatwoot webhook service.

- [ ] **Step 5: Run focused tests**

Run:

```bash
pnpm --dir backend test -- sms-fallback/service.test.ts sms-fallback/routes.test.ts
```

Expected: metadata service and route tests pass.

---

## Task 8: Inbound SMS Webhook

**Files:**

- Modify: `backend/src/modules/sms-fallback/service.ts`
- Modify: `backend/src/modules/sms-fallback/routes.ts`
- Modify: `backend/src/modules/sms-fallback/service.test.ts`
- Modify: `backend/src/modules/sms-fallback/routes.test.ts`
- Modify: `backend/src/modules/sms-fallback/repository.ts`
- Modify: `backend/src/modules/sms-fallback/repository.test.ts`

- [ ] **Step 1: Write inbound service tests**

Add cases:

```text
valid inbound SMS from known phone creates one Chatwoot incoming message in SMS fallback conversation
unknown phone fails closed and creates no Chatwoot message
ambiguous phone fails closed and creates no Chatwoot message
contact without active portal user link fails closed and creates no Chatwoot message
disabled gateway fails closed
missing SMS fallback inbox fails closed
inbound SMS live-revalidates contact phone before delivery even when cache exists
duplicate gateway event does not create a duplicate Chatwoot message
concurrent inbound messages create exactly one fallback conversation mapping
oversized inbound SMS from known customer creates no Chatwoot message and enqueues one short service SMS
oversized inbound SMS from unknown/ambiguous/unlinked phone sends no service SMS
```

- [ ] **Step 2: Implement route raw-body handling**

Register:

```text
POST /api/integrations/sms-gateway/smsgate/:gatewayId
```

Requirements:

```text
use raw body for HMAC
resolve gateway by :gatewayId before tenant selection
verify HMAC/timestamp before trusting payload tenant/device fields
deduplicate by provider event id and payload hash
return 200 for duplicate already-processed events
return 401 for invalid signature
return 404 for unknown gateway id
```

- [ ] **Step 3: Implement inbound orchestration**

`handleInboundGatewayEvent` must follow this order:

```text
verified gateway -> tenant
parse event name sms:received
normalize sender phone
trim body and enforce 1..500 chars
live search Chatwoot contacts by phone
require exactly one contact
require active portal user/contact link
resolve/create private:me portal thread if needed
acquire tenant-scoped advisory lock for SMS fallback conversation
create/reuse contact_inbox and conversation in SMS fallback inbox
store conversation mapping
create Chatwoot incoming message
record inbound portal_sms_messages row as received
```

- [ ] **Step 4: Add route tests for signatures and duplicates**

Route tests must assert:

```text
invalid signature stops before service call
stale timestamp stops before service call
valid signature passes raw body to service
duplicate event returns 200 and does not call Chatwoot adapter twice
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
pnpm --dir backend test -- sms-fallback/service.test.ts sms-fallback/routes.test.ts sms-fallback/repository.test.ts
```

Expected: inbound webhook tests pass.

---

## Task 9: Chatwoot Outgoing Webhook And Outbound Job Creation

**Files:**

- Modify: `backend/src/modules/sms-fallback/service.ts`
- Modify: `backend/src/modules/sms-fallback/routes.ts`
- Modify: `backend/src/modules/sms-fallback/service.test.ts`
- Modify: `backend/src/modules/sms-fallback/routes.test.ts`
- Modify: `backend/src/modules/sms-fallback/repository.ts`

- [ ] **Step 1: Write outgoing webhook tests**

Add cases:

```text
rejects webhook with invalid Chatwoot SMS fallback secret
ignores incoming messages
ignores private notes
ignores message events from the main PWA inbox
ignores events from another Chatwoot account
creates one outbound job for public outgoing agent reply in SMS fallback inbox
repeated webhook for the same chatwoot_message_id returns existing job
outbound job stores normalized destination phone from fallback conversation mapping
long agent reply marks job failed_terminal and writes private note without SMSGate send
```

- [ ] **Step 2: Implement Chatwoot SMS webhook route**

Register:

```text
POST /api/integrations/chatwoot/webhooks/sms-fallback
```

Requirements:

```text
verify raw-body Chatwoot signature with chatwoot_sms_fallback_webhook_secret
assert account id and sms fallback inbox id
return 200 for ignored non-sendable events
enqueue outbound job before returning 200 for sendable events
do not call SMSGate from the webhook handler
```

- [ ] **Step 3: Implement deterministic job id**

Before the first gateway call, `portal_sms_messages.gateway_message_id` must be:

```text
sms-fallback:<tenantId>:<chatwootMessageId>
```

The job creation function must set this value when creating the row or before any worker sends. Duplicate webhook deliveries must reuse the same row and same gateway message id.

- [ ] **Step 4: Enforce outbound length policy**

If public agent reply body after trimming is longer than `500` Unicode characters:

```text
do not create a sendable SMS job
store terminal trace with reason sms_body_too_long
write private note: "SMS не отправлена: ответ длиннее 500 символов. Отправьте более короткий ответ."
return 200 to Chatwoot
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
pnpm --dir backend test -- sms-fallback/service.test.ts sms-fallback/routes.test.ts
```

Expected: outgoing webhook and job creation tests pass.

---

## Task 10: Outbound Worker And Gateway Status Events

**Files:**

- Create: `backend/src/modules/sms-fallback/worker.ts`
- Create: `backend/src/modules/sms-fallback/worker.test.ts`
- Modify: `backend/src/modules/sms-fallback/service.ts`
- Modify: `backend/src/modules/sms-fallback/routes.ts`
- Modify: `backend/src/modules/sms-fallback/routes.test.ts`
- Modify: `backend/src/modules/sms-fallback/repository.ts`

- [ ] **Step 1: Write worker tests**

Create tests:

```text
acquires queued job and marks sending with processing_token
sends through SMSGate with stored deterministic gateway_message_id
marks accepted gateway response as sent
timeout marks failed_retryable with next_attempt_at and keeps same gateway_message_id
retry uses same gateway_message_id after timeout
4xx gateway error marks failed_terminal
max_attempts exhausted marks failed_terminal
expired sending lock can be reclaimed and reuses existing gateway_message_id
delivered, failed_terminal, and abandoned jobs are not acquired
```

- [ ] **Step 2: Implement worker entrypoint**

Create `backend/src/modules/sms-fallback/worker.ts`:

```ts
export async function processNextSmsFallbackOutboundJob(options: {
  now?: () => Date
  repository: SmsFallbackRepository
  smsgateClientFactory: SmsgateClientFactory
}): Promise<{ jobId?: number; status: 'processed' | 'idle' }> {
  const job = await options.repository.acquireNextOutboundJob({
    now: options.now?.() ?? new Date(),
  })

  if (!job) {
    return { status: 'idle' }
  }

  const client = options.smsgateClientFactory(job.gateway)
  const result = await client.sendSms({
    deviceId: job.gateway.defaultDeviceId,
    message: job.decryptedBody,
    messageId: job.gatewayMessageId,
    phoneNumber: job.toPhone,
    simNumber: job.gateway.defaultSimNumber,
  })

  if (result.status === 'accepted') {
    await options.repository.markOutboundJobSent({
      gatewayMessageId: job.gatewayMessageId,
      jobId: job.id,
    })
    return { jobId: job.id, status: 'processed' }
  }

  if (result.status === 'retryable') {
    await options.repository.markOutboundJobFailedRetryable({
      error: result.error,
      jobId: job.id,
    })
    return { jobId: job.id, status: 'processed' }
  }

  await options.repository.markOutboundJobFailedTerminal({
    error: result.error,
    jobId: job.id,
  })

  return { jobId: job.id, status: 'processed' }
}
```

Repository return types must include the fields used above:
`id`, `gateway`, `gatewayMessageId`, `toPhone`, and decrypted pending body.

- [ ] **Step 3: Add status callback tests**

Add route/service tests:

```text
sms:sent updates local job sent idempotently
sms:delivered updates local job delivered idempotently
sms:failed updates local job failed_terminal or failed_retryable based on provider reason
status event for unknown gateway_message_id is recorded and ignored
duplicate status event does not regress delivered to sent
```

- [ ] **Step 4: Implement status event handling**

Extend:

```text
POST /api/integrations/sms-gateway/smsgate/:gatewayId
```

to route SMSGate status events from Task 1:

```text
sms:sent
sms:delivered
sms:failed
```

Update local DB first. If Task 2 found a supported Chatwoot status endpoint, update Chatwoot after local DB. If unsupported, use the private-note fallback only on terminal failure.

- [ ] **Step 5: Run focused tests**

Run:

```bash
pnpm --dir backend test -- sms-fallback/worker.test.ts sms-fallback/service.test.ts sms-fallback/routes.test.ts
```

Expected: worker and status tests pass.

---

## Task 11: Backend Maintenance And Integration Checks

**Files:**

- Modify: `backend/src/modules/maintenance/cleanup.ts`
- Modify: `backend/src/modules/maintenance/cleanup.test.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Write cleanup tests**

Add tests:

```text
prunes terminal portal_sms_messages older than SMS trace TTL
keeps queued/sending/retryable SMS jobs regardless of age
keeps active portal_sms_fallback_conversations
keeps portal_sms_gateways
keeps Chatwoot-owned history untouched
```

- [ ] **Step 2: Implement cleanup**

Extend the maintenance cleanup service with a constant such as:

```ts
const SMS_FALLBACK_TERMINAL_TRACE_TTL_DAYS = 90
```

Delete only terminal trace rows:

```text
portal_sms_messages.status in ('delivered', 'failed_terminal', 'abandoned', 'rejected')
and updated_at older than TTL
```

- [ ] **Step 3: Run backend slice checks**

Run:

```bash
pnpm --dir backend test -- sms-fallback/phone.test.ts sms-fallback/signature.test.ts sms-fallback/smsgateClient.test.ts sms-fallback/chatwootAdapter.test.ts sms-fallback/repository.test.ts sms-fallback/service.test.ts sms-fallback/routes.test.ts sms-fallback/worker.test.ts
pnpm --dir backend test
pnpm --dir backend build
pnpm --dir backend lint
```

Expected:

```text
Tests pass
TypeScript build exits 0
ESLint exits 0
```

If the first command path glob is not accepted by Vitest, run the concrete SMS fallback test files by filename.

---

## Task 12: Frontend Metadata Cache And SMS URI Utilities

**Files:**

- Read: `frontend/src/features/offline/` or the actual Offline-first PWA store
  location created by the MVP
- Modify: `frontend/src/features/chat/types.ts`
- Modify: `frontend/src/features/chat/api/chatClient.ts`
- Create: `frontend/src/features/chat/lib/smsFallbackMetadataCache.ts`
- Create: `frontend/src/features/chat/lib/smsFallbackMetadataCache.test.ts`
- Create: `frontend/src/features/chat/lib/smsFallbackUri.ts`
- Create: `frontend/src/features/chat/lib/smsFallbackUri.test.ts`
- Create: `frontend/src/features/chat/pages/useSmsFallbackMetadata.ts`
- Create: `frontend/src/features/chat/pages/useSmsFallbackMetadata.test.tsx`

- [ ] **Step 1: Add frontend DTO types**

In `frontend/src/features/chat/types.ts`, add:

```ts
export type ChatSmsFallbackMetadata =
  | {
      cacheUntil: string
      enabled: true
      gatewayPhoneNumber: string
      knownPhoneMasked: string
      smsUri: string
      targetThreadId: 'private:me'
    }
  | {
      cacheUntil: string
      enabled: false
      reason:
        | 'disabled'
        | 'no_gateway'
        | 'no_sms_inbox'
        | 'no_contact_link'
        | 'no_verified_phone'
        | 'ambiguous_phone'
      supportCallLabel?: string
      supportCallPhoneNumber?: string
    }

export type ChatLocalSystemMessage = {
  createdAt: string
  id: string
  kind: 'local-system'
  text: string
}
```

- [ ] **Step 2: Write SMS URI tests**

Create `frontend/src/features/chat/lib/smsFallbackUri.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { buildSmsFallbackHref } from './smsFallbackUri'

describe('buildSmsFallbackHref', () => {
  it('uses the gateway phone and no sms code', () => {
    expect(
      buildSmsFallbackHref({
        draft: '',
        gatewayPhoneNumber: '+79991234567',
      }),
    ).toBe('sms:+79991234567')
  })

  it('encodes draft body when draft is not empty', () => {
    expect(
      buildSmsFallbackHref({
        draft: 'Не открывается чат',
        gatewayPhoneNumber: '+79991234567',
      }),
    ).toBe(
      'sms:+79991234567?body=%D0%9D%D0%B5+%D0%BE%D1%82%D0%BA%D1%80%D1%8B%D0%B2%D0%B0%D0%B5%D1%82%D1%81%D1%8F+%D1%87%D0%B0%D1%82',
    )
  })

  it('truncates long draft to 500 Unicode code points', () => {
    const result = buildSmsFallbackHref({
      draft: 'а'.repeat(501),
      gatewayPhoneNumber: '+79991234567',
    })

    expect(decodeURIComponent(result.split('body=')[1] ?? '')).toHaveLength(500)
  })
})
```

- [ ] **Step 3: Implement SMS URI builder**

Create `frontend/src/features/chat/lib/smsFallbackUri.ts`:

```ts
export const SMS_FALLBACK_DRAFT_LIMIT = 500

export function truncateSmsFallbackDraft(draft: string) {
  return Array.from(draft.trim()).slice(0, SMS_FALLBACK_DRAFT_LIMIT).join('')
}

export function buildSmsFallbackHref({
  draft,
  gatewayPhoneNumber,
}: {
  draft: string
  gatewayPhoneNumber: string
}) {
  const trimmedDraft = truncateSmsFallbackDraft(draft)

  if (!trimmedDraft) {
    return `sms:${gatewayPhoneNumber}`
  }

  const params = new URLSearchParams({ body: trimmedDraft })

  return `sms:${gatewayPhoneNumber}?${params.toString()}`
}
```

- [ ] **Step 4: Write metadata cache tests**

Create tests for:

```text
stores enabled true metadata by tenantSlug + userId + private:me
stores enabled false metadata by the same key
returns null when cacheUntil is in the past
returns null when JSON is corrupt
does not store credentials or unknown fields
uses the Offline-first PWA IndexedDB store wrapper, not localStorage
keeps SMS metadata scoped to the same tenant/user/thread model as offline chat
```

Use the IndexedDB wrapper delivered by Offline-first PWA MVP. Do not introduce
`localStorage` for SMS fallback metadata.

- [ ] **Step 5: Implement metadata cache**

Create `frontend/src/features/chat/lib/smsFallbackMetadataCache.ts` with:

```ts
export function readSmsFallbackMetadataCache(input: {
  now: Date
  tenantSlug: string
  threadId: string
  userId: number
}): ChatSmsFallbackMetadata | null

export function writeSmsFallbackMetadataCache(input: {
  metadata: ChatSmsFallbackMetadata
  tenantSlug: string
  threadId: string
  userId: number
}): void
```

The stored record must include only the public DTO fields from
`ChatSmsFallbackMetadata` plus local cache bookkeeping required by the
Offline-first PWA store. It must use the same tenant/user/thread scoping as the
offline chat cache and must not create a separate browser-storage abstraction.

- [ ] **Step 6: Add API client method and hook**

In `frontend/src/features/chat/api/chatClient.ts`, add:

```ts
getSmsFallbackMetadata(threadId: string): Promise<ChatSmsFallbackMetadata>
```

Create `useSmsFallbackMetadata` that:

```text
fetches only for private:me
writes enabled and disabled responses to cache
reads cache when fetch fails
refreshes on online/resume state changes
returns null for group threads
```

- [ ] **Step 7: Run focused frontend tests**

Run:

```bash
pnpm --dir frontend test -- smsFallbackUri.test.ts smsFallbackMetadataCache.test.ts useSmsFallbackMetadata.test.tsx
```

Expected: utility and hook tests pass.

---

## Task 13: Frontend Offline Composer UI And Local Marker

**Files:**

- Read: Offline-first PWA composer/outbox state created by the MVP
- Modify: `frontend/src/features/chat/components/MessageComposer.tsx`
- Modify: `frontend/src/features/chat/components/MessageComposer.test.tsx`
- Modify: `frontend/src/features/chat/components/ChatTranscript.tsx`
- Modify: `frontend/src/features/chat/components/chat-transcript/MessageBubble.tsx`
- Modify: `frontend/src/features/chat/components/ChatTranscript.test.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.runtime.test.tsx`
- Modify: `frontend/src/features/chat/pages/ChatPage.test.tsx`

- [ ] **Step 1: Write composer tests**

Add tests:

```text
offline/API unavailable with fresh enabled metadata shows "Отправить через SMS"
SMS button href uses current draft and gateway phone
SMS fallback copy says personal support chat only
long draft shows short warning about brief crisis SMS and multipart billing
enabled metadata false hides SMS button
enabled metadata false with supportCallPhoneNumber shows call fallback
attachments or voice recording state does not offer SMS fallback as rich send replacement
clicking SMS button calls onSmsFallbackOpen with current draft
```

- [ ] **Step 2: Extend composer props**

Add a prop shaped like:

```ts
type SmsFallbackComposerAction =
  | {
      buildHref: (draft: string) => string
      helperText: string
      isDraftTruncated: (draft: string) => boolean
      label: 'Отправить через SMS'
      onOpen: (draft: string) => void
      warningText: string
    }
  | {
      callHref?: string
      callLabel?: string
      helperText: string
      label: null
      onOpen?: never
      warningText?: string
    }
```

Render the SMS link only for the enabled variant. Render call fallback only when `callHref` exists.

- [ ] **Step 3: Write transcript marker tests**

Add tests:

```text
renders local system marker text centered/compact
does not show message status/actions on local system marker
does not send local marker to any backend callback
```

- [ ] **Step 4: Implement local marker rendering**

Represent marker as:

```ts
{
  createdAt: new Date().toISOString(),
  id: `local-sms-fallback-${Date.now()}`,
  kind: 'local-system',
  text: 'Вы перешли в SMS',
}
```

Merge it into the transcript render list in `ChatPage.tsx`, not into server snapshot state and not into optimistic send queue.

- [ ] **Step 5: Write ChatPage runtime tests**

Add tests:

```text
when browser is offline and cache has enabled metadata, ChatPage shows SMS fallback button
when API send fails with statusCode 0 and cache has enabled metadata, ChatPage shows SMS fallback button
when SMS button is clicked, transcript shows "Вы перешли в SMS"
clicking SMS button does not call send message API
when cache has disabled metadata with supportCallPhoneNumber, ChatPage shows call fallback and no SMS button
expired cached metadata shows normal offline warning only
group thread selection never shows SMS fallback
```

- [ ] **Step 6: Implement ChatPage integration**

In `ChatPage.tsx`:

```text
reuse Offline-first PWA offline/API-unavailable state instead of adding a second detector
load SMS fallback metadata after private chat snapshot loads
use cached metadata when API is unavailable
derive emergency UI from browser offline or API send unavailable
keep the user's draft in the composer
append local marker on SMS click
do not track whether native SMS was sent
do not merge SMS fallback Chatwoot history into PWA transcript
do not enqueue native SMS actions into the Offline-first PWA text outbox
```

- [ ] **Step 7: Run focused frontend tests**

Run:

```bash
pnpm --dir frontend test -- MessageComposer.test.tsx ChatTranscript.test.tsx ChatPage.runtime.test.tsx ChatPage.test.tsx
```

Expected: composer, transcript, and ChatPage tests pass.

---

## Task 14: Browser Runtime Coverage

**Files:**

- Modify: `tests/e2e/chat-read-model.spec.ts`

- [ ] **Step 1: Add Playwright route mocks**

Mock:

```text
GET /api/chat/threads/private%3Ame/sms-fallback
```

with enabled response:

```json
{
  "enabled": true,
  "gatewayPhoneNumber": "+79991234567",
  "knownPhoneMasked": "+7 *** ***-55-12",
  "targetThreadId": "private:me",
  "smsUri": "sms:+79991234567",
  "cacheUntil": "2099-01-01T00:00:00.000Z"
}
```

and disabled response:

```json
{
  "enabled": false,
  "reason": "no_verified_phone",
  "supportCallPhoneNumber": "+79061295512",
  "supportCallLabel": "Позвонить в поддержку",
  "cacheUntil": "2099-01-01T00:00:00.000Z"
}
```

- [ ] **Step 2: Add e2e assertions**

Assert:

```text
private chat fetches metadata after snapshot
offline UI with enabled metadata renders "Отправить через SMS"
SMS link href starts with sms:+79991234567
SMS link href body contains encoded draft text and no # code
clicking SMS link adds local "Вы перешли в SMS" marker
disabled metadata renders call fallback and no SMS button
browser never requests Chatwoot directly
```

- [ ] **Step 3: Run Playwright focused test**

Run:

```bash
pnpm test:e2e -- tests/e2e/chat-read-model.spec.ts
```

Expected: focused Playwright suite passes.

If local browser dependencies or dev services are unavailable, record the exact blocker and run frontend unit coverage from Task 13 before handing off.

---

## Task 15: Ops, Provisioning, And Health

**Files:**

- Create: `docs/operations/sms-fallback.md`
- Modify: `backend/src/scripts/verify-tenant-chatwoot-connection.ts` if SMS inbox verification is added.
- Create: `backend/src/scripts/verify-sms-fallback-tenant.ts` if a separate verification script is clearer than extending the existing Chatwoot script.

- [ ] **Step 1: Write runbook**

Create `docs/operations/sms-fallback.md` with sections:

```markdown
# SMS Fallback Operations

## Production Assumptions

- one tenant owns one Android phone/SIM/gateway app;
- phone is plugged in;
- gateway app battery optimization is disabled;
- RCS/chat features are disabled for the gateway number;
- gateway has reliable Wi-Fi or wired-backed internet;
- agents keep working in Chatwoot through home/wired internet.

## Tenant Configuration

- Chatwoot SMS Fallback API Channel inbox id;
- SMS fallback webhook secret;
- SMSGate public gateway id;
- SMSGate API base URL;
- encrypted SMSGate credentials;
- gateway phone number;
- optional human support call phone number.

## Incident Checks

- Android phone powered and unlocked enough for gateway app;
- SIM balance/tariff;
- private server reachable;
- last inbound webhook delivery;
- outbound queue depth;
- failed terminal jobs;
- Chatwoot SMS fallback webhook health.

## Recovery

- restart gateway app;
- restart phone;
- verify private server;
- verify bridge logs;
- mark abandoned jobs only after operator decision.
```

- [ ] **Step 2: Add tenant verification script**

The script must verify:

```text
tenant has chatwoot_sms_fallback_inbox_id
tenant has chatwoot_sms_fallback_webhook_secret_ciphertext
tenant has one enabled portal_sms_gateways row
gateway phone normalizes to E.164
supportCallPhoneNumber, when present, normalizes to E.164
Chatwoot SMS fallback inbox exists and channel type is API
Chatwoot SMS fallback webhook URL points to /api/integrations/chatwoot/webhooks/sms-fallback
```

Run:

```bash
pnpm --dir backend build
```

Expected: script compiles.

- [ ] **Step 3: Add health/metrics exposure if already consistent with project patterns**

If the project has no metrics endpoint, do not introduce a new observability stack in this slice. Add a repository/service method used by the verification script to report:

```text
enabled gateways count
last gateway webhook received at
queued outbound jobs count
failed_terminal outbound jobs count
oldest queued job age
```

Use this in the runbook as the operator query target.

---

## Task 16: Full Verification And Closure

**Files:**

- Modify: `docs/roadmap/work-log.md` only after the implementation branch is complete and accepted.

- [ ] **Step 1: Run backend checks**

Run:

```bash
pnpm --dir backend test
pnpm --dir backend build
pnpm --dir backend lint
```

Expected: all exit 0.

- [ ] **Step 2: Run frontend checks**

Run:

```bash
pnpm --dir frontend test
pnpm --dir frontend typecheck
pnpm --dir frontend build
pnpm --dir frontend lint
```

Expected: all exit 0.

- [ ] **Step 3: Run repository checks**

Run:

```bash
pnpm lint
pnpm test
pnpm build
pnpm format:check
git diff --check
```

Expected: all exit 0 and no whitespace issues.

- [ ] **Step 4: Run runtime checks**

Run focused Playwright:

```bash
pnpm test:e2e -- tests/e2e/chat-read-model.spec.ts
```

Manual runtime with test tenant and Android gateway:

```text
known phone -> inbound SMS -> Chatwoot SMS fallback conversation appears
unknown phone -> inbound SMS -> no Chatwoot message
agent reply in SMS fallback inbox -> one outbound SMS to verified phone
agent reply in main PWA inbox -> no SMS job
gateway timeout -> outbound job retries with same gateway_message_id
delivered/failed event -> local DB status updates
```

- [ ] **Step 5: Perform code review before finalizing**

Review for:

```text
browser has no Chatwoot/gateway authority
no smsCode in MVP
phone route always revalidates before inbound delivery
separate Chatwoot SMS inbox is enforced
outbound send is async and idempotent
deterministic SMSGate message id is reused on retry
unknown/ambiguous/unlinked direct SMS is silent fail-closed
service SMS is sent only after known customer resolution
SMS body limit is enforced in both directions
supportCallPhoneNumber is separate from gatewayPhoneNumber
no credentials or real phone numbers are committed
```

- [ ] **Step 6: Update work-log only for stable baseline**

After review and checks pass, add a short `docs/roadmap/work-log.md` entry for the completed slice and replace the final `Recommended Next Step` block with the next concrete scope.

- [ ] **Step 7: Propose checkpoint commit**

Before committing, run:

```bash
git status --short
```

Expected: only files for the current branch scope are changed. Then propose a checkpoint commit message:

```text
docs: design sms fallback gateway
feat: add sms fallback bridge
feat: add sms fallback pwa entrypoint
docs: add sms fallback operations runbook
```

Use only the message matching the actual branch scope.

---

## Self-Review Checklist

- [ ] `smsCode` is not required or generated in MVP.
- [ ] Routing is `tenant gateway + verified webhook + known phone + active contact link + private:me`.
- [ ] One tenant owns one Android gateway in MVP.
- [ ] PWA caches only public fallback metadata and no secrets.
- [ ] PWA SMS metadata uses the Offline-first PWA IndexedDB wrapper and
      tenant/user/thread scoping, not `localStorage`.
- [ ] PWA shows `Вы перешли в SMS` only as a local marker.
- [ ] SMS fallback does not change or reuse the Offline-first PWA text outbox
      transport semantics.
- [ ] SMS fallback uses a separate Chatwoot API Channel inbox.
- [ ] Agent reply path is determined by the Chatwoot inbox where the agent replies.
- [ ] Unknown, ambiguous, unlinked, or disabled inbound SMS fails closed and silent.
- [ ] Oversized known-customer inbound SMS may send one short service SMS; unknown senders get no service SMS.
- [ ] Outbound long agent replies create no SMS send and write a private note.
- [ ] Outbound worker uses `sms-fallback:<tenantId>:<chatwootMessageId>` as deterministic SMSGate id.
- [ ] Retry never creates a second provider id for the same Chatwoot message.
- [ ] Chatwoot status update endpoint is gated by a spike and has a DB/private-note fallback.
- [ ] `supportCallPhoneNumber` is tenant-owned and separate from `gatewayPhoneNumber`.
- [ ] No Chatwoot core changes are required.
- [ ] Work-log is updated only after closure, not during planning.
