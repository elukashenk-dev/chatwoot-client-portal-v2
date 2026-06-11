# Исследование жизненного цикла Chatwoot account и provisioning портала

Дата: 2026-06-11

Статус: research note preserved for Chatwoot lifecycle facts. MT-10A operator
tenant provisioning is now implemented as portal-owned CLI tooling; current
operator runbook lives in `docs/operations/mt-10-deployment-runbooks.md`.

## Текущий implementation status

MT-10A реализовал recommended portal/operator-owned path:

- `pnpm --dir backend tenant:create -- ...` creates a Chatwoot account, client
  admin, service users, API Channel inbox, webhook configuration and portal
  tenant with encrypted secrets;
- custom-domain tenants use explicit `--primary-domain` and
  `--public-base-url`;
- provider-subdomain tenants use `--provider-subdomain` plus deployment env
  `PORTAL_PROVIDER_TENANT_DOMAIN_SUFFIX`;
- `pnpm --dir backend tenant:chatwoot:reconcile -- --dry-run|--apply` detects
  Chatwoot account drift for provisioned tenants;
- `pnpm --dir backend tenant:deprovision -- --tenant=<slug> --archive-only`
  archives safely, and `--delete-chatwoot-account` additionally requests
  Chatwoot Platform API account deletion after explicit confirmation.

Remaining operations work is production rehearsal, DNS/certificate/proxy
automation for provider-owned subdomains and optional operator UI/audit
wrapping. Public Chatwoot signup remains outside the production portal tenant
creation authority.

## Короткий вывод

Клиент действительно может сам создать новый Chatwoot account со страницы
логина, но только если включен `ENABLE_ACCOUNT_SIGNUP`. Поэтому локально ссылка
`Or Create a new account` может быть видна, а на production отсутствовать.

Делать полноценное автоматическое создание нашего portal tenant из обычного
публичного Chatwoot signup небезопасно и недостаточно надежно:

- Chatwoot signup создает только Chatwoot account и admin user;
- в событии `account_created` нет домена `lk.<client-domain>`;
- в событии нет Chatwoot API token для portal runtime;
- в событии нет API Channel inbox, который нужен нашему portal;
- installation webhook для `account_created` в Chatwoot CE 4.13 вызывается без
  signing secret;
- события `account_deleted` в локальном CE 4.13 коде не найдено.

Лучший операционный путь: наш portal/operator должен быть владельцем
provisioning flow. Он создает клиента через Chatwoot Platform API, создает или
привязывает admin user, создает API Channel inbox через Chatwoot account API,
настраивает webhook и только потом создает tenant в portal DB. Удаление тоже
должно идти через наш operator flow, а ручные удаления в Chatwoot нужно
обнаруживать отдельным reconciliation job.

## Исследованные источники

Официальная документация Chatwoot:

- Chatwoot self-hosted environment variables:
  `https://developers.chatwoot.com/self-hosted/configuration/environment-variables`
- Chatwoot Platform API account create:
  `https://developers.chatwoot.com/api-reference/accounts/create-an-account`
- Chatwoot Platform API account delete:
  `https://developers.chatwoot.com/api-reference/accounts/delete-an-account`
- Chatwoot Platform API user create:
  `https://developers.chatwoot.com/api-reference/users/create-a-user`
- Chatwoot Platform API user details:
  `https://developers.chatwoot.com/api-reference/users/get-an-user-details`

Локальный Chatwoot source of truth:

- repository: `../chatwoot-ce-stable`
- проверенная версия: `v4.13.0-1-g38c6b79b4`
- ветка на момент исследования: `chore/update-chatwoot-4-13-0`

Ключевые локальные файлы Chatwoot:

- `../chatwoot-ce-stable/config/installation_config.yml`
- `../chatwoot-ce-stable/lib/global_config_service.rb`
- `../chatwoot-ce-stable/app/javascript/v3/views/login/Index.vue`
- `../chatwoot-ce-stable/app/javascript/v3/views/auth/signup/components/Signup/Form.vue`
- `../chatwoot-ce-stable/app/javascript/v3/api/auth.js`
- `../chatwoot-ce-stable/app/controllers/api/v1/accounts_controller.rb`
- `../chatwoot-ce-stable/app/builders/account_builder.rb`
- `../chatwoot-ce-stable/app/controllers/platform/api/v1/accounts_controller.rb`
- `../chatwoot-ce-stable/app/controllers/platform/api/v1/users_controller.rb`
- `../chatwoot-ce-stable/app/controllers/platform/api/v1/account_users_controller.rb`
- `../chatwoot-ce-stable/app/controllers/api/v1/accounts/inboxes_controller.rb`
- `../chatwoot-ce-stable/app/models/channel/api.rb`
- `../chatwoot-ce-stable/app/models/account.rb`
- `../chatwoot-ce-stable/app/listeners/installation_webhook_listener.rb`
- `../chatwoot-ce-stable/lib/webhooks/trigger.rb`
- `../chatwoot-ce-stable/app/jobs/delete_object_job.rb`
- `../chatwoot-ce-stable/app/services/account_deletion_service.rb`

Portal-side files checked:

- `backend/src/db/schema.ts`
- `backend/src/modules/tenants/repository.ts`
- `backend/src/modules/tenants/service.ts`
- `backend/src/scripts/bootstrap-default-tenant-core.ts`
- `backend/src/scripts/configure-tenant-chatwoot-webhook-core.ts`
- `backend/src/integrations/chatwoot/client.ts`
- `backend/src/modules/chatwoot-webhooks/routes.ts`

## Почему local и production отличаются на логине Chatwoot

В Chatwoot есть installation config:

```text
ENABLE_ACCOUNT_SIGNUP
```

В `config/installation_config.yml` у него default `false` и описание:

```text
Allow users to signup for new accounts
```

`GlobalConfigService.account_signup_enabled?` читает
`ENABLE_ACCOUNT_SIGNUP` и считает signup включенным, если значение не равно
строке `false`.

На странице логина Chatwoot ссылка создания аккаунта показывается только когда:

```js
window.chatwootConfig.signupEnabled === 'true'
```

Значение приходит из `DashboardController#app_config`, где используется
`GlobalConfigService.load('ENABLE_ACCOUNT_SIGNUP', 'false')`.

Практически это значит:

- local может показывать `Or Create a new account`, если
  `ENABLE_ACCOUNT_SIGNUP=true`;
- production может не показывать эту ссылку, если
  `ENABLE_ACCOUNT_SIGNUP=false` или installation config хранит boolean false.

Отдельный нюанс: legacy значение `ENABLE_ACCOUNT_SIGNUP=api_only` в backend
считается включенным для API-only signup, но frontend login/signup route
проверяет именно строку `true`. Поэтому видимость ссылки на странице логина
показывает только UI-доступность signup, а не все возможные API-only режимы.

Отдельно есть настройка:

```text
CREATE_NEW_ACCOUNT_FROM_DASHBOARD
```

Она управляет не публичным signup на логине, а кнопкой создания нового account
внутри уже авторизованного dashboard account switcher.

## Как Chatwoot создает account через публичный signup

Frontend flow:

1. Пользователь открывает `/app/login`.
2. Если `signupEnabled === 'true'`, видит ссылку на `/app/auth/signup`.
3. Signup form собирает email/password/hCaptcha.
4. Frontend вызывает:

```http
POST /api/v1/accounts.json
```

С payload:

```json
{
  "account_name": "...",
  "user_full_name": "...",
  "email": "...",
  "password": "...",
  "h_captcha_client_response": "..."
}
```

Backend flow:

1. `Api::V1::AccountsController#create` доступен без login только для `create`.
2. `before_action :check_signup_enabled` возвращает 404, если signup выключен.
3. `validate_captcha` проверяет hCaptcha.
4. `AccountBuilder` создает:
   - `Account`;
   - `User`;
   - `AccountUser` с ролью `administrator`.
5. Для обычного web signup ответ содержит только email. Auth headers не
   выдаются до email confirmation.
6. Для `CW_API_ONLY_SERVER=true` или legacy `ENABLE_ACCOUNT_SIGNUP=api_only`
   Chatwoot возвращает auth headers и полный response.

Важно: публичный signup создает Chatwoot account, но не создает наш portal
tenant, не создает домен `lk.<client-domain>`, не создает portal-owned object
storage записи, не создает наш admin branding runtime и не создает нужный нам
Chatwoot API Channel inbox.

## Как Chatwoot создает account через Google OAuth

Если пользователь логинится через OAuth и такого user еще нет:

