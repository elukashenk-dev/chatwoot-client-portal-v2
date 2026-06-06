# MT-9 Подготовка Tenant Admin и Брендинга

## Статус

Статус: подготовительный черновик спецификации для
`MT-9 Tenant Admin And Branding Rebuild`.

Этот файл фиксирует первый проход исследования и архитектурной рамки. Это еще
не план реализации. Ближайшая цель - закрыть проверку безопасности `F-MT-004`: сделать
точное исследование прав Chatwoot и зафиксировать tenant-scoped границу для
admin-verification token до реализации любого UI брендинга.

## Проверенные Источники

Источник истины проекта:

- `AGENTS.md`
- `docs/roadmap/work-log.md`
- `docs/architecture/overview.md`
- `docs/roadmap/implementation-plan.md`
- `docs/architecture/decisions.md`
- `docs/architecture/multi-tenant-reference.md`
- `docs/design/portal-ui-ux-baseline.md`
- `docs/findings/F-MT-004-admin-chatwoot-token-boundary.md`

Текущий код:

- `backend/src/db/schema.ts`
- `backend/src/modules/tenants/secrets.ts`
- `backend/src/modules/tenants/service.ts`
- `backend/src/modules/tenants/repository.ts`
- `backend/src/integrations/chatwoot/client.ts`
- `backend/src/integrations/chatwoot/request.ts`
- `backend/src/modules/tenants/routes.test.ts`
- `backend/src/scripts/bootstrap-default-tenant-core.ts`
- `backend/src/scripts/verify-tenant-chatwoot-connection-core.ts`
- `frontend/src/app/AppRoutes.tsx`
- `frontend/src/app/routePaths.ts`

Внешний источник истины по Chatwoot:

- официальная документация:
  `https://developers.chatwoot.com/api-reference/introduction`
- официальная страница Agents endpoint:
  `https://developers.chatwoot.com/api-reference/agents/list-agents-in-account`
- официальный OpenAPI-источник, на который ссылается документация:
  `https://raw.githubusercontent.com/chatwoot/chatwoot/develop/swagger/tag_groups/application_swagger.json`
- локальный source Chatwoot CE:
  - `../chatwoot-ce-stable/app/controllers/api/v1/accounts/agents_controller.rb`
  - `../chatwoot-ce-stable/app/controllers/api/v1/accounts/base_controller.rb`
  - `../chatwoot-ce-stable/app/controllers/concerns/access_token_auth_helper.rb`
  - `../chatwoot-ce-stable/app/controllers/concerns/ensure_current_account_helper.rb`
  - `../chatwoot-ce-stable/app/policies/user_policy.rb`

Архивный источник идей:

- ветка `feature/phase-10-portal-branding-admin`

## Связь С Дорожной Картой

`MT-9` - следующая активная область дорожной карты.

Дорожная карта требует:

- закрыть `F-MT-004` через исследование прав Chatwoot;
- держать runtime Chatwoot token и admin-verification token как разные границы
  безопасности;
- хранить admin-verification token как зашифрованный per-tenant secret;
- начинать tenant-scoped admin login, branding settings, branding assets в
  object storage, audit events и предпросмотры только после закрытия первой
  проверки.

Визуальное сравнение для первого среза не требуется, потому что первый срез
сосредоточен на backend/security. Перед решениями по admin UI брендинга
визуальный предпросмотр снова становится обязательным.

## Текущий Архитектурный Базис

Tenant resolution уже host-based и выполняется до auth/chat runtime.

Текущий `portal_tenants` содержит:

- `slug`;
- `display_name`;
- `status`;
- `primary_domain`;
- `public_base_url`;
- `chatwoot_base_url`;
- `chatwoot_account_id`;
- `chatwoot_portal_inbox_id`;
- `chatwoot_portal_inbox_identifier`;
- `chatwoot_api_access_token_ciphertext`;
- `chatwoot_webhook_secret_ciphertext`.

Tenant secrets шифруются через `AES-256-GCM` в
`backend/src/modules/tenants/secrets.ts` с ключом `PORTAL_TENANT_SECRET_KEY`.

Текущий tenant request context расшифровывает runtime Chatwoot API token и
webhook secret для обычного portal runtime. Этот context используют chat,
profile, notifications, webhooks и tenant public-context flows.

В `MT-9` нельзя просто добавить admin-verification token в общий
`tenant.chatwoot` runtime context. Так более широкий token окажется доступен
модулям, которым admin authority не нужна. Admin token должен расшифровываться
только внутри пути tenant admin verification.

