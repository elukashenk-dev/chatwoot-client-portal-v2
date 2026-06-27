# Local Cross-Tenant Test Data Runbook

Этот документ описывает подготовку test data для повторного local
cross-tenant цикла из
[`production-mcp-playwright-test-cycle.md`](production-mcp-playwright-test-cycle.md).

Цель: быстро завести тестовых клиентов в Chatwoot, зарегистрировать их в
портале через Mailpit, проверить личные и групповые чаты и не тратить время на
повторное исследование обязательных Chatwoot attributes.

## Scope

Runbook рассчитан на local production-like окружение:

- Chatwoot: `http://127.0.0.1:3000`;
- portal backend: `http://127.0.0.1:3301`;
- portal frontend: `http://*.127.0.0.1.nip.io:5173`;
- Mailpit UI/API: `http://127.0.0.1:8025`;
- portal DB и Chatwoot DB остаются разными базами.

Production tenants этим runbook не мутировать. Для production использовать
отдельные согласованные test users и не запускать локальные Rails helpers.

## Terminology

- Chatwoot `contact` с `portal_contact_type=person` - это клиент, которому
  разрешен first access в портале.
- Portal `user` - запись в portal DB, создается после email-code access
  или shortcut-скриптом `user:create`.
- Chatwoot `contact` с `portal_contact_type=group` - это групповой чат в
  portal UI. Это не Chatwoot team и не portal user.
- Chatwoot agent/admin `User` нужен только для ответа из админки или Rails
  helper incoming/admin checks. Его не нужно создавать на каждый portal user.

## Expected Local Tenants

| Tenant     | Portal URL                                | Chatwoot account | Portal API inbox |
| ---------- | ----------------------------------------- | ---------------- | ---------------- |
| buhfirma   | `http://buhfirma.127.0.0.1.nip.io:5173`   | `3`              | `6`              |
| stroyfirma | `http://stroyfirma.127.0.0.1.nip.io:5173` | `5`              | `9`              |
| zubi       | `http://zubi.127.0.0.1.nip.io:5173`       | `1`              | `8`              |

`http://127.0.0.1:5173` / `default` не использовать для production-like
multi-tenant проверок.

Проверить tenant matrix в portal DB:

```bash
cd /home/evluk/projects/chatwoot-client-portal-v2
set -a && source .env && set +a
psql "$DATABASE_URL" -c \
  "select slug, display_name, primary_domain, chatwoot_account_id, chatwoot_portal_inbox_id, status from portal_tenants order by slug;"
```

Проверить account/inbox matrix в local Chatwoot:

```bash
cd /home/evluk/projects/chatwoot-ce-stable
PATH=/home/evluk/.rbenv/versions/3.4.4/bin:$PATH \
GEM_HOME=/home/evluk/.rbenv/versions/3.4.4/lib/ruby/gems/3.4.0 \
GEM_PATH=/home/evluk/.rbenv/versions/3.4.4/lib/ruby/gems/3.4.0 \
bin/bundle exec rails runner 'puts Account.where(id: [1,3,5]).pluck(:id, :name).inspect; puts Inbox.where(id: [6,8,9]).pluck(:id, :account_id, :name, :channel_type).inspect'
```

Ожидание:

- account `3` = `Бухфирма`, inbox `6`, `Channel::Api`;
- account `5` = `Стройфирма`, inbox `9`, `Channel::Api`;
- account `1` = local `zubi` account, inbox `8`, `Channel::Api`.

Если id поменялись после clean Chatwoot DB reset, сначала обновить tenant
bootstrap и local testing docs. Не подгонять тесты под старые id.

## Critical Chatwoot Requirements

Portal first access и chat runtime зависят от Chatwoot contact data.

Для каждого portal test user должен существовать Chatwoot contact в правильном
Chatwoot account с exact email. First-access eligibility ищет contact по email
в current tenant account.

Для открытия чата у person contact обязательны custom attributes:

