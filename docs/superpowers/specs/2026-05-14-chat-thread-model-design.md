# Дизайн Модели Chat Threads

Дата: 2026-05-14

## Статус

Дизайн принят для планирования. Реализация в этой ветке еще не начата.

## Production Quality Bar

Эта модель проектируется сразу как production-grade runtime, а не как
облегченный MVP.

Инкрементальная реализация допустима только как способ снизить риск изменения,
а не как разрешение на временные обходы, слабую безопасность или технический
долг. Каждый merged slice должен быть законченным, тестируемым и безопасным в
своем scope.

Запрещено:

- временно доверять `threadId`, `company contact id` или Chatwoot conversation
  id из браузера без backend authority check;
- включать company send/realtime до закрытия authenticated send rate limiting;
- добавлять fallback, который показывает историю или открывает send при
  невалидной Chatwoot contact configuration;
- создавать скрытую portal admin surface для управления company memberships;
- хранить Chatwoot secrets, conversation authority или membership authority во
  frontend state/local storage;
- оставлять known security finding как "потом исправим", если он находится на
  пути включаемого runtime.

## Цель

Поддержать несколько клиентских чатов в portal без новой отдельной админки для
клиентских компаний и участников.

Администратор tenant-а продолжает использовать Contacts и пользовательские
атрибуты контактов в Chatwoot как поверхность настройки. Portal backend читает
эту конфигурацию, валидирует ее и владеет runtime mappings, правом отправки,
доступом к истории и realtime-доставкой.

Этот дизайн расширяет текущий архитектурный baseline `one portal user -> one
primary conversation`. Новый baseline должен стать `portal user -> available
threads -> authoritative conversation`. Старый один чат становится частным
случаем нового `private` thread.

## Термины

- `tenant`: компания, которая владеет portal и Chatwoot account, например
  PROVGROUP.
- `person contact`: Chatwoot contact, который представляет реального
  пользователя portal, например Иван Петров.
- `company contact`: Chatwoot contact, который представляет клиентскую
  компанию, например ООО "Ромашка".
- `thread`: portal-owned цель чата, доступная текущему portal user. В Chatwoot
  объекта `thread` нет. Portal thread мапится на один Chatwoot contact и со
  временем на один Chatwoot conversation.

## Продуктовая Модель

У одного portal user может быть:

- один личный thread на весь tenant;
- ноль или больше общих company threads.

Пример:

```text
Tenant: PROVGROUP
  Person contact: Иван Петров
    private thread: Личный чат
    company thread: ООО "Ромашка"
    company thread: ИП Петров
```

Приватных чатов между клиентскими пользователями нет. Личный thread существует
только между одним portal user и командой поддержки tenant-а.

Это соответствует B2B product goal: B2B-компания продолжает работать в
Chatwoot, а конечные клиенты получают брендированный PWA-чат. Для управления
доступом к общим чатам не добавляется новый portal admin UI; настройка остается
в Chatwoot Contacts.

## Конфигурация Chatwoot

Все атрибуты ниже являются пользовательскими атрибутами контакта в Chatwoot. В
форме создания пользовательского атрибута поле `Применить к` должно быть
`Контакт`.

### Тип Контакта

```text
Отображаемое имя: Тип контакта
Ключ: portal_contact_type
Тип: Список
Значения: person, company
```

Правила:

- `person` означает, что contact представляет реального portal user.
- `company` означает, что contact представляет клиентскую компанию с общим
  чатом.

### Доступен В Портале

```text
Отображаемое имя: Доступен в портале
Ключ: portal_enabled
Тип: Флажок
```

Правила:

- `true` разрешает portal backend использовать этот contact.
- `false` заставляет portal игнорировать этот contact для login, списка
  threads, истории, отправки и realtime-доступа.

### ID Компаний Для Общих Чатов

```text
Отображаемое имя: ID компаний для общих чатов
Ключ: portal_client_company_contact_ids
Описание: ID контактов Chatwoot для компаний, к общим чатам которых имеет доступ этот человек. Несколько ID указывать через запятую.
Тип: Текст
```

Правила:

- Поле заполняется только у `person` contacts.
- Значения - это Chatwoot contact IDs company contacts.
- Значения указываются как integers через запятую, например `154` или
  `154,203`.
- Backend принимает пробелы после запятых, но рекомендуемый формат - без
  пробелов.
- У `company` contacts это поле остается пустым.

