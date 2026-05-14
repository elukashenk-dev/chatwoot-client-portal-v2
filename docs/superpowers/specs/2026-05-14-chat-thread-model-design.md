# Chat Thread Model Design

Date: 2026-05-14

## Status

Design approved for planning. No implementation has started in this branch.

## Goal

Support multiple customer-side chat threads in the portal without adding a new
portal admin UI for client companies and members.

The tenant admin continues to use Chatwoot Contacts and Chatwoot contact custom
attributes as the configuration surface. The portal backend reads that
configuration, validates it, and owns runtime mappings, send authority, history
access and realtime delivery.

## Terms

- `tenant`: the company that owns the portal and Chatwoot account, for example
  PROVGROUP.
- `person contact`: a Chatwoot contact representing a real portal user, for
  example Ivan Petrov.
- `company contact`: a Chatwoot contact representing a client company, for
  example ООО "Ромашка".
- `thread`: a portal-owned chat target visible to the current portal user.
  Chatwoot does not have a `thread` object. A portal thread maps to one
  Chatwoot contact and eventually to one Chatwoot conversation.

## Product Model

One portal user can have:

- one private thread for the whole tenant;
- zero or more shared company threads.

Example:

```text
Tenant: PROVGROUP
  Person contact: Иван Петров
    private thread: Личный чат
    company thread: ООО "Ромашка"
    company thread: ИП Петров
```

There are no private chats between client users. A private thread is only
between one portal user and the tenant support team.

## Chatwoot Configuration

All attributes below are Chatwoot contact custom attributes. In the Chatwoot
custom attribute form, `Применить к` must be `Контакт`.

### Тип контакта

```text
Отображаемое имя: Тип контакта
Ключ: portal_contact_type
Тип: Список
Значения: person, company
```

Rules:

- `person` means the contact represents a real portal user.
- `company` means the contact represents a client company with a shared chat.

### Доступен в портале

```text
Отображаемое имя: Доступен в портале
Ключ: portal_enabled
Тип: Флажок
```

Rules:

- `true` allows the portal backend to use this contact.
- `false` makes the portal ignore this contact for login, thread listing,
  history, send and realtime access.

### ID компаний для общих чатов

```text
Отображаемое имя: ID компаний для общих чатов
Ключ: portal_client_company_contact_ids
Описание: ID контактов Chatwoot для компаний, к общим чатам которых имеет доступ этот человек. Несколько ID указывать через запятую.
Тип: Текст
```

Rules:

- This field is filled only on `person` contacts.
- Values are Chatwoot contact IDs of company contacts.
- Values are comma-separated integers, for example `154` or `154,203`.
- Spaces after commas are accepted by the backend, but the recommended format
  is without spaces.
- This field stays empty on `company` contacts.

The contact ID is the numeric `id` in the Chatwoot contact route and API. For
example, `/app/accounts/3/contacts/154` refers to contact ID `154` in account
`3`. The backend must always validate contact IDs in the current tenant's
Chatwoot account scope.

## Chatwoot Contact Examples

Company contact:

```text
Name: ООО "Ромашка"
Email: office@romashka.ru
Identifier: optional

Custom attributes:
  portal_contact_type = company
  portal_enabled = true
  portal_client_company_contact_ids = empty
```

Person contact:

```text
Name: Иван Петров
Email: ivan@example.com
Identifier: optional

Custom attributes:
  portal_contact_type = person
  portal_enabled = true
  portal_client_company_contact_ids = 154,203
```

## Registration And Login

The portal registration eligibility check uses the current tenant's Chatwoot
account and the submitted email.

For `ivan@example.com`, the backend must:

1. Find the Chatwoot contact by email in the current tenant Chatwoot account.
2. Require `portal_contact_type = person`.
3. Require `portal_enabled = true`.
4. Complete the existing email-code and password flow.
5. Link the portal user to the person Chatwoot contact.

The portal must not allow a user to self-declare company access during
registration. Company access comes only from
`portal_client_company_contact_ids` on the Chatwoot person contact.