| Attribute                         | Type             | Required value for person contact                 |
| --------------------------------- | ---------------- | ------------------------------------------------- |
| `portal_enabled`                  | boolean/checkbox | `true`                                            |
| `portal_contact_type`             | string/list/text | `person`                                          |
| `portal_client_group_contact_ids` | string/text      | empty string or comma-separated group contact ids |

Для group contact обязательны custom attributes:

| Attribute             | Type             | Required value for group contact |
| --------------------- | ---------------- | -------------------------------- |
| `portal_enabled`      | boolean/checkbox | `true`                           |
| `portal_contact_type` | string/list/text | `group`                          |

Important details:

- `portal_enabled` должен быть boolean `true`, не строкой `"true"`.
- `portal_contact_type` принимает только `person` или `group`.
- `portal_client_group_contact_ids` хранится на person contact.
- Значение `portal_client_group_contact_ids` - строка с Chatwoot contact IDs
  групп, например `154` или `154,203`.
- Максимум `20` group ids на person contact.
- Пустая строка означает только личный чат.
- Один group contact может быть доступен многим person contacts.

Если first access проходит, но чат возвращает `403 portal_contact_disabled`,
проблема почти всегда в отсутствующем или неверном `portal_enabled`.

## ContactInbox Requirement

Для первого send portal нужен `ContactInbox` в tenant Portal API inbox.

Обычно вручную создавать `ContactInbox` не обязательно: при первом writable
thread bootstrap backend вызывает Chatwoot API и создает missing contact inbox
для нужного contact/inbox.

Тем не менее при ручной подготовке test data можно создать его заранее через
local Rails helper. Это делает тесты более предсказуемыми и упрощает проверку.

Для person private chat `ContactInbox` нужен у person contact. Для group chat
`ContactInbox` нужен у group contact, потому что group thread bootstrap создает
conversation на group contact.

## Prepare Run Variables

Использовать новый `RUN_ID` на каждый полный mutating прогон:

```bash
RUN_ID="$(date -u +%Y%m%d%H%M%S)"

LCT_USER_PASSWORD='Test1234!'

LCT_BUHFIRMA_EMAIL="lct-buhfirma-${RUN_ID}@example.test"
LCT_STROYFIRMA_EMAIL="lct-stroyfirma-${RUN_ID}@example.test"
LCT_ZUBI_EMAIL="lct-zubi-${RUN_ID}@example.test"

LCT_BUHFIRMA_GROUP_EMAIL="lct-buhfirma-group-${RUN_ID}@example.test"
LCT_STROYFIRMA_GROUP_EMAIL="lct-stroyfirma-group-${RUN_ID}@example.test"
LCT_ZUBI_GROUP_EMAIL="lct-zubi-group-${RUN_ID}@example.test"
```

`example.test` безопасен для локальных тестов. Письма регистрации уходят в
Mailpit, а не во внешний SMTP.

## Manual Chatwoot Admin Setup

Этот путь полезен, когда нужно глазами проверить Chatwoot admin UI. Production
`tenant:create` создает эти contact custom attribute definitions автоматически;
ручной setup нужен только для локальных/ручных Chatwoot accounts или для
ремонта старого account до запуска ensure-команды.

### 1. Ensure Contact Custom Attributes Exist

В каждом Chatwoot account открыть настройки custom attributes для contacts и
убедиться, что есть:

- `portal_enabled`;
- `portal_contact_type`;
- `portal_client_group_contact_ids`;
- `curator_name`.

Если Chatwoot UI предлагает тип поля:

- `portal_enabled` делать checkbox/boolean;
- `portal_contact_type` делать text/list;
- `portal_client_group_contact_ids` делать text;
- `curator_name` делать text.

Если custom attribute definitions не созданы, contact-level JSON через Rails/API
все равно работает локально, но в UI редактировать такие поля неудобно.

### 2. Create Person Contact

Для каждого tenant перейти в правильный Chatwoot account:

- buhfirma -> account `3`;
- stroyfirma -> account `5`;
- zubi -> account `1`.