Contact ID - это числовой `id` в route и API контакта Chatwoot. Например,
`/app/accounts/3/contacts/154` указывает на contact ID `154` в account `3`.
Backend всегда должен валидировать contact IDs в scope текущего tenant Chatwoot
account.

## Примеры Контактов В Chatwoot

Company contact:

```text
Name: ООО "Ромашка"
Email: office@romashka.ru
Identifier: optional

Custom attributes:
  portal_contact_type = company
  portal_enabled = true
  portal_client_company_contact_ids = пусто
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

## Регистрация И Login

Проверка права на регистрацию использует Chatwoot account текущего tenant-а и
email, который ввел пользователь.

Для `ivan@example.com` backend должен:

1. Найти Chatwoot contact по email внутри текущего tenant Chatwoot account.
2. Потребовать `portal_contact_type = person`.
3. Потребовать `portal_enabled = true`.
4. Завершить существующий email-code и password flow.
5. Связать portal user с person Chatwoot contact.

Portal не должен разрешать пользователю самостоятельно заявлять доступ к
компаниям во время регистрации. Доступ к компаниям берется только из
`portal_client_company_contact_ids` на Chatwoot person contact.

## Список Threads

После login frontend запрашивает доступные portal threads.

Концептуальный endpoint:

```text
GET /api/chat/threads
```

Backend:

1. Резолвит текущий tenant по host.
2. Резолвит текущего portal user по session.
3. Загружает связанный Chatwoot person contact.
4. Валидирует `portal_contact_type = person` и `portal_enabled = true`.
5. Парсит `portal_client_company_contact_ids`.
6. Загружает каждый указанный Chatwoot contact по ID внутри текущего tenant
   Chatwoot account.
7. Требует, чтобы каждый указанный contact имел
   `portal_contact_type = company` и `portal_enabled = true`.
8. Возвращает один private thread и один company thread на каждый валидный
   company contact.

Пример ответа:

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

Frontend не должен получать или использовать Chatwoot conversation IDs как
authority. Thread IDs - это portal IDs. Backend валидирует каждую операцию по
thread.

Default active thread:

1. Использовать последний выбранный thread, если он все еще доступен.
2. Иначе использовать `private:me`.
3. Если private thread недоступен из-за ошибки конфигурации, использовать первый
   доступный company thread.

## Runtime Persistence

Пользовательские атрибуты Chatwoot являются source of truth для конфигурации.
Portal DB хранит только runtime state.

Нужная runtime-концепция:

```text
portal_chat_threads
  tenant_id
  thread_type: private | company
  portal_user_id: nullable, заполнено для private threads
  chatwoot_contact_id: target person/company contact для этого thread
  chatwoot_inbox_id
  chatwoot_conversation_id: nullable, пока conversation еще не создан
  created_at
  updated_at
