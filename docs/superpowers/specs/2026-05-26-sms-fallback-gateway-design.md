# SMS Fallback Gateway Design

## Scope

Design an emergency two-way SMS channel for the customer PWA and Chatwoot using
an Android phone as the SMS gateway.

This is a research and design scope only. It does not implement the bridge,
PWA UI, Chatwoot provisioning, migrations, or gateway deployment.

This design assumes the **Offline-first PWA MVP** is implemented immediately
before SMS fallback work starts. SMS fallback must reuse that MVP's app-shell
offline startup, IndexedDB offline store wrapper, scoped tenant/user identity
model, and poor-connection boot states instead of introducing a separate local
storage or startup strategy.

MVP target flow:

```text
Client PWA -> native SMS app -> Android SMS Gateway -> Portal backend bridge
  -> Chatwoot SMS Fallback API Channel -> Agent

Agent -> Chatwoot SMS Fallback API Channel webhook -> Portal backend bridge
  -> Android SMS Gateway -> SMS -> Client
```

MVP product decision:

- SMS fallback is a crisis communication channel, not a full copy of the PWA
  chat product.
- MVP supports only the customer's personal chat target: `private:me`.
- MVP routes inbound SMS by known sender phone number, not by `#CODE`.
- The sender phone must already belong to the customer's Chatwoot contact.
- Group threads and multiple SMS chat targets are future scope.

Non-goals for the first implementation:

- no Chatwoot core changes;
- no browser-direct Chatwoot access;
- no MMS, attachments, voice, or rich content over SMS;
- no automatic fallback sending without the user's SMS app confirmation;
- no SMS fallback support for group threads;
- no onboarding of unknown SMS numbers;
- no merge of SMS fallback messages into the main PWA Chatwoot conversation.
- no replacement for the Offline-first PWA local outbox; SMS fallback is a
  separate emergency channel, not another delivery mode for queued PWA messages.

## Failure Model And Assumptions

SMS fallback covers a specific crisis case:

```text
Customer can open the offline-first PWA shell
Customer mobile internet cannot reach the portal API/send/realtime path
SMS and voice calls still work
Tenant agents still have working home/wired internet
Portal backend, Chatwoot, and SMS bridge infrastructure are online
Android SMS gateway has internet access to the bridge or SMSGate Private Server
```

This channel does not cover a full platform outage. It is not designed to work
when the portal backend is down, Chatwoot is down, the SMS bridge is down, or the
Android gateway cannot reach the backend/private server.

Operational implication:

- agents keep working in Chatwoot as usual;
- the customer-facing PWA shell must still open from cache;
- only the customer-facing API/send/realtime path switches from PWA networking to
  SMS;
- gateway and bridge health must be monitored because they are still online
  infrastructure dependencies;
- if gateway/bridge/backend is unavailable, inbound SMS delivery to Chatwoot may
  be delayed or fail and operations must handle it as an infrastructure incident.

## Current Project Fit

The current portal baseline is compatible with this design:

- tenant is resolved by host before auth/chat runtime for browser requests;
- browser never receives Chatwoot authority;
- portal backend is the authority for auth, session, send, realtime, and
  Chatwoot access;
- Chatwoot remains external and must not be modified;
- chat runtime uses backend-owned `threadId`, while Chatwoot conversation IDs
  stay internal;
- existing webhook handling already validates raw-body signatures, tenant
  account/inbox invariants, deduplicates deliveries, and routes by conversation
  mapping.

The SMS fallback must stay as its own backend module, not as hidden branching in
the existing PWA chat send path.

Suggested module boundary:

```text
backend/src/modules/sms-fallback/
```

Suggested Chatwoot boundary:

```text
Tenant main PWA inbox:    existing Chatwoot API Channel
Tenant SMS fallback inbox: new separate Chatwoot API Channel, "SMS Fallback"
```

The separate inbox is intentional. It avoids ambiguous delivery semantics where
an agent reply inside the main PWA conversation might need to go either to PWA
realtime or SMS.

## Chatwoot Conversation Model

MVP uses two separate Chatwoot conversations for the same known customer contact:

```text
PWA personal conversation
  Inbox: tenant main PWA API Channel
  Customer side: PWA
  Agent reply delivery: portal realtime/PWA

SMS fallback personal conversation
  Inbox: tenant SMS Fallback API Channel
  Customer side: SMS
  Agent reply delivery: Android SMS Gateway -> SMS
```

The existing PWA personal conversation is not reused for inbound SMS. The SMS
bridge uses the existing Chatwoot contact only to verify who the sender is and to
create or reuse a separate SMS fallback `contact_inbox` and conversation in the
SMS Fallback inbox.

Agent delivery rule:

- if the agent replies in the main PWA inbox conversation, the reply goes to the
  PWA path;
- if the agent replies in the SMS Fallback inbox conversation, the reply goes to
  the Android SMS Gateway and then to the customer's verified phone number.

This keeps the delivery channel explicit in Chatwoot. The agent can manually
copy or summarize SMS fallback context into a group chat when needed, but MVP
does not automatically mirror SMS messages into group threads or the main PWA
conversation.