## Базис Chatwoot Agents API

Официальная документация Chatwoot относит Application APIs к account-level /
agent-facing API и указывает, что они аутентифицируются через user
`access_token`.

Официальный Agents endpoint:

```text
GET /api/v1/accounts/{account_id}/agents
```

Официальные OpenAPI-метаданные фиксируют:

- безопасность: `userApiKey`;
- `200`: массив active agents;
- `403`: access denied;
- agent fields включают `id`, `account_id`, `email`, `role`, `confirmed`,
  `availability_status`, `name`, `available_name`, `thumbnail`,
  `custom_role_id`;
- enum роли включает `agent` и `administrator`.

Локальный source Chatwoot CE `v4.13` добавляет важные детали:

- `Api::V1::Accounts::AgentsController#index` возвращает
  `Current.account.users.order_by_full_name.includes(...)`;
- `UserPolicy#index?` возвращает `true`;
- `EnsureCurrentAccountHelper` выставляет `Current.account_user` через
  `account.account_users.find_by(user_id: current_user.id)` и отклоняет запрос,
  если владелец access token не является пользователем в запрошенном account;
- `AccessTokenAuthHelper` принимает user access tokens для обычных Application
  API requests, а bot tokens ограничены небольшим allowlist.

Вывод:

Исследование должно проверить реальное поведение self-hosted production для
нескольких типов владельцев token. Локальный source показывает, что listing
agents может быть не administrator-only, но portal все равно должен требовать,
чтобы email для tenant admin login совпал с agent row, где
`role === "administrator"`, `confirmed === true` и
`account_id === current tenant.chatwoot_account_id`.

## Решение По Границе F-MT-004

Runtime Chatwoot token нужен для customer portal runtime:

- contact lookup;
- thread/contact access;
- conversation/message send;
- profile avatar update;
- webhook/provisioning verification helpers.

Tenant admin verification - отдельная зона:

- проверяет, принадлежит ли email confirmed Chatwoot administrator внутри
  Chatwoot account текущего tenant;
- должна работать даже если runtime token намеренно узкий;
- если token для проверки админа шире, он не должен участвовать в customer
  chat/profile runtime;
- token нельзя отдавать в browser, logs, audit payloads или public tenant
  context.

Обязательное добавление в persistence:

```text
portal_tenants.chatwoot_admin_verification_token_ciphertext
```

Поле должно быть nullable на migration step, чтобы существующие tenants
оставались bootable. Admin login должен fail closed с controlled error, если
значение отсутствует или ciphertext невалиден.

Рекомендуемый паттерн доступа:

- добавить repository/service method, выделенный под получение admin
  verification token;
- расшифровывать token только в `admin-auth` service/factory;
- оставить generic `TenantRequestContext.chatwoot` ограниченным runtime token и
  webhook secret;
- не прокидывать admin token через shared Chatwoot runtime objects, которые
  используют chat/profile modules.

## Аудит Архивной Ветки

Архивная ветка `feature/phase-10-portal-branding-admin` полезна только как архив
идей.

Идеи, которые можно переиспользовать:

- отдельный admin auth module;
- отдельная admin session cookie;
- email-code verification вместо чтения Chatwoot cookies;
- generic response для email, которые не имеют доступа;
- повторная проверка роли перед созданием admin session;
- form model с defaults, overrides и final snapshot;
- предпросмотр на portal components.

Не переносить как есть:

- schema keyed by `chatwoot_account_id` / `chatwoot_inbox_id`, а не
  `tenant_id`;
- admin sessions and challenges не tenant-scoped;
- service code использует global `CHATWOOT_ACCOUNT_ID` и
  `CHATWOOT_PORTAL_INBOX_ID`;
- branding storage DB/string based и не реализует object-storage backed tenant
  assets;
- route structure старше текущего protected app shell, profile route, tenant
  identity cache и PWA baseline;
- docs paths и work-log naming старше текущего docs layout.

Вывод:

Ветка может подсказать UX и форму services, но все задачи реализации MT-9 нужно
переписать tenant-first.

## Рекомендуемая Декомпозиция MT-9

### MT-9A. Проверка Chatwoot-Админа

Цель:

- доказать точное поведение Chatwoot Agents API для владельцев token и целевых
  пользователей;
- добавить точный design для отдельного зашифрованного admin-verification token;
- закрыть или обновить `F-MT-004` только после реализации, которая проверит
  boundary.