Создать contact:

- Name: `LCT <Tenant> <RUN_ID>`;
- Email: соответствующий `LCT_*_EMAIL`;
- Custom attributes:
  - `portal_enabled`: checked / `true`;
  - `portal_contact_type`: `person`;
  - `portal_client_group_contact_ids`: пока empty.

Записать Chatwoot contact id из URL contact page. Он понадобится для
верификации и group membership.

### 3. Create Group Contact

В том же Chatwoot account создать отдельный contact-группу:

- Name: `LCT <Tenant> Group <RUN_ID>`;
- Email: можно оставить пустым, но для поиска в тестах удобно использовать
  `LCT_*_GROUP_EMAIL`;
- Custom attributes:
  - `portal_enabled`: checked / `true`;
  - `portal_contact_type`: `group`.

Записать Chatwoot group contact id.

### 4. Grant Group Access To Person Contact

Вернуться к person contact и выставить:

```text
portal_client_group_contact_ids=<group_contact_id>
```

Если нужно проверить несколько групп:

```text
portal_client_group_contact_ids=<group_contact_id_1>,<group_contact_id_2>
```

После этого portal `GET /api/chat/threads` должен вернуть:

- `private:me`;
- `group:<group_contact_id>`.

### 5. Optional ContactInbox Precreate

Если хочется исключить ленивое создание contact inbox во время первого send,
создать его через Rails helper из следующего раздела. В Chatwoot UI это обычно
неудобно.

## Fast Local Rails Helper Setup

Этот путь быстрее и повторяемее для MCP/Playwright mutating cycles.

Важно:

- запускать из `/home/evluk/projects/chatwoot-ce-stable`;
- не source-ить portal `.env` перед Rails runner;
- не коммитить generated output;
- использовать только local Chatwoot.

Пример создает person и group contacts во всех трех accounts, выставляет
portal attributes, добавляет group id в person membership и заранее создает
ContactInbox для person/group contacts.

```bash
cd /home/evluk/projects/chatwoot-ce-stable

RUN_ID="$(date -u +%Y%m%d%H%M%S)"

PATH=/home/evluk/.rbenv/versions/3.4.4/bin:$PATH \
GEM_HOME=/home/evluk/.rbenv/versions/3.4.4/lib/ruby/gems/3.4.0 \
GEM_PATH=/home/evluk/.rbenv/versions/3.4.4/lib/ruby/gems/3.4.0 \
LCT_RUN_ID="$RUN_ID" \
bin/bundle exec rails runner '
require "json"

run_id = ENV.fetch("LCT_RUN_ID")

tenants = [
  {
    slug: "buhfirma",
    account_id: 3,
    inbox_id: 6,
    person_email: "lct-buhfirma-#{run_id}@example.test",
    person_name: "LCT Buhfirma #{run_id}",
    group_email: "lct-buhfirma-group-#{run_id}@example.test",
    group_name: "LCT Buhfirma Group #{run_id}"
  },
  {
    slug: "stroyfirma",
    account_id: 5,
    inbox_id: 9,
    person_email: "lct-stroyfirma-#{run_id}@example.test",
    person_name: "LCT Stroyfirma #{run_id}",
    group_email: "lct-stroyfirma-group-#{run_id}@example.test",
    group_name: "LCT Stroyfirma Group #{run_id}"
  },
  {
    slug: "zubi",
    account_id: 1,
    inbox_id: 8,
    person_email: "lct-zubi-#{run_id}@example.test",
    person_name: "LCT Zubi #{run_id}",
    group_email: "lct-zubi-group-#{run_id}@example.test",
    group_name: "LCT Zubi Group #{run_id}"
  }
]

result = tenants.map do |tenant|
  account = Account.find(tenant[:account_id])
  inbox = account.inboxes.find(tenant[:inbox_id])

  group = Contact.find_or_initialize_by(
    account_id: account.id,
    email: tenant[:group_email]
  )
  group.name = tenant[:group_name]
  group.custom_attributes = (group.custom_attributes || {}).merge(
    "portal_enabled" => true,
    "portal_contact_type" => "group"
  )
  group.save!

  person = Contact.find_or_initialize_by(
    account_id: account.id,
    email: tenant[:person_email]
  )
  person.name = tenant[:person_name]
  person.custom_attributes = (person.custom_attributes || {}).merge(
    "portal_enabled" => true,
    "portal_contact_type" => "person",
    "portal_client_group_contact_ids" => group.id.to_s
  )
  person.save!

  person_inbox =
    ContactInbox.find_by(contact_id: person.id, inbox_id: inbox.id) ||
    ContactInboxBuilder.new(contact: person, inbox: inbox).perform

  group_inbox =
    ContactInbox.find_by(contact_id: group.id, inbox_id: inbox.id) ||
    ContactInboxBuilder.new(contact: group, inbox: inbox).perform

  {
    slug: tenant[:slug],
    account_id: account.id,
    inbox_id: inbox.id,
    person_email: person.email,
    person_contact_id: person.id,
    person_contact_inbox_id: person_inbox.id,
    group_email: group.email,
    group_contact_id: group.id,
    group_thread_id: "group:#{group.id}",
    group_contact_inbox_id: group_inbox.id
  }
end

puts JSON.pretty_generate({ run_id: run_id, tenants: result })
'
```

