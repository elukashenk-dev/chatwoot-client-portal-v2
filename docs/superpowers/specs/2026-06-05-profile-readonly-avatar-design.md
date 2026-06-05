# Profile Read-Only Avatar Design

## Scope

Эта спека фиксирует первый slice пользовательского меню `Профиль` для
`chatwoot-client-portal-v2`.

Цель slice:

- добавить пункт `Профиль` в правое меню чата;
- показать компактную full-screen страницу профиля;
- вывести read-only данные пользователя: имя, email и телефон;
- разрешить пользователю загрузить или заменить свой аватар;
- синхронизировать avatar upload с linked Chatwoot contact в админке Chatwoot.

Проектные границы остаются прежними:

- browser не получает Chatwoot authority;
- portal backend остается единственной authority-зоной для auth, session,
  profile read, avatar upload и Chatwoot contact update;
- Chatwoot остается external service и source of truth для contact phone/avatar;
- portal database не использует runtime-базу Chatwoot.

## Current Baseline

Текущий frontend:

- protected app routes находятся под `/app`;
- chat page использует `ChatFullScreenPanel` для chat-adjacent pages:
  `Информация о чате`, `Медиа и файлы`, `Поиск по чату`, `Уведомления`;
- правое меню чата сейчас содержит thread-specific actions и logout;
- левое nav menu содержит список чатов и `Настройки`;
- auth session context уже хранит `id`, `email`, `fullName`.

Текущий backend:

- `/api/auth/me` возвращает `session.expiresAt` и public portal user:
  `id`, `email`, `fullName`;
- `portal_users` хранит `email`, `full_name`, `is_active`, `last_login_at`;
- `portal_user_contact_links` связывает portal user с Chatwoot contact внутри
  tenant;
- `chat-threads` уже умеет резолвить linked person contact через tenant/session;
- backend avatar proxy уже существует для agent/message avatars и group thread
  avatars, чтобы browser видел только portal `/api/...` URLs.

Открытые findings не блокируют этот slice напрямую. `F-MT-004` относится к
tenant admin token boundary для `MT-9`, а не к customer profile contact avatar.

## User Decisions

Зафиксированные решения:

- `Профиль` должен быть в правом меню, а не в левом nav menu.
- В правом меню используем группировку:
  - `Аккаунт`: `Профиль`;
  - `Чат`: `Поиск по чату`, `Медиа и файлы`, `Уведомления`,
    `Информация о чате`;
  - `Завершить диалог` остается destructive action ниже.
- Экран профиля использует вариант `A. компактная карточка`.
- Имя, email и телефон только read-only.
- Телефон берется из linked Chatwoot contact.
- В первом slice нет удаления аватара.
- Если аватар есть, кнопка называется `Заменить аватар`.
- Если аватара нет, кнопка называется `Загрузить аватар`.
- Avatar upload идет через portal backend в Chatwoot file upload. Browser не
  получает прямой Chatwoot URL.

## External Chatwoot Baseline

Официальная Chatwoot Application API поддерживает обновление contact через:

```text
PUT /api/v1/accounts/{account_id}/contacts/{id}
```

Документация указывает поля `phone_number`, `avatar` и `avatar_url`; `avatar`
можно отправлять как файл, а `avatar_url` как URL на jpeg/png.

Официальная Chatwoot Public Contacts API поддерживает:

```text
PATCH /public/api/v1/inboxes/{inbox_identifier}/contacts/{contact_identifier}
```

Документация public API также описывает avatar, но локальный Chatwoot `v4.13`
controller для public contacts update permit-ит `avatar_url`, а не file
`avatar`, поэтому для этого slice public API не является лучшим upload path.

Локальный Chatwoot `v4.13` source подтверждает Application API behavior:

- `Api::V1::Accounts::ContactsController#update` принимает `:avatar`,
  `:avatar_url`, `:phone_number`;
- `Avatarable#acceptable_avatar` ограничивает avatar:
  - максимум `15 MB`;
  - content types: `image/jpeg`, `image/png`, `image/gif`;
- `DELETE /api/v1/accounts/:account_id/contacts/:id/avatar` существует, но
  удаление аватара не входит в первый slice.

Использованные источники:

- https://developers.chatwoot.com/api-reference/contacts/update-contact
- https://developers.chatwoot.com/api-reference/contacts-api/update-a-contact
- `../chatwoot-ce-stable/app/controllers/api/v1/accounts/contacts_controller.rb`
- `../chatwoot-ce-stable/app/controllers/public/api/v1/inboxes/contacts_controller.rb`
- `../chatwoot-ce-stable/app/models/concerns/avatarable.rb`

## UX Design

### Right Menu

Правое меню чата получает визуальное разделение:

```text
Аккаунт
  Профиль

Чат
  Поиск по чату
  Медиа и файлы
  Уведомления
  Информация о чате

Завершить диалог
```

Правила:

- `Профиль` не зависит от selected thread и не disabled при отсутствии thread.
- Chat-specific items остаются disabled, если нет `selectedThreadId`.
- Escape/outside click/focus restore behavior остается как у текущего menu.
- `Завершить диалог` остается destructive и визуально отделенным действием.

### Profile Page

Route:

```text
/app/profile
```

Страница использует текущий `ChatFullScreenPanel`:

- title: `Профиль`;
- back button возвращает к `/app/chat`;
- loading state: `Загружаем профиль.`;
- unavailable state: `Не удалось загрузить профиль.`;
- retry вызывает повторную загрузку profile endpoint.

Layout:

- centered max-width block, как user settings pages;
- avatar card сверху;
- display name/email hint под avatar;
- primary avatar action button:
  - `Загрузить аватар`, если avatar отсутствует;
  - `Заменить аватар`, если avatar есть;
- read-only fields card:
  - `Имя`;
  - `Email`;
  - `Телефон`.

Read-only field fallback:

- `Имя`: `Не указано`, если пусто;
- `Email`: из current portal user, fallback не нужен для authenticated user;
- `Телефон`: `Не указан`, если Chatwoot contact не содержит phone number.

### Avatar Display

Frontend показывает avatar только через portal-owned URL:

```text
/api/profile/avatar
```

или versioned variant:

```text
/api/profile/avatar?version=<opaque-version>
```

Browser не получает:

- Chatwoot Application API URLs;
- Chatwoot admin URLs;
- direct ActiveStorage URLs вроде `/rails/active_storage/...`;
- Chatwoot API tokens.

Если avatar отсутствует или proxy недоступен, UI показывает initials fallback.

## Backend API Design

### Get Profile

Endpoint:

```text
GET /api/profile
```

Response:

```json
{
  "avatarUrl": "/api/profile/avatar?version=...",
  "email": "name@group.ru",
  "fullName": "Portal User",
  "phoneNumber": "+79001234567",
  "result": "ready"
}
```

If profile cannot be resolved:

```json
{
  "avatarUrl": null,
  "email": "name@group.ru",
  "fullName": "Portal User",
  "phoneNumber": null,
  "reason": "contact_unavailable",
  "result": "unavailable"
}
```

Profile read rules:

- authenticated session is required;
- tenant context is required;
- backend resolves current portal user and linked Chatwoot person contact;
- backend never returns Chatwoot contact id, source id, account id, inbox id or
  direct Chatwoot asset URL;
- `email` and `fullName` come from portal auth user;
- `phoneNumber` and avatar presence come from linked Chatwoot contact.

### Get Avatar

Endpoint:

```text
GET /api/profile/avatar
```

Rules:

- authenticated session is required;
- tenant context is required;
- backend resolves linked Chatwoot person contact;
- backend fetches the contact avatar URL from Chatwoot contact details;
- backend proxies the actual avatar bytes through the existing attachment/avatar
  proxy safety model:
  - allowed origins include current tenant Chatwoot base URL;
  - private network handling follows existing local dev rules;
  - redirects/body timeout/content headers follow existing proxy behavior;
  - cache-control remains private/no-store unless implementation proves a safer
    versioned private cache.

### Upload Avatar

Endpoint:

```text
POST /api/profile/avatar
```

Request:

- `multipart/form-data`;
- single file field: `avatar`.

Validation:

- authenticated session required;
- tenant context required;
- current portal user must have linked Chatwoot person contact;
- accepted MIME types:
  - `image/jpeg`;
  - `image/png`;
  - `image/gif`;
- maximum size: `15 MB`;
- empty file rejected;
- overlarge file rejected before Chatwoot call when possible;
- backend remains authority even if frontend pre-validates.

Chatwoot sync:

- backend calls Application API:

```text
PUT /api/v1/accounts/{account_id}/contacts/{contact_id}
```

- request is multipart/form-data with `avatar` file;
- backend uses tenant runtime Chatwoot config;
- browser never sees the Chatwoot API token or direct upload URL.

Response:

```json
{
  "avatarUrl": "/api/profile/avatar?version=...",
  "result": "updated"
}
```

Failure behavior:

- if Chatwoot update fails, backend returns controlled error and frontend keeps
  the old avatar;
- if contact link is missing or contact is unavailable, backend fails closed;
- upload success means Chatwoot accepted the avatar update.

## Data And Persistence

No portal DB migration is required for the first slice.

Portal DB remains source for:

- authenticated portal user;
- tenant-scoped user/contact link.

Chatwoot remains source for:

- contact phone number;
- contact avatar.