Production gateway ownership:

- one Android SMS gateway belongs to one tenant;
- the tenant installs and operates their own Android phone/SIM/gateway app;
- shared SMS gateway devices across multiple tenants are out of MVP scope;
- `gatewayId` identifies the tenant-owned gateway, not a global shared
  provider pool.

## Gateway Candidates

Research date: 2026-05-26.

Primary sources:

- SMSGate repo: https://github.com/capcom6/android-sms-gateway
- SMSGate API docs: https://capcom6.github.io/android-sms-gateway/
- SMSGate webhooks: https://docs.sms-gate.app/features/webhooks/
- SMSGate private server: https://docs.sms-gate.app/features/private-server/
- SMSGate status tracking:
  https://docs.sms-gate.app/features/status-tracking/
- SMSGate multi-device:
  https://docs.sms-gate.app/features/multi-device/
- SMSGate multi-SIM:
  https://docs.sms-gate.app/features/multi-sim/
- httpSMS repo: https://github.com/NdoleStudio/httpsms
- httpSMS docs: https://docs.httpsms.com/
- httpSMS webhooks: https://docs.httpsms.com/webhooks/introduction
- TextBee repo: https://github.com/vernu/textbee
- TextBee docs: https://textbee.dev/docs
- TextBee API docs: https://api.textbee.dev/
- Vendel repo: https://github.com/JimScope/vendel
- Vendel site: https://vendel.cc/

GitHub API snapshot on 2026-05-26:

| Project                       | Stars | Forks | License    | Last push  | Notes                                  |
| ----------------------------- | ----: | ----: | ---------- | ---------- | -------------------------------------- |
| `capcom6/android-sms-gateway` |  4477 |   737 | Apache-2.0 | 2026-05-22 | Most complete fit                      |
| `NdoleStudio/httpsms`         |  1983 |   297 | AGPL-3.0   | 2026-05-24 | Good platform, heavier self-host       |
| `vernu/textbee`               |  2582 |   326 | MIT        | 2026-05-24 | Good second option, docs mismatch risk |
| `JimScope/vendel`             |    35 |     3 | MIT        | 2026-05-25 | Promising but immature                 |

### Criteria Matrix

| Criterion                    | SMSGate                                     | httpSMS                                     | TextBee                          | Vendel                                          |
| ---------------------------- | ------------------------------------------- | ------------------------------------------- | -------------------------------- | ----------------------------------------------- |
| Inbound SMS webhook          | Yes, `sms:received`                         | Yes, CloudEvents                            | Yes, documented/API              | Yes                                             |
| Outbound SMS API             | Yes, REST `messages`                        | Yes, REST `messages/send`                   | Yes, REST `send-sms`             | Yes                                             |
| Self-host/private mode       | Yes, private server; local mode too         | Yes, but FCM/Firebase-heavy                 | Yes, but FCM/Mongo setup         | Yes                                             |
| Webhook retry                | Strong: exponential, default 14 attempts    | Limited: max 4 retries on 5xx               | Not clearly specified in docs    | Not clearly specified                           |
| Webhook auth/signature       | HMAC-SHA256 headers                         | JWT bearer signed with webhook key          | HMAC-SHA256 documented           | HMAC-SHA256 documented                          |
| Outbound statuses            | Pending, Processed, Sent, Delivered, Failed | Pending/sent/delivered/failed fields/events | Sent/delivered/failed mentioned  | Pending/queued/processing/sent/delivered/failed |
| Multi-device                 | Yes, Cloud/Private modes                    | Yes, phone API keys                         | Yes                              | Yes                                             |
| Multi-SIM                    | Yes, explicit `simNumber`, rotation         | SIM field in events/settings                | `simSubscriptionId`              | Not the main documented strength                |
| One-phone MVP                | Good                                        | Good cloud UX, heavier private              | Good cloud UX, heavier private   | OK but project young                            |
| Backend bridge compatibility | Best                                        | Good, but AGPL and FCM coupling             | Good, but docs drift             | Good API, high support risk                     |
| Support risk                 | Lowest among candidates                     | AGPL/self-host complexity                   | Medium; active but docs mismatch | High; small/new project                         |

Recommendation: use **SMSGate**.

Target mode:

1. Production target: SMSGate Private Server, deployed near the portal stack.
2. Lab spike: SMSGate Cloud or Local mode is acceptable only to validate payload
   shapes and Chatwoot flow quickly.
3. Strict no-external-cloud production must verify SMSGate private server's
   SSE path, because private mode docs still show an FCM notification path with
   an SSE alternative.

## PWA Design

The PWA cannot discover SMS fallback metadata after the API is already
unreachable. It must receive and cache the tenant SMS gateway metadata while
online.

Offline-first prerequisite:

- the installed PWA shell opens without network through the Offline-first PWA
  MVP boot coordinator;
- poor connectivity leaves the splash through controlled states instead of
  blocking the SMS fallback entry point behind an indefinite spinner;
- the chat screen shows the latest locally available state and a clear
  offline/API-unavailable state through the Offline-first PWA read model;