Сохранить `run_id`, emails и `group_thread_id` из output для portal
email-code access и mutating checks.

## Portal Email-Code Access Through Mailpit

Для полного LCT цикла не создавать portal users напрямую через
`pnpm --dir backend user:create`: этот shortcut не проверяет email-code flow.

Правильный путь:

1. Chatwoot contact уже существует в correct account.
2. Portal code-login request отправляет код в Mailpit.
3. Portal code-login verify подтверждает код.
4. First-access legal consent создает portal user и
   `portal_user_contact_link`.
5. Текущая сессия создается сразу после legal consent; password login доступен
   только после отдельной настройки пароля.

### UI Path

Для каждого tenant:

1. Открыть tenant URL.
2. Открыть primary email-code login flow.
3. Ввести exact email Chatwoot person contact.
4. Открыть Mailpit: `http://127.0.0.1:8025`.
5. Найти письмо с кодом входа для Client Portal.
6. Ввести 6-digit code.
7. Если это первый вход, принять оба legal checkboxes.
8. Войти в портал.

Если email не найден в Chatwoot account, request все равно вернет generic
accepted response, но письмо не будет отправлено.

### API Path

API path быстрее для повторных прогонов. Важно отправлять `Origin`, совпадающий
с tenant public base URL.

```bash
TENANT_URL='http://buhfirma.127.0.0.1.nip.io:5173'
EMAIL="lct-buhfirma-${RUN_ID}@example.test"
COOKIE_JAR="/tmp/lct-buhfirma-${RUN_ID}.cookies"

curl -sS -X POST "$TENANT_URL/api/auth/code-login/request" \
  -H "Origin: $TENANT_URL" \
  -H 'Content-Type: application/json' \
  --data "{\"email\":\"$EMAIL\"}"
```

Mailpit list API:

```bash
curl -sS 'http://127.0.0.1:8025/api/v1/messages'
```

Mailpit message detail API:

```bash
curl -sS "http://127.0.0.1:8025/api/v1/message/<MESSAGE_ID>"
```

Extract the 6-digit code from `Text`, then verify:

```bash
CODE='<6-digit-code>'

VERIFY_RESPONSE="$(
  curl -sS -X POST "$TENANT_URL/api/auth/code-login/verify" \
    -H "Origin: $TENANT_URL" \
    -H 'Content-Type: application/json' \
    --data "{\"email\":\"$EMAIL\",\"code\":\"$CODE\"}"
)"

echo "$VERIFY_RESPONSE"
```

Use `continuationToken` from `VERIFY_RESPONSE`:

```bash
CONTINUATION_TOKEN='<continuationToken>'

curl -sS -i -c "$COOKIE_JAR" -X POST "$TENANT_URL/api/auth/code-login/accept-legal" \
  -H "Origin: $TENANT_URL" \
  -H 'Content-Type: application/json' \
  --data "{\"email\":\"$EMAIL\",\"continuationToken\":\"$CONTINUATION_TOKEN\",\"termsAccepted\":true,\"personalDataConsentAccepted\":true}"
```

Check the issued customer session:

```bash
curl -sS -b "$COOKIE_JAR" "$TENANT_URL/api/auth/me"
```

If a password is needed for this test user, set the first password later from
the protected profile security flow. Password login is a secondary path only
after a password has been configured.

For browser QA, still log in through the UI at least once per tenant with MCP
Playwright, because API login alone does not prove rendered auth flow.

## Validate Portal Threads

After login, each person should have:

- `private:me`;
- optional `group:<group_contact_id>` if group membership was configured.

API check with a session cookie:

```bash
curl -sS "$TENANT_URL/api/chat/threads" \
  -H "Origin: $TENANT_URL" \
  -H "Cookie: portal_session=<session-cookie>"
```

Expected personal-only response:

```text
private:me
```

Expected person with one group:

```text
private:me
group:<group_contact_id>
```

If group is missing:

- check person `portal_client_group_contact_ids`;
- check group contact id belongs to the same Chatwoot account;
- check group contact has `portal_enabled: true`;
- check group contact has `portal_contact_type: group`;
- check value is a comma-separated string, not array.

## Mutating Personal Chat Checks

For each tenant:

1. Login as the tenant-specific test user.
2. Send text:
   `LCT <RUN_ID> <tenant> text`.
3. Send one safe attachment:
   `/tmp/portal-lct-<tenant>-<RUN_ID>.txt`.
4. Verify transcript shows both.
5. Verify Chatwoot has messages in the expected account/inbox.

Rails verification:

```bash
cd /home/evluk/projects/chatwoot-ce-stable

PATH=/home/evluk/.rbenv/versions/3.4.4/bin:$PATH \
GEM_HOME=/home/evluk/.rbenv/versions/3.4.4/lib/ruby/gems/3.4.0 \
GEM_PATH=/home/evluk/.rbenv/versions/3.4.4/lib/ruby/gems/3.4.0 \
LCT_RUN_ID="$RUN_ID" \
bin/bundle exec rails runner '
require "json"
run_id = ENV.fetch("LCT_RUN_ID")
rows = Message.includes(:attachments, conversation: [:contact, :inbox])
              .where("messages.content LIKE ?", "%#{run_id}%")
              .order(:id)
              .map do |message|
  conversation = message.conversation
  {
    message_id: message.id,
    content: message.content,
    message_type: message.message_type,
    account_id: message.account_id,
    conversation_id: conversation.id,
    inbox_id: conversation.inbox_id,
    contact_id: conversation.contact_id,
    contact_email: conversation.contact&.email,
    attachments_count: message.attachments.size,
    attachment_names: message.attachments.map { |attachment| attachment.file&.filename&.to_s }
  }
end
puts JSON.pretty_generate(rows)
'
```

Expected routing:

- buhfirma messages -> account `3`, inbox `6`;
- stroyfirma messages -> account `5`, inbox `9`;
- zubi messages -> account `1`, inbox `8`;
- attachment names include the tenant slug and `RUN_ID`.

## Mutating Group Chat Checks

Group chat checks require the group contact setup above.

Status note:

- the first `2026-05-31` local mutating run covered personal chats, files,
  incoming/admin replies and offline outbox across `buhfirma`, `stroyfirma` and
  `zubi`;
- the follow-up `2026-05-31` group run with `RUN_ID=20260531111832` created and
  tested one group thread per tenant:
  `buhfirma -> group:247`, `stroyfirma -> group:248`, `zubi -> group:249`;