## Thread Listing

After login, the frontend requests the available portal threads.

Conceptual endpoint:

```text
GET /api/chat/threads
```

The backend:

1. Resolves the current tenant from host.
2. Resolves the current portal user from session.
3. Loads the linked Chatwoot person contact.
4. Validates `portal_contact_type = person` and `portal_enabled = true`.
5. Parses `portal_client_company_contact_ids`.
6. Loads each referenced Chatwoot contact by ID in the current tenant Chatwoot
   account.
7. Requires each referenced contact to have
   `portal_contact_type = company` and `portal_enabled = true`.
8. Returns one private thread and one company thread per valid company contact.

Example response:

```json
{
  "threads": [
    {
      "id": "private:me",
      "type": "private",
      "title": "Личный чат",
      "subtitle": "Только вы и поддержка"
    },
    {
      "id": "company:154",
      "type": "company",
      "title": "ООО \"Ромашка\"",
      "subtitle": "Общий чат компании"
    }
  ],
  "activeThreadId": "private:me"
}
```

The frontend must not receive or use Chatwoot conversation IDs as authority.
Thread IDs are portal IDs. The backend validates every operation by thread.

Default active thread:

1. Use the last selected thread if still accessible.
2. Otherwise use `private:me`.
3. If the private thread is unavailable due to configuration failure, use the
   first accessible company thread.

## Runtime Persistence

Chatwoot custom attributes are the configuration source of truth. Portal DB
stores runtime state only.

Required runtime concept:

```text
portal_chat_threads
  tenant_id
  thread_type: private | company
  portal_user_id: nullable, set for private threads
  chatwoot_contact_id: target person/company contact for this thread
  chatwoot_inbox_id
  chatwoot_conversation_id: nullable until first conversation exists
  created_at
  updated_at
```

Uniqueness:

- one private thread per `tenant_id + portal_user_id`;
- one company thread per `tenant_id + chatwoot_contact_id`.

Existing user-level contact and conversation mappings should be refactored into
thread-level mappings. The browser still has no direct Chatwoot authority.

## Lazy Conversation Bootstrap

Threads can exist before Chatwoot conversations exist.

When a user opens a thread with no mapped conversation, the portal can show an
empty state. It should not create a Chatwoot conversation just for viewing an
empty chat.

On first send, the backend:

1. Validates the user's access to the thread.
2. Resolves or creates the Chatwoot `ContactInbox`/source ID for the target
   contact in the tenant portal inbox.
3. Creates or recovers the Chatwoot conversation for that contact.
4. Persists `chatwoot_conversation_id` in `portal_chat_threads`.
5. Sends the message to that conversation.

For company threads, the Chatwoot contact is the company contact. For private
threads, the Chatwoot contact is the person contact.

## Message Author Attribution

For private threads, the Chatwoot conversation belongs to the person contact, so
the agent can already see who wrote.

For company threads, the Chatwoot conversation belongs to the company contact.
The backend must preserve the real sender in portal-owned send ledger and make
the sender clear in Chatwoot.

Recommended company message content in Chatwoot:

```text
Иван Петров:
Добрый день, нужна сверка.
```

The portal UI can render the same message with structured author metadata:

```text
Иван Петров
Добрый день, нужна сверка.
```

The send ledger should store at least:

- tenant ID;
- thread ID;
- portal user ID;
- client message key;
- Chatwoot conversation ID;
- Chatwoot message ID when available;
- send status;
- author display name snapshot.

## History Access

All history reads must validate thread access at request time.

Private thread access:

- current portal user must own the private thread;
- linked person contact must still be `person` and `portal_enabled = true`.

Company thread access:

- current portal user's person contact must still be `person` and
  `portal_enabled = true`;
- `portal_client_company_contact_ids` must still include the company contact ID;
- the company contact must still be `company` and `portal_enabled = true`.

If access is removed in Chatwoot, old runtime mappings remain but no longer
grant access.