- the SMS slice reuses the Offline-first PWA IndexedDB wrapper and
  tenant/user/thread keying;
- SMS fallback UI must be shown offline only when fresh fallback metadata is
  already cached and the ordinary API send path is unavailable;
- if fallback metadata is missing or stale, the PWA must not invent gateway
  routing data and must show the normal offline warning.

Ordering:

- do not implement SMS fallback PWA UI before the Offline-first MVP has a stable
  app shell cache, anti-hang startup state machine, scoped auth/tenant offline
  open, cached `private:me` chat read model, and composer offline state
  boundary;
- do not copy or fork offline storage code inside the SMS slice;
- if the Offline-first MVP changes its store names or identity keying during
  implementation, this SMS spec and plan must be updated before SMS feature
  branches start.

MVP backend contract:

```text
GET /api/chat/threads/private%3Ame/sms-fallback
```

The endpoint must return SMS fallback metadata only for `private:me`. Group
thread IDs must return a controlled unsupported response until future support is
explicitly designed.

The endpoint must return `enabled: true` only when the current authenticated
portal user has a valid SMS fallback route:

- tenant SMS fallback is enabled;
- tenant gateway phone number is configured;
- current portal user is linked to a Chatwoot contact;
- that Chatwoot contact has a valid standard Chatwoot `phone_number` for SMS
  fallback;
- the phone route can be live-validated against the current contact and active
  portal user link.

Response:

```json
{
  "enabled": true,
  "gatewayPhoneNumber": "+79991234567",
  "knownPhoneMasked": "+7 *** ***-22-33",
  "targetThreadId": "private:me",
  "smsUri": "sms:+79991234567",
  "cacheUntil": "2026-08-24T00:00:00.000Z"
}
```

If the current user has no valid SMS fallback route, the endpoint must return a
controlled disabled response instead of gateway routing data:

```json
{
  "enabled": false,
  "reason": "no_verified_phone",
  "supportCallPhoneNumber": "+79061295512",
  "supportCallLabel": "Позвонить в поддержку",
  "cacheUntil": "2026-08-24T00:00:00.000Z"
}
```

The phone-call fallback is optional and must use a tenant-owned support call
number, not the Android gateway number by default. The SMS gateway phone and the
human support call phone are separate settings:

```text
gatewayPhoneNumber       -> where the customer sends SMS
supportCallPhoneNumber   -> where the customer may call when SMS fallback is unavailable
```

If no `supportCallPhoneNumber` is configured, the disabled metadata response must
omit the call fields and the PWA must show only the offline/API warning.

The existing chat page already detects browser/network send failures through
`ChatApiClientError.statusCode === 0` and disables the composer while offline.
The SMS slice must extend that state:

- preserve the unsent draft;
- show an emergency warning only when SMS fallback metadata is cached and
  current browser/API send is unavailable;
- show a button: `Отправить через SMS`;
- use a normal `sms:` link so the native SMS app opens and the user confirms
  sending;
- prefill the tenant gateway number;
- append the current draft as SMS body when possible;
- make the UI copy clear that SMS goes to the personal support chat only.

If the cached metadata says SMS fallback is disabled because the customer's
contact has no valid phone route, the PWA must not show the SMS button. It must
show the offline/API warning and, when configured, a phone-call fallback:

```text
Связь с чатом пропала. SMS сейчас недоступна. Позвоните в поддержку: +7...
```

SMS transition marker:

- when the user clicks `Отправить через SMS`, the PWA must append a small local
  system marker to the current chat view:

```text
Вы перешли в SMS
```

- this marker is only a local UX trace that the user opened the SMS fallback
  path;
- the PWA does not verify whether the native SMS was actually sent;
- the PWA does not track whether an SMS fallback conversation happened later;
- SMS fallback history is not merged into the main PWA conversation in MVP;
- after API connectivity returns, the normal PWA transcript continues to show the
  main PWA conversation history.

Metadata fetch and cache rules:

- fetch SMS fallback metadata after the initial private chat snapshot is loaded;
- cache the whole public fallback decision needed for offline rendering:
  `enabled`, `reason`, tenant gateway phone when enabled, masked customer phone
  when enabled, target thread, `smsUri`, `supportCallPhoneNumber` and
  `supportCallLabel` when provided, and cache timestamp;
- store cached metadata by the same scoped identity model as Offline-first PWA:
  `tenantSlug + userId + private:me`, with host/tenant context coming from the
  existing offline tenant/auth records;
- use the Offline-first PWA IndexedDB wrapper; do not use `localStorage` as a
  fallback for SMS metadata after the Offline-first MVP exists;
- do not cache any Chatwoot token, gateway credential, or account secret;
- include `cacheUntil`; if metadata is stale, show the normal offline warning
  and do not show the SMS button;
- refresh metadata on app resume while online.

Example:

```text
sms:+79991234567?body=%D0%9D%D0%B5%20%D0%BE%D1%82%D0%BA%D1%80%D1%8B%D0%B2%D0%B0%D0%B5%D1%82%D1%81%D1%8F%20%D1%87%D0%B0%D1%82
```