- that group run covered portal text send, portal attachment send,
  Chatwoot account/inbox/contact routing, UI thread switching,
  group-to-private isolation, cross-tenant isolation and agent/admin replies
  back into the group thread.
- the follow-up `2026-05-31` hardening run with `RUN_ID=20260531153701`
  covered second group participants, group membership revocation, group offline
  outbox drain, cached group boot while startup APIs hang and attachment proxy
  negative checks.

For each tenant:

1. Login as the person test user.
2. Confirm thread list includes `group:<group_contact_id>`.
3. Open the group thread.
4. Send text:
   `LCT <RUN_ID> <tenant> group text`.
5. Send a safe attachment if the test cycle requires file routing for groups.
6. Verify portal transcript shows the message in that group only.
7. Verify Chatwoot message lands in the tenant account/inbox and conversation
   for the group contact.
8. From Chatwoot admin or a local Rails helper, send an agent/admin reply into
   the same group conversation:
   `LCT <RUN_ID> <tenant> group incoming`.
9. Verify the portal group transcript shows that reply only in that tenant's
   group thread.
10. Switch back to `Личный чат` and verify the group reply is not visible there.

Expected Chatwoot behavior:

- group portal send is an incoming message in Chatwoot API inbox;
- agent/admin group reply is an outgoing message in the same Chatwoot
  conversation and appears in the portal group transcript;
- Chatwoot-visible content may include a Markdown author prefix so agents know
  which portal participant wrote it;
- portal transcript renders structured author metadata and should not rely on
  parsing the Chatwoot-visible prefix.

If testing multiple group participants:

1. Create two person contacts in the same tenant account.
2. Put the same group contact id in both person contacts'
   `portal_client_group_contact_ids`.
3. Enter both users through portal email-code access.
4. Login as user A and send in the group.
5. Login as user B and confirm the same group thread receives the message.
6. Remove the group id from user B's person contact.
7. User B should lose access to `group:<id>` after refresh/resync.

Expected after membership removal:

- `/api/chat/threads` no longer returns the removed group for user B;
- direct group history/send requests return controlled not-ready responses with
  `reason: thread_access_denied`;
- direct group send does not create a Chatwoot message after membership is
  removed.

Reference local run:

- `RUN_ID=20260531153701`;
- member2 contacts: `buhfirma -> 250`, `stroyfirma -> 251`, `zubi -> 252`;
- before revoke user B saw user A group fanout in all three tenants;
- after revoke user B saw only `private:me`, and direct group history/send
  returned `result: not_ready`, `reason: thread_access_denied`,
  `sentMessage: null`.

## Incoming/Admin Message Checks

Incoming-from-agent checks can be done through Chatwoot admin UI or local Rails
helper.

### Admin UI Path

1. Open Chatwoot account for tenant.
2. Find the conversation created by portal send.
3. Reply as an agent:
   `LCT <RUN_ID> <tenant> incoming`.
4. Return to portal tab.
5. Verify the message appears only in that tenant/thread.

### Local Rails Helper

Use this only in local Chatwoot. Replace conversation ids with ids produced by
the current run.

```bash
cd /home/evluk/projects/chatwoot-ce-stable

PATH=/home/evluk/.rbenv/versions/3.4.4/bin:$PATH \
GEM_HOME=/home/evluk/.rbenv/versions/3.4.4/lib/ruby/gems/3.4.0 \
GEM_PATH=/home/evluk/.rbenv/versions/3.4.4/lib/ruby/gems/3.4.0 \
LCT_RUN_ID="$RUN_ID" \
bin/bundle exec rails runner '
require "json"

run_id = ENV.fetch("LCT_RUN_ID")
items = [
  { slug: "buhfirma", conversation_id: 187 },
  { slug: "stroyfirma", conversation_id: 188 },
  { slug: "zubi", conversation_id: 189 }
]

rows = items.map do |item|
  conversation = Conversation.find(item[:conversation_id])
  user = conversation.account.users.first || User.first
  message = Messages::MessageBuilder.new(
    user,
    conversation,
    {
      content: "LCT #{run_id} #{item[:slug]} incoming",
      message_type: "outgoing"
    }
  ).perform

  {
    slug: item[:slug],
    message_id: message.id,
    account_id: message.account_id,
    inbox_id: message.inbox_id,
    conversation_id: message.conversation_id,
    sender_type: message.sender_type
  }
end

puts JSON.pretty_generate(rows)
'
```