Минимальный результат:

- документ исследования:
  `docs/spikes/2026-06-06-chatwoot-admin-agents-permissions.md`;
- план реализации для admin token storage и verification boundary;
- backend tests, доказывающие, что missing/invalid/insufficient token fails
  safely;
- backend tests, доказывающие, что tenant A admin verification не может
  authenticate tenant B, если этот email не является administrator в tenant B;
- без UI брендинга.

### MT-9B. Базис Авторизации Tenant Admin

Цель:

- добавить tenant-scoped admin challenges, admin sessions и audit events;
- использовать same-origin routes `/admin/...` на текущем tenant host;
- проверять admin email через отдельный Chatwoot admin-verification token;
- отправлять tenant-scoped email code;
- создать httpOnly admin session cookie, отдельную от customer session cookie.

Обязательные инварианты:

- admin auth никогда не читает Chatwoot browser cookies;
- admin auth никогда не использует customer `portal_users` или
  `portal_sessions`;
- строки challenge/session содержат `tenant_id`;
- email enumeration остается controlled;
- role повторно проверяется перед созданием session;
- logout очищает только admin session.

### MT-9C. Базис Настроек Брендинга

Цель:

- добавить tenant-scoped branding settings и controlled brand tokens;
- открыть public read model через tenant-owned backend route;
- оставить system/security copy locked;
- применить safe tokens к существующим auth/chat/PWA components.

Этот срез может использовать идеи полей из архивной ветки, но persistence scope
должен быть `tenant_id`, а не Chatwoot IDs.

### MT-9D. Брендинговые Assets и PWA-Идентичность

Цель:

- добавить S3-compatible object storage для branding assets;
- хранить object metadata в portal DB;
- отдавать assets только после tenant-scoped DB lookup;
- сохранить PWA manifest/icons tenant-aware and cache-safe;
- использовать MinIO или совместимый local object storage для разработки.

### MT-9E. Admin UI Брендинга и Предпросмотр

Цель:

- добавить admin screens только после проверки backend boundary;
- использовать реальные portal components в предпросмотре;
- включить визуальное сравнение перед финальными UI decisions;
- держать admin UI отдельно от customer app shell.

## Цель Первого Среза

Рекомендуемая первая ветка реализации:

```text
feature/phase-9-admin-token-spike
```

Рекомендуемый первый файл плана:

```text
docs/superpowers/plans/2026-06-06-mt-9-admin-token-spike.md
```

Рекомендуемый первый файл исследования:

```text
docs/spikes/2026-06-06-chatwoot-admin-agents-permissions.md
```

Первый срез не должен добавлять branding fields, asset uploads или admin UI. Он
должен только установить token boundary и проверить права Chatwoot.

## Предложенная Матрица Исследования

Проверить на локальном Chatwoot `v4.13` и, если безопасно, на production-like
Chatwoot через non-destructive read-only requests:

| Владелец token                       | Что нужно проверить                                                |
| ------------------------------------ | ------------------------------------------------------------------ |
| confirmed administrator in account A | может вызвать account A agents endpoint; возвращает admins/agents  |
| confirmed agent in account A         | проверить доступность endpoint; target login все равно denied      |
| user from another account            | account A endpoint возвращает unauthorized/access denied           |
| agent bot token                      | agents endpoint denied из-за bot endpoint allowlist                |
| invalid token                        | controlled unauthorized/access denied                              |
| runtime token candidate              | записать, может ли он list agents; не полагаться на него для admin |
| separate admin-verification token    | preferred token после исследования                                 |

Результат исследования должен зафиксировать:

- exact HTTP status и response shape;
- всегда ли присутствуют `confirmed`, `role`, `email`, `account_id`;
- содержит ли response inactive/deleted users;
- может ли narrow runtime token list agents;
- может ли non-admin user token list agents;
- выбранную operational token policy.

## Backend-Заметки Для Плана

Persistence для admin token:

```text
portal_tenants.chatwoot_admin_verification_token_ciphertext text null
```

Таблицы admin auth:

```text
portal_admin_login_challenges
portal_admin_sessions
portal_admin_audit_events
```

Каждая admin table должна включать `tenant_id`.

Предлагаемые поля challenge:

- `tenant_id`;
- `email`;
- `chatwoot_account_id`;
- `chatwoot_agent_id`;
- `code_hash`;
- `status`;
- `attempts_count`;
- `max_attempts`;
- `expires_at`;
- `resend_not_before`;
- `last_sent_at`;
- `verified_at`;
- timestamps.