1. `DeviseOverrides::OmniauthCallbacksController#sign_up_user` проверяет
   `GlobalConfigService.account_signup_enabled?`.
2. Проверяется business email domain.
3. `AccountBuilder` создает account/user/account_user.
4. Пользователя отправляют на password reset flow.

Это тоже signup только внутри Chatwoot, с теми же ограничениями для нашего
portal.

## Как Chatwoot создает account из dashboard

Внутри dashboard есть `AddAccountModal`.

Он вызывает:

```http
POST /api/v1/accounts
```

с `account_name`. Это flow для уже авторизованного Chatwoot user. Кнопка в
account switcher показывается только если включен
`CREATE_NEW_ACCOUNT_FROM_DASHBOARD`.

Для нашего portal это тоже не полноценный provisioning flow, потому что:

- Chatwoot account уже создан внутри dashboard;
- portal не знает, какой публичный домен должен быть у этого account;
- API Channel inbox и webhook надо создавать отдельно;
- portal secrets надо записывать отдельно.

## Platform API Chatwoot

Chatwoot CE 4.13 имеет Platform API:

```http
POST   /platform/api/v1/accounts
GET    /platform/api/v1/accounts
GET    /platform/api/v1/accounts/{account_id}
PATCH  /platform/api/v1/accounts/{account_id}
DELETE /platform/api/v1/accounts/{account_id}

POST   /platform/api/v1/users
GET    /platform/api/v1/users/{id}
PATCH  /platform/api/v1/users/{id}
DELETE /platform/api/v1/users/{id}

POST   /platform/api/v1/accounts/{account_id}/account_users
DELETE /platform/api/v1/accounts/{account_id}/account_users
```

Auth идет через header:

```http
api_access_token: <platform app token>
```

Особенности Platform API:

- `POST /platform/api/v1/accounts` создает `Account` и связывает его с
  `PlatformApp` через `PlatformAppPermissible`;
- `POST /platform/api/v1/users` создает или находит user и тоже связывает с
  `PlatformApp`;
- `POST /platform/api/v1/accounts/{account_id}/account_users` добавляет user в
  account;
- Platform API видит и изменяет только permissible resources своего
  platform app;
- account, созданный обычным публичным signup, сам по себе не становится
  permissible для нашего platform app.

Это делает Platform API хорошим кандидатом для portal-owned provisioning, но
плохим способом “подхватить” произвольный account, который пользователь создал
сам через публичную страницу Chatwoot.

## API Channel inbox

Наш portal работает через Chatwoot API Channel inbox.

В Chatwoot account API inbox создается через:

```http
POST /api/v1/accounts/{account_id}/inboxes
```

с channel type:

```json
{
  "name": "Portal",
  "channel": {
    "type": "api"
  }
}
```

В `Channel::Api` есть:

- `identifier`;
- `secret`;
- `webhook_url`;
- `hmac_token`;
- `hmac_mandatory`;
- `additional_attributes`.

Наш текущий portal умеет:

- проверять, что `chatwoot_portal_inbox_id` указывает на `Channel::Api`;
- настраивать API Channel `webhook_url`;
- читать возвращенный `Channel::Api.secret`;
- сохранять webhook secret encrypted в `portal_tenants`.
- автоматически создавать Chatwoot account, client admin user, service users
  and API Channel inbox through the MT-10A `tenant:create` operator CLI.

## Installation events webhook в Chatwoot

В Chatwoot есть installation config:

```text
INSTALLATION_EVENTS_WEBHOOK_URL
```

Описание в `config/installation_config.yml`:

```text
The URL to which the system events like new accounts created will be sent
```

В локальном CE 4.13 найден только listener:

```ruby
InstallationWebhookListener#account_created
```

Payload:

```json
{
  "id": 123,
  "name": "Account name",
  "event": "account_created",
  "users": []
}
```

или `users` со списком administrators.

Важное ограничение: `InstallationWebhookListener` вызывает:

```ruby
WebhookJob.perform_later(webhook_url, payload)
```

без `secret`. А `Webhooks::Trigger` добавляет
`X-Chatwoot-Signature` только если secret передан. Значит installation event
webhook в этом варианте нельзя считать сильной authority-зоной для
автоматического provisioning. Его можно использовать как notification/discovery
signal, но не как единственное основание создать production tenant.