After helper send, portal should show:

- tenant A sees only tenant A incoming message;
- tenant B sees only tenant B incoming message;
- tenant C sees only tenant C incoming message.

## Offline Outbox Checks

Precondition: open each tenant chat online and wait until composer textarea is
enabled. Do not switch browser context offline while the composer still says
`Чат временно недоступен`.

MCP flow:

1. Login tenant A, B and C in separate tabs.
2. Wait for `textarea[aria-label="Сообщение"]:not([disabled])` in every tab.
3. Switch browser context offline.
4. Dispatch `offline` event if the browser automation does not do it.
5. Queue text:
   `LCT <RUN_ID> <tenant> offline`.
6. Confirm each tab shows its own queued message and offline notice.
7. Confirm no tab shows another tenant's queued text.
8. Restore online.
9. Confirm each queued text drains once.
10. Verify Chatwoot routing with Rails query.

Repeat the same flow in a selected group thread:

1. Open the group thread online and wait for enabled composer.
2. Switch browser context offline.
3. Queue text:
   `LCT <RUN_ID> <tenant> group offline outbox`.
4. Confirm the queued text is visible in the group transcript or appears after
   reconnect.
5. Restore online.
6. Verify Chatwoot has one incoming message in the group contact conversation.
7. Verify `Личный чат` does not show the group offline text.

Expected:

- outbox record is scoped by tenant/user/thread;
- offline notice count is tenant-local;
- reconnect does not send tenant A queued text through tenant B config.
- group offline outbox drains into the group contact conversation, not into
  `private:me`.

Reference local run:

- `RUN_ID=20260531153701`;
- group offline outbox messages landed in Chatwoot conversations
  `190`, `191`, `192` for group contacts `247`, `248`, `249`;
- each tenant's group transcript contained its own offline text;
- each tenant's `Личный чат` did not contain the group offline text.

## Cached Group Boot Checks

Precondition: selected group thread has been opened online and cached.

MCP flow:

1. Open each tenant's group thread online.
2. Wait until a known group message is visible.
3. Intercept and hang same-origin startup APIs:
   `/api/tenant`, `/api/auth/me`, `/api/chat/threads` and optionally
   `/api/chat/messages`.
4. Reload `${TENANT_URL}/app/chat`.
5. Wait 5-10 seconds.
6. Verify the cached group header and cached group transcript remain visible.

Expected:

- first meaningful app surface is the cached selected group chat;
- `Личный чат` does not replace the selected group;
- old startup texts do not appear:
  `Открываем кабинет`, `Добро пожаловать`, `Готовим чат`,
  `Загружаем экран`;
- controlled connection copy such as `Соединение...` may appear while cached
  transcript remains readable.

Reference local run:

- `RUN_ID=20260531153701`;
- all three tenants opened cached group chat while `/api/auth/me`,
  `/api/tenant` and `/api/chat/threads` were pending;
- cached group text was visible and no old startup text appeared.

## Attachment Proxy Negative Checks

Precondition: private and group test attachments exist.

MCP/API flow:

1. Fetch current private and group message snapshots.
2. Confirm attachment URLs are portal proxy paths under
   `/api/chat/threads/.../attachments/...`.
3. Open the current tenant's own group attachment URL and expect `200`.
4. Open a group attachment through the private thread path and expect a
   controlled failure.
5. Open a private attachment through the group thread path and expect a
   controlled failure.
6. Open another tenant's group attachment path on the current tenant host and
   expect a controlled failure.

Expected:

- valid same-thread attachment proxy returns content;
- group/private path swap returns `attachment_unavailable`;
- cross-tenant group path returns `thread_access_denied`;
- attachment payloads do not expose direct privileged Chatwoot URLs.

Reference local run:

- `RUN_ID=20260531153701`;
- group attachment positives returned `200 text/plain`;
- group/private path swaps returned `404 attachment_unavailable`;
- cross-tenant group paths returned `403 thread_access_denied`;
- private and group attachment URLs were portal proxy paths, not absolute
  Chatwoot URLs.

## Common Failure Map

| Symptom                                                    | Likely cause                                                            | Fix                                                                           |
| ---------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Code request returns accepted but no email arrives          | Contact email is missing, typoed, exists in another Chatwoot account, or portal user is inactive | Create/enable person contact in the current tenant Chatwoot account with exact email |
| Email-code access works, chat returns `portal_contact_disabled` | `portal_enabled` missing, false, or saved as string                  | Save boolean/checkbox `true` on person contact                                |
| Chat returns `portal_contact_type_invalid`                 | Person contact has wrong/missing `portal_contact_type`                  | Set `portal_contact_type=person`                                              |
| Group thread missing                                       | Person contact has no valid group id list                               | Set `portal_client_group_contact_ids` to group contact id string              |
| Group thread returns denied/missing                        | Group contact missing or in another account                             | Create group contact in same account and use its id                           |
| Group returns `portal_group_contact_disabled`              | Group contact disabled                                                  | Set group `portal_enabled=true`                                               |
| Group returns `portal_group_contact_type_invalid`          | Group contact type is not `group`                                       | Set group `portal_contact_type=group`                                         |
| Removed group still appears in menu                        | Person contact still has the group id or stale cache has not resynced   | Clear/update `portal_client_group_contact_ids`, then refresh/resync           |
| Removed group direct request returns `not_ready`           | Expected fail-closed response after membership removal                  | Treat as PASS if reason is `thread_access_denied` and no message is created   |
| Text/file lands in wrong Chatwoot account                  | Tenant `chatwoot_account_id` or `chatwoot_portal_inbox_id` wrong        | Fix tenant bootstrap/config before testing                                    |
| Group cached boot opens `Личный чат` instead               | Selected group snapshot was not cached or active thread list is stale   | Warm the group online, then rerun the hanging startup check                   |
| Attachment proxy opens wrong thread file                   | Attachment route is not validating thread/conversation ownership        | Stop testing and create a high-risk finding                                   |
| Webhook/incoming message not visible                       | Tenant webhook not configured or wrong API Channel secret               | Run `tenant:chatwoot:webhook:configure` for that tenant                       |
| Composer disabled during offline test                      | Browser went offline before chat reached ready state                    | Reopen online, wait for enabled textarea, then switch offline                 |
| Repeated code-login requests get 429                       | Local auth rate limit                                                   | Wait for rate-limit window or use fewer repeated attempts                     |

## Cleanup

For repeated local runs, usually no cleanup is needed. Use unique `RUN_ID` and
search by prefix.

If local test data becomes noisy:

- delete only the test contacts/conversations created with `LCT <RUN_ID>`;
- do not delete shared tenant account/inbox config;
- do not delete production-like tenant records unless doing a planned clean
  local reset;
- never commit screenshots, `.playwright-mcp`, traces or generated output.

## Minimum Evidence For A Completed LCT Data Run

Keep the following in the final test report:

- `RUN_ID`;
- created person emails per tenant;
- group thread ids if group checks were included;
- Mailpit email-code access success for every person user;
- UI login success for every tenant;
- personal text/file routing proof per tenant;
- group text/file routing proof if group checks were included;
- group membership/revocation proof if multi-user groups were included;
- incoming/admin message proof per tenant;
- offline outbox proof per tenant;
- cached group boot proof if startup/offline-first group checks were included;
- attachment proxy negative proof if file boundary checks were included;
- explicit note for any skipped or blocked subcheck.
