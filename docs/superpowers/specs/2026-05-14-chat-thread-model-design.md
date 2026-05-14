# Дизайн Модели Chat Threads

Дата: 2026-05-14

## Статус

Дизайн принят для планирования. Реализация в этой ветке еще не начата.

## Цель

Поддержать несколько клиентских чатов в portal без новой отдельной админки для
клиентских компаний и участников.

Администратор tenant-а продолжает использовать Contacts и пользовательские
атрибуты контактов в Chatwoot как поверхность настройки. Portal backend читает
эту конфигурацию, валидирует ее и владеет runtime mappings, правом отправки,
доступом к истории и realtime-доставкой.

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

Существующие user-level contact и conversation mappings нужно рефакторить в
thread-level mappings. Browser по-прежнему не получает direct Chatwoot authority.

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

Рекомендуемый content сообщения в Chatwoot для company thread:

```text
Иван Петров:
Добрый день, нужна сверка.
```

Portal UI может отрисовать то же сообщение через структурированные author
metadata:

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
- company send bootstraps один company conversation и добавляет prefix автора
  для Chatwoot;
- доступ к истории запрещается после удаления company ID из person contact;
- webhook fanout отправляет private events только пользователю;
- webhook fanout отправляет company events только пользователям, у которых
  текущие contact attributes ссылаются на company contact ID.

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