The first slice does not persist avatar metadata in portal DB. If cache busting
needs an opaque version, it can be derived from the fresh Chatwoot contact avatar
URL/thumbnail string without exposing that value directly to the browser.

## Frontend State

New frontend area:

```text
frontend/src/features/profile/
```

Expected pieces:

- profile API client;
- `UserProfilePage`;
- hook for loading profile and uploading avatar;
- tests for page rendering, upload success and upload failure.

State model:

- `isLoading`;
- `isUploading`;
- `profile`;
- `errorMessage`;
- `uploadErrorMessage`.

Upload UX:

- file input is visually represented by the avatar action button;
- while uploading, disable avatar button and show progress text such as
  `Загружаем...`;
- on success, update profile avatar URL and keep read-only fields unchanged;
- on failure, show inline alert and keep old avatar preview.

Frontend pre-validation:

- reject unsupported file type before upload when browser exposes MIME type;
- reject files over `15 MB`;
- reject empty files;
- backend remains authority.

## Security And Privacy

Security invariants:

- no browser-direct Chatwoot access;
- no Chatwoot API token in browser;
- no direct Chatwoot avatar URL in public profile response;
- all profile routes are tenant-scoped and session-scoped;
- profile route cannot read or update another portal user's contact;
- upload can only update linked person contact, not group contacts;
- phone number is read-only in this slice;
- avatar upload cannot change name, email, phone, custom attributes or blocked
  state.

Privacy behavior:

- avatar is visible inside the portal and in Chatwoot admin as the contact
  avatar;
- push payloads and service worker data are not changed by this slice;
- offline cache does not need to persist profile data in this first slice.

## Error Handling

Controlled user-facing messages:

- profile load unavailable:
  `Не удалось загрузить профиль.`;
- unsupported avatar type:
  `Можно загрузить JPEG, PNG или GIF.`;
- avatar too large:
  `Файл должен быть не больше 15 МБ.`;
- empty avatar:
  `Файл пустой. Выберите другое изображение.`;
- Chatwoot sync failure:
  `Не удалось обновить аватар. Попробуйте позже.`;
- missing linked contact:
  `Профиль временно недоступен. Обратитесь в поддержку.`;

Implementation can reuse existing `ApiError` response shape and frontend
request error handling.

## Tests And Validation

Backend tests:

- `GET /api/profile` requires auth and tenant.
- `GET /api/profile` returns portal user name/email and Chatwoot phone/avatar
  presence without exposing Chatwoot ids/URLs.
- `GET /api/profile` fails closed when contact link/contact lookup is missing.
- `GET /api/profile/avatar` proxies only the current user's linked contact
  avatar through allowed origins.
- `POST /api/profile/avatar` rejects unauthenticated requests.
- `POST /api/profile/avatar` rejects empty, oversized and unsupported files.
- `POST /api/profile/avatar` updates only the linked person contact avatar.
- `POST /api/profile/avatar` does not update another tenant/user contact.
- Chatwoot request shape for multipart contact avatar update is covered.

Frontend tests:

- right menu renders grouped `Аккаунт` / `Чат` sections and opens `Профиль`.
- profile page renders compact card and read-only fields.
- missing phone renders `Не указан`.
- avatar action label switches between `Загрузить аватар` and
  `Заменить аватар`.
- frontend rejects unsupported/empty/oversized files before upload.
- successful upload refreshes avatar URL.
- failed upload keeps old avatar and shows alert.

Runtime/browser validation:

- Playwright or equivalent browser check opens right menu, opens profile,
  sees read-only fields and upload control.
- Avatar upload smoke can be local only if Chatwoot test contact is available;
  otherwise document the runtime blocker and rely on backend integration tests.

Required checks before completion:

- targeted backend tests for profile module/client;
- targeted frontend tests for profile page/menu;
- frontend typecheck/build or documented blocker;
- backend build/tests or documented blocker;
- root lint/code-health where scope risk warrants it;
- `git diff --check`.

## Non-Goals

Not included in this slice:

- editing name, email or phone;
- deleting avatar;
- storing avatar binary or metadata in portal DB;
- object storage integration for user avatars;
- tenant admin/profile management;
- branding changes;
- notification center;
- offline profile cache;
- any direct browser Chatwoot runtime.

## Open Implementation Notes

Implementation should decide exact file/module boundaries after reading local
patterns, but the expected direction is:

- add backend `profile` module instead of extending auth/chat modules too far;
- reuse `resolveAuthenticatedPortalUser`;
- reuse tenant runtime Chatwoot client construction from existing routes;
- add Chatwoot client method for contact avatar update;
- reuse existing avatar proxy/attachment allowlist code where possible;
- add frontend `features/profile` route and keep shared UI primitives generic.