```

Уникальность:

- один private thread на `tenant_id + portal_user_id`;
- один company thread на `tenant_id + chatwoot_contact_id`.

Существующий `portal_user_contact_links` может остаться как связь portal user с
его Chatwoot `person` contact. Существующий
`portal_user_chatwoot_conversations` больше не подходит как целевая модель,
потому что company thread должен быть общим для нескольких portal users. Его
нужно заменить или мигрировать в thread-level mappings.

`portal_chat_message_sends` тоже должен перейти с user-level
`primary_conversation_id` на thread-level scope, чтобы idempotency и audit
работали одинаково для private и company threads. Browser по-прежнему не
получает direct Chatwoot authority.

## Совместимость С Текущей Моделью

Текущий chat runtime построен вокруг одного `primaryConversation` на portal
user. Новая модель не отменяет уже выбранные границы, но меняет ключевую
единицу маршрутизации:

```text
было: portal user -> primary conversation
стало: portal user -> thread -> authoritative conversation
```

Что сохраняется:

- tenant resolution по host;
- tenant-scoped portal DB;
- registration/password reset через email-code flows;
- Chatwoot как system of record для contacts, conversations, messages и
  attachments;
- backend-only Chatwoot authority;
- lazy bootstrap conversation при первом send;
- tenant portal inbox как `Channel::Api` с `lock_to_single_conversation = true`;
- webhook validation и delivery dedupe в tenant scope.

Что меняется:

- `/api/chat/context`, `/api/chat/messages`, `/api/chat/messages/attachment` и
  `/api/chat/realtime` должны принимать portal `threadId` вместо
  `primaryConversationId` как browser-facing selector;
- chat context должен резолвить не "чат текущего user", а "конкретный thread,
  доступный текущему user";
- webhook routing должен мапить `chatwoot_conversation_id -> portal thread`,
  затем доставлять событие одному user для private thread или всем актуально
  допущенным users для company thread;
- frontend state должен хранить список threads и активный thread.

Миграционный путь:

1. Ввести чтение и строгую валидацию Chatwoot contact attributes.
2. Добавить `portal_chat_threads` и создать private thread как совместимый
   эквивалент текущего одного чата.
3. Перевести backend API с `primaryConversationId` на `threadId`, сохранив
   lazy bootstrap.
4. Добавить company threads по `portal_client_company_contact_ids`.
5. Перевести webhook/realtime fanout на thread model.
6. Обновить UI: левое меню как thread switcher и активный thread в header.

После реализации этой модели нужно обновить устойчивые source-of-truth docs:
`docs/ARCHITECTURE.md`, `docs/DECISIONS.md`,
`docs/MULTI_TENANT_PORTAL_ARCHITECTURE_PLAN.md` и при необходимости
`docs/IMPLEMENTATION_PLAN.md`. В них сейчас зафиксирован старый baseline "один
primary conversation per tenant user".

## Ленивое Создание Conversation

Threads могут существовать до появления Chatwoot conversations.

Когда пользователь открывает thread без mapped conversation, portal может
показать empty state. Portal не должен создавать Chatwoot conversation только
для просмотра пустого чата.

При первой отправке backend:

1. Валидирует доступ пользователя к thread.
2. Резолвит или создает Chatwoot `ContactInbox`/source ID для target contact в
   tenant portal inbox.
3. Создает или восстанавливает Chatwoot conversation для этого contact.
4. Сохраняет `chatwoot_conversation_id` в `portal_chat_threads`.
5. Отправляет сообщение в этот conversation.

Для company threads Chatwoot contact - это company contact. Для private threads
Chatwoot contact - это person contact.

## Автор Сообщения

В private threads Chatwoot conversation принадлежит person contact, поэтому
агент уже видит, кто написал.

В company threads Chatwoot conversation принадлежит company contact. Backend
должен сохранить реального автора в portal-owned send ledger и сделать автора
понятным в Chatwoot.

Обязательный content сообщения в Chatwoot для company thread:

```md
**Иван Петров**
Добрый день, нужна сверка.
```

Правила:

- Имя автора отправляется Markdown-strong через `**...**`.
- Исходный текст пользователя идет со следующей строки без Markdown-цитаты.
- HTML-разметку не отправлять.
- Blockquote через `>` не использовать как основной формат: визуально это
  выглядит как цитата и не является стабильной частью API-channel контракта.

Portal UI должен отрисовать то же сообщение через структурированные author
metadata, без Chatwoot Markdown-prefix:

```text
Иван Петров
Добрый день, нужна сверка.
```

Send ledger должен хранить минимум:

- tenant ID;
- thread ID;
- portal user ID;
- client message key;
- Chatwoot conversation ID;
- Chatwoot message ID, если он уже известен;
- send status;
- snapshot display name автора.

## Доступ К Истории

Все чтения истории должны валидировать доступ к thread в момент запроса.

Доступ к private thread:

- текущий portal user должен владеть private thread;
- связанный person contact все еще должен быть `person` и
  `portal_enabled = true`.

Доступ к company thread:

- person contact текущего portal user все еще должен быть `person` и
  `portal_enabled = true`;
- `portal_client_company_contact_ids` все еще должен содержать contact ID
  компании;
- company contact все еще должен быть `company` и `portal_enabled = true`.

Если доступ удалили в Chatwoot, старые runtime mappings остаются, но больше не
дают доступ.

## Realtime И Webhooks

Chatwoot webhooks приходят на tenant-scoped callback и по-прежнему валидируются
tenant webhook secret и account/inbox invariants.

После валидного webhook backend мапит Chatwoot conversation на portal thread:

- если conversation mapped на private thread, событие отправляется только этому
  portal user;
- если conversation mapped на company thread, событие отправляется active
  sessions portal users, у которых текущий Chatwoot person contact содержит этот
  company contact ID;
- если thread mapping еще нет, backend может восстановить/создать mapping из
  contact webhook conversation, когда contact является валидным enabled
  `person` или `company` portal contact.

Realtime subscriptions должны быть scoped по tenant и thread, а не только по
user и conversation.

Для company thread fanout нельзя полагаться только на старые subscriptions.
Перед публикацией backend должен проверять актуальные Chatwoot attributes
получателей или использовать свежий валидированный cache, чтобы пользователь,
которого убрали из `portal_client_company_contact_ids`, не получил новые
события из общего чата.

## UI

Post-login chat UI использует существующее левое меню как thread switcher.
Отдельного экрана списка чатов нет.

Меню:

```text
Чаты
  ✓ Личный чат
    ООО "Ромашка"
    ИП Петров