## Удаление Chatwoot account

Есть несколько путей удаления:

### Super Admin

`SuperAdmin::AccountsController#destroy` ставит:

```ruby
DeleteObjectJob.perform_later(account)
```

### Platform API

`Platform::Api::V1::AccountsController#destroy` тоже ставит:

```ruby
DeleteObjectJob.perform_later(@resource)
```

### Enterprise Cloud delayed deletion

В enterprise/cloud flow `toggle_deletion` ставит в `custom_attributes`:

```text
marked_for_deletion_at
marked_for_deletion_reason
```

Потом `Internal::DeleteAccountsJob` находит просроченные deletion marks,
вызывает `AccountDeletionService`, а тот вызывает `DeleteObjectJob`.

В self-hosted CE это не основной надежный путь, потому что
`Enterprise::Api::V1::AccountsController#toggle_deletion` дополнительно
проверяет cloud environment.

### Что делает DeleteObjectJob

Для `Account` он сначала удаляет heavy associations:

- conversations;
- contacts;
- inboxes;
- reporting events.

Потом вызывает:

```ruby
object.destroy!
```

В `Account` есть:

```ruby
after_destroy :remove_account_sequences
```

Но события `account.deleted`, `account.destroyed` или installation webhook на
удаление в локальном CE 4.13 не найдено.

## Можно ли автоматически создать portal при создании Chatwoot account?

### Если account создан публичным Chatwoot signup

Только частично, и это не готовый production-вариант.

Можно настроить `INSTALLATION_EVENTS_WEBHOOK_URL`, чтобы portal получал
`account_created`. Но этого недостаточно для готового portal tenant:

- нет домена `lk.<client-domain>`;
- нет `public_base_url`;
- нет runtime/admin Chatwoot API token;
- нет API Channel inbox;
- нет API Channel webhook secret;
- account не становится permissible для нашего platform app;
- webhook не подписан secret;
- нет гарантии, что signup создал именно бизнес-клиента, которому надо выдать
  portal.

Максимум безопасного поведения: создать internal “provisioning request” в
состоянии `pending_review`, показать оператору account id/name/admin email и
попросить дозаполнить домен, токены и inbox. Но это не “автоматически создался
готовый портал”.

### Если account создает наш operator/provisioning flow

Да, это можно сделать надежно.

Предлагаемый надежный путь:

1. Оператор вводит клиента:
   - `slug`;
   - display name;
   - основной домен клиента;
   - portal domain `lk.<client-domain>`;
   - admin email/name;
   - настройки лимитов/features, если нужны.
2. Portal backend вызывает Chatwoot Platform API:
   - create account;
   - create или find user;
   - add user to account as administrator.
3. Portal backend получает user access token из platform user response
   (`platform/api/v1/models/_user.json.jbuilder` включает `access_token`) или
   через найденный в локальном swagger endpoint
   `POST /platform/api/v1/users/{id}/token`.
4. Portal backend вызывает Chatwoot account API от имени admin user:
   - create API Channel inbox;
   - set `lock_to_single_conversation=true`;
   - set API Channel `webhook_url` на
     `https://lk.<client-domain>/api/chatwoot/webhooks`;
   - read `Channel::Api.secret` и `identifier`.
5. Portal backend создает `portal_tenants` row:
   - `slug`;
   - `display_name`;
   - `primary_domain`;
   - `public_base_url`;
   - `chatwoot_base_url`;
   - `chatwoot_account_id`;
   - `chatwoot_portal_inbox_id`;
   - encrypted runtime API token;
   - encrypted admin verification token;
   - encrypted API Channel webhook secret.
6. Portal backend запускает verify:
   - tenant by host;
   - Chatwoot account/inbox verification;
   - webhook signature verification;
   - auth/chat/admin branding smoke.

Такой flow не требует менять Chatwoot core. MT-10A реализует его как
`tenant:create` CLI; production still needs operator rehearsal and
DNS/certificate/proxy readiness for the chosen domain mode.

## Можно ли автоматически удалить portal при удалении Chatwoot account?

### Если удаление делает наш operator/provisioning flow

Да, это можно сделать надежно.

Правильная модель:

1. Оператор удаляет или архивирует клиента в нашем portal operator flow.
2. Portal сначала переводит tenant в `suspended` или `archived`, чтобы закрыть
   пользовательский runtime.