Предлагаемые поля session:

- `tenant_id`;
- `email`;
- `chatwoot_account_id`;
- `chatwoot_agent_id`;
- `token_hash`;
- `expires_at`;
- `last_seen_at`;
- timestamps.

Предлагаемые поля audit event:

- `tenant_id`;
- `admin_email`;
- `chatwoot_account_id`;
- `chatwoot_agent_id`;
- `event_name`;
- `target_type`;
- `target_id`;
- `metadata_json`;
- timestamp.

Cookie admin session:

- отдельное имя, например `portal_admin_session`;
- httpOnly;
- SameSite Lax;
- Secure в production;
- same tenant host boundary как у customer cookie;
- без offline/PWA cache для admin auth.

## Frontend-Заметки Для Будущих Срезов

Admin routes должны быть отделены от customer routes:

```text
/admin/login
/admin/verify
/admin/branding
```

Admin UI не должен жить внутри текущего customer `AppShellLayout`.

Предпросмотр брендинга должен использовать реальные components и текущий design
baseline:

- auth frame;
- app brand mark;
- chat header;
- outgoing message bubble color;
- предпросмотр названия и иконки PWA.

Первый проход планирования UI должен включать визуальное сравнение, потому что
UI брендинга - пользовательская feature.

## Обязательные Тесты

Для MT-9A:

- tenant repository хранит optional admin-verification ciphertext без exposing
  plaintext;
- tenant admin token decryption rejects missing/invalid ciphertext safely;
- Chatwoot Agents response parser принимает official fields и отклоняет unsafe
  shapes;
- admin verification фильтрует по email, `account_id`,
  `role === "administrator"` и `confirmed === true`;
- runtime token и admin-verification token не являются одной и той же dependency
  в service factory;
- cross-tenant verification attempts rejected;
- insufficient Chatwoot permission возвращает controlled error и не создает
  challenge/session.

Для MT-9B:

- request login возвращает generic response для unknown/non-admin email;
- eligible admin получает один challenge email;
- resend cooldown tenant/email scoped;
- wrong/expired/reused code rejected;
- role downgrade between request and verify blocks session;
- logout clears admin cookie;
- tenant A admin session cannot access tenant B admin route.

Для MT-9C и дальше:

- branding settings `tenant_id` scoped;
- public branding response не содержит secrets или object keys;
- tenant A cannot read/write tenant B branding;
- asset reads require tenant DB lookup before object storage fetch;
- PWA manifest and icon URLs versioned/cache-safe.

## Открытые Вопросы Перед Полным Планом MT-9

1. Admin login должен использовать только email code или email code plus magic
   link?

   Рекомендация для первого среза: только email code, как в текущей operational
   model registration/password-reset, без усложнения link URL.

2. Должен ли первый срез branding settings включать asset uploads?

   Рекомендация: нет. Начать с text/color settings и fallback/logo URL только
   если нужно для предпросмотра; object-storage asset upload добавить отдельным
   срезом.

3. Какой object storage target использовать для local development?

   Рекомендация: MinIO в `infra/`, когда откроем срез object storage.

4. Должны ли admin routes быть доступны, если tenant status не `active`?

   Рекомендация: нет для первого среза. Использовать active tenant runtime gate,
   если позже не появится operations requirement для отдельного admin recovery
   path.

5. Должны ли изменения Chatwoot agent role сразу инвалидировать существующие
   portal admin sessions?

   Рекомендация: re-check role перед sensitive writes и на session refresh
   intervals; не дергать Chatwoot на каждый render admin page, пока первый
   auth-базис не измерен.

## Не-Цели Первого Среза

- Без изменений Chatwoot core.
- Без browser-direct Chatwoot API.
- Без platform/provisioning token для tenant admin login.
- Без реализации object storage в исследовании прав.
- Без branding admin UI в исследовании прав.
- Без customer profile/admin merge.
- Без переиспользования archived branch code без переписывания tenant
  boundaries.

## Критерии Приемки Этого Документа

- Документ мапит MT-9 на текущие стабильные docs и `F-MT-004`.
- Документ выделяет первую обязательную проверку перед UI work.
- Документ фиксирует findings из официальных docs Chatwoot, OpenAPI и local
  Chatwoot source.
- Документ объясняет, почему archived branch годится только как архив идей.
- Документ дает достаточно деталей, чтобы написать сфокусированный план реализации
  для MT-9A.