SMS text:

```text
Не открывается чат
```

Notes:

- use URL encoding through `URLSearchParams` or equivalent structured API;
- keep SMS fallback text-only in MVP;
- prefill at most the first `500` characters of the current PWA draft into the
  native SMS app;
- if the PWA draft is longer than `500` characters, show a short warning that SMS
  is for brief crisis messages and only the first part will be opened in SMS;
- if the draft is long enough to require carrier multipart delivery, the native
  SMS app/operator may charge it as multiple SMS even though the PWA opens only
  one SMS compose action;
- browser tests must verify the rendered href and offline UI state, not
  attempt to open the OS SMS app.

## Backend Bridge Design

Create a new module:

```text
backend/src/modules/sms-fallback/
```

Responsibilities:

- expose gateway webhook route;
- verify gateway signature and timestamp;
- deduplicate gateway events;
- normalize phone numbers to E.164;
- resolve tenant from the verified tenant-owned gateway;
- resolve sender phone to exactly one known Chatwoot contact in that tenant;
- resolve the contact to an active portal user/contact link;
- route inbound SMS only to the user's `private:me` SMS fallback conversation;
- create incoming Chatwoot messages for inbound SMS;
- receive Chatwoot webhook events for the SMS fallback inbox;
- send agent outgoing messages through the Android gateway;
- process sent/delivered/failed status callbacks;
- keep operational traces and retry state in portal DB.

Suggested routes:

```text
POST /api/integrations/sms-gateway/smsgate/:gatewayId
POST /api/integrations/chatwoot/webhooks/sms-fallback
GET  /api/chat/threads/private%3Ame/sms-fallback
```

The first route is gateway -> portal.

The second route is Chatwoot -> portal for the separate SMS fallback API
Channel. It must not reuse the existing PWA webhook service directly because
that service currently enforces the main portal inbox and publishes SSE
snapshots.

The gateway route must not rely on browser `Host` tenant resolution. SMS gateway
requests are server-to-server calls and may arrive through backend or gateway
infrastructure. The bridge must resolve a trusted tenant-owned gateway row
first:

```text
:gatewayId + verified SMSGate HMAC -> portal_sms_gateways -> tenant_id
```

### Inbound SMS

```text
SMSGate sms:received webhook
  -> resolve gateway by :gatewayId
  -> verify HMAC over raw body + timestamp
  -> derive tenant from the verified gateway row
  -> record delivery idempotently
  -> normalize sender phone
  -> find exactly one Chatwoot contact in this tenant by standard phone_number
  -> find active portal user/contact link for that Chatwoot contact
  -> resolve or create private:me portal thread mapping
  -> create/reuse one locked SMS fallback conversation for tenant + gateway
     + phone + user + private:me
  -> create Chatwoot incoming message in SMS Fallback inbox
```

SMS fallback conversation creation must be concurrency-safe:

- enforce one active SMS fallback conversation per routing target with a unique
  database constraint:

```text
tenant_id + gateway_id + normalized_phone + portal_user_id
  + portal_private_chat_thread_id
```

- take a tenant-scoped advisory lock before creating the Chatwoot SMS fallback
  `contact_inbox` and conversation;
- after acquiring the lock, resolve the mapping again and reuse it if another
  worker already created it;
- if the unique constraint is hit despite the lock, retry the resolve path and
  do not create a second Chatwoot conversation;
- keep `normalized_phone` in the key so two verified phone numbers for the same
  customer cannot accidentally receive each other's SMS replies.

Inbound SMS length rule:

- accept text messages up to `500` Unicode characters after trimming as one
  application-level SMS fallback message;
- if an inbound SMS is longer, do not create a Chatwoot message;
- after the sender phone has been successfully resolved to a known customer,
  send a short service SMS asking the customer to send a shorter message;
- log the rejected event without storing the full oversized SMS body in
  long-lived service logs;
- `500` characters is not a promise that the carrier delivered or billed it as
  one physical SMS segment. If the phone/gateway/carrier reconstructs a multipart
  SMS into one text body, the bridge still treats it as one application message.

Phone verification is mandatory. The portal's access model stays the same as the
email registration model: only customers already known in Chatwoot may write to
the tenant support inbox. For SMS fallback, the backend must verify that the
normalized sender phone belongs to exactly one Chatwoot contact in the resolved
tenant.

Allowed phone source for MVP:

- Chatwoot contact `phone_number` only.

Custom phone attributes are out of MVP scope. They may be added later only as a
separate feature with an explicit tenant allowlist and tests, because using the
wrong contact phone field could send crisis support SMS to the wrong person.

Phone format and normalization:

- the Chatwoot contact `phone_number` is expected to be stored from the admin
  phone input as one validated RU phone number;
- the stored canonical format for SMS fallback comparisons is E.164, for example
  `+79061295512`;
- the backend must still normalize inbound SMS sender numbers because gateway or
  carrier payloads may include spaces, punctuation, a leading `8`, or a leading
  `7` without `+`;
- accepted MVP RU normalization examples:

```text
+7 906 129-55-12 -> +79061295512
7 906 129-55-12  -> +79061295512
8 906 129-55-12  -> +79061295512
79061295512       -> +79061295512
89061295512       -> +79061295512
```

- if a stored or inbound phone cannot be normalized confidently to one E.164
  value, SMS fallback is disabled or fails closed;
- implementation may use a small backend normalizer for the MVP RU rules or a
  phone-number library if one is introduced intentionally, but tests must assert
  the exact normalization behavior above.

Fail-closed cases:

- no Chatwoot contact has this phone;
- more than one Chatwoot contact has this phone;
- the matching Chatwoot contact is not linked to an active portal user;
- the linked portal user is inactive;
- the tenant SMS gateway is disabled;
- the tenant SMS fallback inbox is not configured.

In fail-closed cases the bridge must not create a Chatwoot message and must not
create a fallback conversation. These cases can still happen when someone writes
directly to the gateway phone number without going through the authenticated PWA
fallback prompt. The bridge must stay silent for these fail-closed cases and must
not send an automatic service SMS. Service SMS replies are allowed only after the
sender phone has been successfully resolved to a known customer and the message
is rejected for a specific technical reason, such as the inbound length limit.

Chatwoot message content must be explicit:

```text
[SMS fallback]
От: +79990001122
Чат: private:me

Текст сообщения...
```

### Agent Reply

```text
Chatwoot message_created webhook
  -> verify Chatwoot API Channel secret
  -> assert tenant account + SMS fallback inbox
  -> ignore private notes
  -> ignore incoming contact messages
  -> accept outgoing agent messages
  -> find SMS fallback conversation by Chatwoot conversation id
  -> enqueue outbound SMS job idempotently
  -> return 200 OK to Chatwoot
  -> worker stores deterministic SMSGate message id
  -> worker sends through SMSGate REST API with that id
```

The bridge must avoid echo loops:

- inbound SMS creates `incoming` Chatwoot messages; those webhooks are ignored
  by the outbound path;
- only `message_type = outgoing`, public, agent/user-sent messages create SMS
  jobs;
- bridge-generated private notes, if any, must never be sent to SMS.

Outbound SMS length rule:

- send public agent replies up to `500` Unicode characters after trimming as one
  SMSGate/native SMS send request;
- if the agent reply is longer, do not send it as SMS automatically;
- record the outbound job as failed with reason `sms_body_too_long`;
- add a private note in the SMS fallback conversation telling the agent to send a
  shorter SMS reply;
- do not split long agent replies into several application-level SMS jobs in MVP;
- a single SMSGate/native SMS send request may still be delivered and billed by
  the carrier as multipart SMS when the text exceeds one physical SMS segment.

Outbound sending must be asynchronous and idempotent. The Chatwoot webhook
handler must persist a job and acknowledge the webhook before calling the SMS
gateway. The job table must enforce a unique key such as:

```text
tenant_id + chatwoot_message_id
```

This protects against duplicate SMS sends when Chatwoot retries a webhook or the
gateway request times out after the phone has already sent the message. The
worker may retry unsent jobs, but it must not create a second gateway send for
the same Chatwoot message.

The worker must use a deterministic SMSGate message id for each outbound
Chatwoot message, for example:

```text
sms-fallback:<tenantId>:<chatwootMessageId>
```

Store that id on the job before the first gateway call and pass it as the SMSGate
message id in every send attempt. Retries after timeout must reuse the same
gateway message id, never generate a new one.

Outbound job status model:

```text
queued -> sending -> sent -> delivered
queued -> sending -> failed_retryable -> queued
queued -> sending -> failed_terminal
queued -> sending -> abandoned
```

Status meanings:

- `queued`: job is waiting for a worker.
- `sending`: worker has locked the job and is calling the gateway.
- `sent`: gateway accepted the outbound SMS for the stored gateway message id.
- `delivered`: gateway reported carrier/device delivery.
- `failed_retryable`: temporary failure; retry after `next_attempt_at`.
- `failed_terminal`: permanent failure or retry budget exhausted.
- `abandoned`: operator/system marked the job as no longer sendable.

Worker rules:

- select only jobs whose status is `queued` or `failed_retryable` and whose
  `next_attempt_at <= now`;
- atomically set `status = sending`, `locked_at`, and a random
  `processing_token` before calling the gateway;
- ensure the deterministic `gateway_message_id` is stored before the first
  gateway call;
- pass the same `gateway_message_id` to SMSGate on every retry;
- if the gateway accepts the request for that id, mark the job `sent`;
- if the gateway call times out, keep the deterministic `gateway_message_id` and
  mark the job `failed_retryable` with backoff instead of generating a new send
  id;
- retry only until `max_attempts`;
- terminal statuses `delivered`, `failed_terminal`, and `abandoned` are never
  retried automatically;
- if a `sending` lock expires, another worker may reclaim the job, but it must
  reuse the existing deterministic `gateway_message_id`.

### Status Updates

SMSGate emits `sms:sent`, `sms:delivered`, and `sms:failed` events. The bridge
must update local status first.