3. Portal вызывает Chatwoot Platform API delete account.
4. Portal запускает cleanup своих данных по tenant policy.
5. Portal фиксирует audit/event/outbox статус операции.

Это должен быть saga/outbox flow, потому что Chatwoot delete асинхронный через
`DeleteObjectJob`, и часть шагов может завершиться позже.

### Если account удалили руками в Chatwoot

Полностью автоматического надежного hook в CE 4.13 не видно.

Варианты:

1. Reconciliation job в portal:
   - периодически проверяет связанные `chatwoot_account_id`;
   - если Chatwoot account исчез, переводит portal tenant в `suspended`;
   - если Platform API token не авторизован, возвращает
     `platform_auth_failed` и не меняет tenant status;
   - уведомляет оператора;
   - cleanup выполняется только после подтверждения или policy decision.
2. Запретить ручное удаление Chatwoot accounts вне portal operator flow как
   production policy.
3. Добавить patch в Chatwoot core для `account.deleted` installation event.
   Это технически возможно, но противоречит текущему правилу “Chatwoot core не
   трогать” и увеличивает стоимость сопровождения при обновлениях Chatwoot.

## Что мешает удалить portal tenant физически прямо сейчас

В portal DB большинство таблиц с `tenant_id` ссылаются на `portal_tenants` с:

```ts
onDelete: 'restrict'
```

Это хорошо защищает от случайного удаления tenant, но значит:

- простого физического `DELETE FROM portal_tenants` сейчас быть не должно;
- tenant archival/deletion service уже есть для safe archive и explicit
  Chatwoot delete request;
- надо решить retention policy для пользователей, сессий, chat threads,
  branding assets, push subscriptions, send ledger и webhook deliveries;
- object-storage assets надо удалять через portal-owned metadata, а не только
  удалением bucket/object вслепую.

На первом этапе безопаснее делать `status='archived'` или отдельный
`orphaned/suspended` статус, а physical purge вводить отдельным планом.

## Рекомендация

Не включать публичный `ENABLE_ACCOUNT_SIGNUP=true` на production как основной
способ подключения клиентов к нашему portal.

Для нашей цели лучше:

1. Оставить production Chatwoot signup закрытым:

```text
ENABLE_ACCOUNT_SIGNUP=false
CREATE_NEW_ACCOUNT_FROM_DASHBOARD=false
```

2. Использовать реализованный `portal-tenant-provisioning` slice:

- operator CLI now; admin UI remains optional;
- Chatwoot Platform API client;
- create account;
- create/find admin user;
- add account user administrator;
- create API Channel inbox;
- configure webhook and store `Channel::Api.secret`;
- create portal tenant with encrypted secrets;
- verify/smoke;
- idempotent retry;
- audit/outbox can be added with a future operator UI if needed.

3. Использовать `INSTALLATION_EVENTS_WEBHOOK_URL` только как optional discovery
   signal:

- принять `account_created`;
- создать pending provisioning request;
- не создавать готовый production portal tenant автоматически;
- защищать endpoint хотя бы secret-in-path/IP allowlist, потому что Chatwoot
  installation webhook не подписан secret в найденном коде.

4. Для удаления:

- основной путь: delete/archive through portal operator flow;
- ручные удаления в Chatwoot считать drift;
- использовать reconciliation job, который обнаруживает drift и переводит
  portal tenant в безопасный disabled state;
- physical purge делать отдельным service после backup/retention решения.

## Последствия для MT-10

Текущий MT-10 runbook now treats shared SaaS tenant lifecycle as
operator-repeatable CLI operations, not as public self-service signup.

MT-10A acceptance is implemented:

- оператор может создать нового клиента без ручного SQL;
- Chatwoot account создается через Platform API;
- admin user создан или привязан;
- API Channel inbox создан автоматически;
- webhook URL и secret настроены автоматически;
- portal tenant создан с encrypted secrets;
- повторный запуск idempotent;
- manual Chatwoot deletion переводит portal tenant в `suspended` через
  reconciliation apply;
- Chatwoot core остается нетронутым.

Next operational step: run an end-to-end rehearsal against the intended
production Chatwoot and domain mode, including `/api/tenant`, Chatwoot
verification, webhook configuration and tenant archive/deprovision dry run.