Центр поддержки      скоро
```

Правила:

- текущий thread отмечен `✓`;
- клик по thread переключает активный чат;
- если threads много, они все равно живут в меню;
- вход в центр поддержки остается отдельным пунктом.

Header:

```text
Поддержка клиентов
Личный чат · Онлайн
```

или:

```text
Поддержка клиентов
ООО "Ромашка" · Онлайн
```

Активный thread должен быть виден и в меню, и в header. Composer всегда
отправляет в активный thread.

## Ошибки Конфигурации

Для production предпочтительно строгое поведение при ошибках конфигурации.

Примеры:

- у person contact нет `portal_contact_type = person`;
- у person contact `portal_enabled = false`;
- `portal_client_company_contact_ids` содержит не-integer значение;
- указанный contact ID не существует в текущем Chatwoot account;
- указанный contact не имеет `portal_contact_type = company`;
- у указанного company contact `portal_enabled = false`.

Пользовательское сообщение должно оставаться controlled и не раскрывать
технические детали:

```text
Доступ к порталу настроен некорректно. Обратитесь в поддержку.
```

Backend logs должны содержать конкретную misconfiguration.

## Operational Notes

Поскольку Chatwoot Contacts являются поверхностью настройки, tenant admin в
Chatwoot должен поддерживать три пользовательских атрибута:

- `portal_contact_type`;
- `portal_enabled`;
- `portal_client_company_contact_ids`.

Если эти attribute definitions отсутствуют или заполнены неправильно, portal
должен fail closed. Для production полезен backend diagnostic check, который
проверяет наличие definitions и валидность ссылок `person -> company contact`.
Этот check не является новой админкой и не дает browser-у Chatwoot authority; он
нужен для support/debugging.

## Правила Безопасности

- Browser никогда не получает Chatwoot tokens.
- Browser никогда не выбирает Chatwoot conversation напрямую.
- Каждый route валидирует tenant, session, доступ к thread и актуальные
  Chatwoot attributes.
- Chatwoot contact IDs валидны только в scope текущего tenant
  `chatwoot_base_url + chatwoot_account_id`.
- Старые runtime mappings не дают доступ после изменения Chatwoot attributes.
- Unknown thread IDs возвращают controlled `403`/configuration errors.

## Стратегия Тестирования

Backend unit/integration tests:

- registration разрешает только enabled `person` contacts;
- registration отклоняет disabled contacts, company contacts и missing Chatwoot
  contacts;
- thread listing возвращает private thread плюс указанные company threads;
- thread listing отклоняет malformed company contact IDs;
- thread listing отклоняет missing/disabled/non-company referenced contacts;
- private send bootstraps один private conversation;
- company send bootstraps один company conversation и добавляет Markdown-author
  prefix для Chatwoot;
- доступ к истории запрещается после удаления company ID из person contact;
- webhook fanout отправляет private events только пользователю;
- webhook fanout отправляет company events только пользователям, у которых
  текущие contact attributes ссылаются на company contact ID.
- старый one-chat сценарий покрывается как private thread compatibility path.

Frontend tests:

- menu отображает available threads и active marker;
- переключение thread обновляет subtitle в header;
- composer отправляет active portal thread ID;
- configuration error state показывается без раскрытия внутренних деталей.

Rendered QA:

- mobile left menu с 1, 3 и большим числом threads;
- header subtitle помещается для длинных названий компаний;
- переключение между private и company threads;
- empty thread до первого сообщения;
- first-send bootstrap flow.

## References

- Chatwoot Contacts API `Show Contact` использует
  `/api/v1/accounts/{account_id}/contacts/{id}`, где `id` - contact ID:
  https://developers.chatwoot.com/api-reference/contacts/show-contact
- Chatwoot Contacts API `List Contacts` возвращает contact objects с `id`:
  https://developers.chatwoot.com/api-reference/contacts/list-contacts
- Локальный Chatwoot CE source подтверждает, что dashboard contact routes
  используют `/accounts/:accountId/contacts/:contactId`, а backend загружает
  contacts через `Current.account.contacts.find(params[:id])`.