Chatwoot API Channel status support exists according to Chatwoot docs, but the
exact public/platform endpoint to push external provider delivery statuses must
be confirmed against Chatwoot CE `v4.13.0` before implementation. This is a
required spike.

Fallback if no supported status update API is available:

- keep delivery state in portal DB;
- add a private Chatwoot note only on terminal failure;
- do not attempt Chatwoot core changes.

## Data Model

Add tenant-scoped tables in a migration.

Proposed tables:

```text
portal_sms_gateways
portal_sms_phone_routes
portal_sms_fallback_conversations
portal_sms_messages
portal_sms_webhook_deliveries
```

`portal_sms_gateways`:

- tenant id;
- public stable gateway id used in webhook URLs;
- provider: `smsgate`;
- mode: `private`, `local`, or `cloud`;
- gateway API base URL;
- encrypted API username/password or token;
- encrypted webhook signing key;
- public gateway phone number;
- optional tenant support call phone number for cases where SMS fallback is
  unavailable;
- optional tenant support call label;
- optional default device id;
- optional default SIM number;
- enabled/status fields.

`portal_sms_phone_routes`:

- tenant id;
- gateway id;
- normalized phone number;
- Chatwoot contact id;
- portal user id;
- portal private chat thread id;
- source field used for the match; MVP value is always `phone_number`;
- status: active, ambiguous, disabled;
- last verified timestamp.

This table may be filled or refreshed by the authenticated metadata endpoint and
by inbound SMS lookup. It is a local routing cache, not the source of truth for
customer identity. Chatwoot contact data and the portal contact link remain the
authority.

Inbound SMS must always revalidate the phone route before delivering a message to
Chatwoot:

- a cached `portal_sms_phone_routes` row may be used only to find the expected
  candidate faster;
- before creating a Chatwoot message, the bridge must confirm that the normalized
  sender phone still matches exactly one Chatwoot contact `phone_number` in this
  tenant;
- the matched Chatwoot contact must still have an active portal user contact
  link;
- the linked portal user must still be active;
- if live revalidation cannot be completed or no longer matches the cached
  route, fail closed and do not create a Chatwoot message.

`portal_sms_fallback_conversations`:

- tenant id;
- gateway id;
- normalized phone number;
- portal user id;
- portal private chat thread id;
- Chatwoot SMS fallback contact id;
- Chatwoot SMS fallback contact inbox source id;
- Chatwoot SMS fallback conversation id;
- status.

`portal_sms_messages`:

- tenant id;
- fallback conversation id;
- direction: inbound/outbound;
- unique Chatwoot outgoing message id for outbound jobs;
- gateway event id;
- gateway message id;
- Chatwoot message id;
- body hash;
- encrypted outbound body while pending;
- status;
- attempts count;
- max attempts;
- next attempt timestamp;
- processing token / locked timestamp;
- gateway message id set timestamp;
- last error;
- timestamps.

`portal_sms_webhook_deliveries`:

- tenant id;
- gateway id;
- provider;
- event id or derived delivery key;
- event name;
- payload hash;
- status;
- processed timestamp.

Retention must follow the existing maintenance policy style:

- keep active gateway config and conversation mappings;
- prune terminal message/job traces after an explicit TTL;
- never delete Chatwoot-owned history from portal cleanup.

## Chatwoot Configuration

Per tenant, provision or manually configure a new API Channel inbox:

```text
Name: SMS Fallback
Callback URL: https://<tenant-domain>/api/integrations/chatwoot/webhooks/sms-fallback
Agents: same support team as the main portal inbox, or a narrower emergency team
```

Store tenant runtime config separately from the main PWA inbox:

```text
chatwoot_sms_fallback_inbox_id
chatwoot_sms_fallback_webhook_secret_ciphertext
```

Do not overload `chatwoot_portal_inbox_id`.

Contact strategy:

- use the existing customer Chatwoot contact when sender phone resolves to
  exactly one tenant contact and that contact has an active portal user link;
- do not create a new Chatwoot contact for a known phone in MVP;
- create a separate `contact_inbox` source for the SMS fallback inbox, even when
  the Chatwoot contact is reused;
- use a deterministic SMS fallback `source_id`, for example
  `sms-fallback:<tenantId>:<portalUserId>:private:me:<phoneHash>`;
- when the sender phone cannot be matched to exactly one linked customer
  contact, fail closed and do not create a Chatwoot message;
- do not create fallback Chatwoot contacts for unknown SMS numbers in MVP.

Chatwoot adapter strategy:

- create a small SMS-specific Chatwoot adapter wrapping the existing generic
  request/auth/config layer;
- do not widen the main PWA chat helpers with optional inbox parameters in MVP;
- the SMS adapter must require an explicit `chatwoot_sms_fallback_inbox_id` for
  contact inbox creation, conversation creation, incoming SMS message creation,
  and outbound webhook tenant/inbox validation.

This keeps main PWA chat assumptions separate from the SMS fallback inbox and
reduces the chance that a normal PWA reply is accidentally routed as SMS.

## Security Rules

- SMS content is plaintext over the mobile network; no secrets, OTPs, or
  account-management actions over this channel.