## Realtime And Webhooks

Chatwoot webhooks arrive by tenant-scoped callback and are still validated with
tenant webhook secret and account/inbox invariants.

After a valid webhook, the backend maps the Chatwoot conversation to a portal
thread:

- if the conversation is mapped to a private thread, fan out only to that portal
  user;
- if the conversation is mapped to a company thread, fan out to active sessions
  of portal users whose current Chatwoot person contact includes that company
  contact ID;
- if no thread mapping exists, the backend may recover/create a mapping from the
  webhook conversation contact when the contact is a valid enabled `person` or
  `company` portal contact.

Realtime subscriptions must be scoped by tenant and thread, not only by user and
conversation.

## UI

The post-login chat UI uses the existing left menu as the thread switcher. There
is no separate chat list screen.

Menu:

```text
Чаты
  ✓ Личный чат
    ООО "Ромашка"
    ИП Петров

Центр поддержки      скоро
```

Rules:

- the current thread is marked with `✓`;
- clicking a thread switches the active chat;
- if many threads exist, they still live in the menu;
- the support center entry remains separate.

Header:

```text
Поддержка клиентов
Личный чат · Онлайн
```

or:

```text
Поддержка клиентов
ООО "Ромашка" · Онлайн
```

The active thread must be visible in both the menu and header. The composer
always sends to the active thread.

## Configuration Errors

Strict configuration behavior is preferred for production.

Examples:

- person contact is missing `portal_contact_type = person`;
- person contact has `portal_enabled = false`;
- `portal_client_company_contact_ids` contains a non-integer value;
- referenced contact ID does not exist in the current Chatwoot account;
- referenced contact is not `portal_contact_type = company`;
- referenced company contact has `portal_enabled = false`.

The user-facing message should stay controlled and non-technical:

```text
Доступ к порталу настроен некорректно. Обратитесь в поддержку.
```

Backend logs should contain the concrete misconfiguration.

## Security Rules

- Browser never receives Chatwoot tokens.
- Browser never chooses a Chatwoot conversation directly.
- Every route validates tenant, session, thread access and current Chatwoot
  attributes.
- Chatwoot contact IDs are valid only in the current tenant's
  `chatwoot_base_url + chatwoot_account_id` scope.
- Old runtime mappings do not grant access after Chatwoot attributes are changed.
- Unknown thread IDs return controlled `403`/configuration errors.

## Testing Strategy

Backend unit/integration tests:

- registration permits only enabled `person` contacts;
- registration rejects disabled contacts, company contacts and missing
  Chatwoot contacts;
- thread listing returns private plus referenced company threads;
- thread listing rejects malformed company contact IDs;
- thread listing rejects missing/disabled/non-company referenced contacts;
- private send bootstraps one private conversation;
- company send bootstraps one company conversation and prefixes author for
  Chatwoot;
- history access is denied after company ID is removed from the person contact;
- webhook fanout routes private events only to the user;
- webhook fanout routes company events only to users whose current contact
  attributes reference the company contact ID.

Frontend tests:

- menu renders available threads and active marker;
- thread switch updates header subtitle;
- composer sends using the active portal thread ID;
- configuration error state is shown without leaking internals.

Rendered QA:

- mobile left menu with 1, 3 and many threads;
- header subtitle fit for long company names;
- switching between private and company threads;
- empty thread before first message;
- first-send bootstrap flow.

## References

- Chatwoot Contacts API `Show Contact` uses
  `/api/v1/accounts/{account_id}/contacts/{id}` where `id` is the contact ID:
  https://developers.chatwoot.com/api-reference/contacts/show-contact
- Chatwoot Contacts API `List Contacts` returns contact objects with `id`:
  https://developers.chatwoot.com/api-reference/contacts/list-contacts
- Local Chatwoot CE source confirms dashboard contact routes use
  `/accounts/:accountId/contacts/:contactId` and backend loads contacts with
  `Current.account.contacts.find(params[:id])`.