- SMS fallback is limited to short crisis messages. MVP does not support
  splitting one customer or agent message into several application-level SMS
  jobs. Gateway/carrier multipart segmentation may still happen for one send.
- A sender phone number is not a strong authentication factor, but it is
  acceptable for this crisis support channel because it only creates support
  messages and never performs account actions.
- Gateway webhook HMAC and tenant-owned `gatewayId` are mandatory.
- The normalized sender phone must match exactly one Chatwoot contact
  `phone_number` in the gateway tenant.
- The matched Chatwoot contact must have an active portal user contact link.
- Ambiguous phone matches fail closed.
- Unknown phones fail closed.
- Store no Chatwoot token, gateway credential, or SMS secret in the browser.
- Verify SMSGate webhooks with raw body, timestamp, and HMAC.
- Reject stale webhook timestamps.
- Deduplicate by gateway event id and payload hash.
- Normalize phone numbers before comparisons.
- Rate-limit inbound SMS webhooks by gateway, tenant, phone, and failed lookup
  attempts.
- Use a separate Chatwoot callback secret for the SMS fallback inbox.
- Do not put gateway credentials into frontend config or docs.

## Operational Rules

For production:

- dedicate one Android phone to the gateway;
- keep it plugged in;
- keep it on reliable Wi-Fi or wired-backed network;
- disable battery optimization for the gateway app;
- disable RCS/chat features for the gateway number;
- use a SIM tariff appropriate for transactional support SMS;
- monitor gateway heartbeat and last successful webhook;
- document manual recovery: restart app, restart phone, check SIM balance, check
  private server, check bridge logs.

For local development:

- use SMSGate Cloud or Local mode only for payload-shape testing;
- use a test tenant and test Chatwoot API Channel;
- do not commit real phone numbers, credentials, `.env`, or webhook secrets.

## Future Extensions

Add SMS routing codes only if SMS fallback must support multiple targets:

- group threads;
- several active support contexts for the same phone;
- shared gateway devices across tenants;
- manually selecting a target thread from the PWA before opening SMS.

Future code model:

```text
#P7K49Q2M message text
```

The future code would select a specific tenant/user/thread target. It is not
part of the MVP because MVP SMS fallback intentionally routes known phones only
to `private:me`.

## Recommended Branch Plan

Current docs branch:

```text
docs/sms-fallback-gateway-design
```

This branch should contain only the research/spec artifacts.

Before implementation, the Offline-first PWA MVP must be completed and accepted
as the current runtime baseline. SMS fallback was originally planned as the
follow-up after Offline-first PWA, but implementation must be reconfirmed
against the current `docs/roadmap/work-log.md` recommended next step before any
code starts.

The only SMS work that may remain before that point is docs alignment and, if
explicitly approved, external operational research that does not change portal
runtime code. Feature implementation branches start from the current accepted
`main`.

After spec approval:

```text
feature/sms-gateway-private-spike
feature/sms-fallback-bridge
feature/sms-fallback-pwa
feature/sms-fallback-ops
```

Suggested implementation slices:

1. `feature/sms-gateway-private-spike`
   - self-host SMSGate Private Server in a test environment;
   - connect one Android phone;
   - capture inbound webhook payload and signature headers;
   - send one outbound SMS through API;
   - capture outbound status event payloads;
   - write a spike note with go/no-go decision for bridge implementation.

2. `feature/sms-fallback-bridge`
   - schema;
   - SMSGate adapter;
   - inbound webhook;
   - known-phone route resolution;
   - Chatwoot SMS fallback inbound message creation;
   - Chatwoot SMS fallback outgoing webhook;
   - outbound SMS job/status handling;
   - backend unit/integration tests.

3. `feature/sms-fallback-pwa`
   - authenticated private-chat fallback metadata endpoint;
   - frontend cache;
   - offline composer warning/button;
   - `sms:` URI generation tests;
   - Playwright/browser coverage for offline state.

4. `feature/sms-fallback-ops`
   - env examples;
   - setup/provisioning scripts;
   - local test guide;
   - production runbook;
   - gateway health checks.

## Required Spikes Before Implementation

### Gate 1. SMSGate Private Server Spike

The backend bridge implementation must not start until this spike is closed.
The goal is to prove that the selected Android gateway works in the production
mode we intend to support.

Spike questions:

1. Can SMSGate Private Server be self-hosted in our target environment?
2. Can one Android phone connect to it without relying on an external SMSGate
   cloud account?
3. Does the deployment require Google FCM/Firebase for outbound commands, or can
   it use a private/SSE path acceptable for our production constraints?
4. Does inbound SMS create the documented webhook payload?
5. Does outbound SMS API work from a backend service account?
6. Do `sent`, `delivered`, and `failed` status events arrive reliably?
7. What exact webhook HMAC headers and signing payload are used in practice?
8. What exact payload fields represent message id, sender phone, SIM, device,
   status, and timestamps?

Spike exit criteria:

- one inbound SMS from a test phone reaches a test backend endpoint;
- one outbound SMS sent by API reaches the test phone;
- at least `sent` or `failed` status is observed for the outbound SMS;
- webhook signature verification is implemented in a throwaway/test harness or
  manually validated against captured raw payloads;
- final spike note records whether production can use SMSGate Private Server
  without unacceptable external cloud/FCM dependency.

If this spike fails, do not implement the bridge against SMSGate assumptions.
Re-evaluate gateway choice or accept a different operating mode explicitly.

### Other Required Spikes

1. Confirm Chatwoot CE `v4.13.0` API path for updating API Channel outgoing
   message status from external provider events.
2. Test `sms:` URI body behavior on Android Chrome/PWA and iOS Safari/PWA.
3. Confirm actual SMSGate sender-phone payload formats against the MVP
   normalization rules before implementing the bridge.

## Testing Plan

Backend:

- gateway webhook signature valid/invalid/stale timestamp;
- invalid or disabled `gatewayId` fails closed;
- metadata endpoint returns `enabled: false` without SMS routing data when the
  current contact has no valid `phone_number`;
- metadata endpoint returns `enabled: true` only after live-validating the
  current contact `phone_number` and active portal user link;
- duplicate gateway event handling;
- sender phone normalizes consistently;
- unknown sender phone fails closed;
- sender phone matching more than one contact fails closed;
- sender phone matching a contact without an active portal user link fails
  closed;
- fail-closed unknown/ambiguous/unlinked inbound SMS creates no Chatwoot message
  and sends no automatic service SMS;
- inbound SMS always live-revalidates the cached phone route before delivery;
- known sender phone routes to `private:me`;
- group thread routing is unsupported in MVP;
- inbound SMS creates/reuses the correct SMS fallback conversation;
- concurrent inbound SMS or webhook retries create exactly one SMS fallback
  conversation for the same routing target;
- Chatwoot outgoing webhook ignores incoming/private/non-SMS-inbox events;
- repeated Chatwoot webhook for the same outgoing message creates exactly one
  outbound SMS job;
- outbound job stores a deterministic SMSGate message id before the first gateway
  call;
- outbound timeout/retry reuses the same deterministic SMSGate message id and
  does not create a duplicate send id;
- outbound worker locking prevents duplicate sends;
- status callbacks update local message state idempotently;
- body length limits are enforced for inbound and outbound SMS;
- oversized inbound SMS from a known customer may create a short service SMS
  asking for a shorter message;
- one application-level outbound send may exceed one physical SMS segment, but
  the bridge still creates only one SMSGate send request;
- oversized inbound SMS is rejected without creating a Chatwoot message;
- oversized agent reply creates no SMS send and leaves a private note for the
  agent.

Frontend:

- Offline-first PWA anti-hang startup and cached `private:me` chat baseline are
  already present before SMS PWA UI tests run;
- fallback metadata is fetched and cached for `private:me`;
- fallback metadata caches both `enabled: true` and `enabled: false` decisions;
- fallback metadata uses the Offline-first PWA IndexedDB wrapper and scoped
  tenant/user/thread keying;
- disabled fallback metadata uses a tenant-owned `supportCallPhoneNumber`, not
  the Android gateway phone number by default;
- group thread selection does not offer SMS fallback in MVP;
- offline/API failure state shows SMS button only when metadata exists and is
  fresh;
- offline/API failure state hides SMS button and shows the configured call
  fallback when cached metadata is `enabled: false`;
- `sms:` href includes encoded gateway number and draft text, with no code;
- clicking `Отправить через SMS` appends the local `Вы перешли в SMS` marker;
- the local SMS transition marker is not sent to the backend or Chatwoot;
- long PWA drafts are truncated to the SMS prefill limit with a visible warning;
- long PWA drafts warn that carrier multipart billing may apply;
- attachments/voice do not offer SMS fallback in MVP;
- expired cached metadata hides the SMS button.

Runtime/manual:

- Android receives SMS from a known phone and bridge creates Chatwoot fallback
  conversation;
- Android receives SMS from an unknown phone and bridge does not create a
  Chatwoot message;
- agent reply sends SMS back to the originating verified number;
- sent/delivered/failed statuses are reflected locally;
- gateway offline path is observable and does not lose queued outbound jobs.

## Design Decision

Use **SMSGate** as the Android SMS Gateway, target **Private Server mode** for
production, and keep the portal integration in a separate
`sms-fallback` backend module plus a separate Chatwoot API Channel inbox per
tenant.

MVP routing is:

```text
tenant-owned gatewayId + verified gateway webhook
  -> normalized sender phone
  -> exactly one known Chatwoot contact in this tenant
  -> active portal user contact link
  -> private:me SMS fallback conversation
```

This fits the current architecture because the portal backend remains the only
authority boundary, Chatwoot stays external, tenant scoping remains explicit,
and the PWA only receives a native `sms:` link rather than any gateway or
Chatwoot secret.

Sequencing decision:

- implement Offline-first PWA MVP first;
- keep SMS fallback docs aligned during Offline-first work when storage,
  composer, or boot boundaries change;
- implement SMS fallback immediately after the Offline-first MVP checkpoint,
  starting with the SMSGate Private Server gate.
