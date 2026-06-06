# MT-9C Дизайн UI Входа В Админку Tenant

## Статус

Статус: утвержденная дизайн-спецификация для первого frontend-среза tenant admin
UI.

Пользователь 2026-06-06 принял визуальное направление `C. Админ-консоль` и
отдельный вход `Admin Console Gateway`.

Этот документ не является планом реализации. Следующий шаг после ревью этой
спеки - отдельный подробный план реализации.

## Связь С Roadmap

`MT-9C` опирается на уже закрытую backend-основу `MT-9B`:

- `POST /api/admin/auth/request`;
- `POST /api/admin/auth/verify`;
- `GET /api/admin/auth/me`;
- `POST /api/admin/auth/logout`;
- отдельная cookie admin session `portal_admin_session`;
- tenant-scoped проверка email через Chatwoot administrator row;
- отсутствие Chatwoot authority в браузере.

`MT-9C` добавляет только frontend-boundary для входа/session и первый shell
админ-консоли. Полноценное редактирование брендинга остается следующим
срезом.

## Цель

Сделать отдельный вход администратора tenant и защищенный `/admin`, чтобы
будущая админка брендинга имела правильную auth/session границу до появления
настроек цветов, логотипов, текстов и live preview.

Пользовательский результат первого среза:

- администратор открывает `/admin/login`;
- вводит email администратора Chatwoot;
- получает 6-значный код на email;
- подтверждает код;
- попадает в `/admin/branding`;
- видит desktop-first админ-консоль с группировкой: левая навигация, рабочая
  панель настроек, правая зона предпросмотра;
- может выйти из admin session.

## Не Входит В Срез

В этот срез не входят:

- persistence для branding settings;
- загрузка logo/header/footer/app icon assets;
- object storage для брендинга;
- применение новых branding tokens к customer portal runtime;
- audit UI;
- управление администраторами;
- изменение customer auth или customer session;
- любые browser-side Chatwoot tokens;
- мобильная полноценная админка.

## Подтвержденный Future Scope Брендинга

Этот scope обсужден и принят как направление для следующего branding slice.
`MT-9C` не реализует эти настройки, но первый admin shell должен отражать эти
будущие группы, чтобы админка не выглядела случайной заготовкой.

Identity и assets:

- название портала/tenant;
- логотип tenant;
- fallback-монограмма, если логотип не загружен;
- PWA/app icon;
- название приложения для PWA/Home Screen.

Цвета:

- основной цвет бренда;
- цвет кнопок и focus states;
- цвет исходящих сообщений клиента;
- optional accent color для небольших декоративных элементов.

Фоны и поверхности:

- общий background image для auth-экранов;
- header/background image для auth-экранов;
- footer/decorative image для auth-экранов;
- общий background image для чата;
- background image для шапки чата;
- controlled overlays/fades, чтобы текст, кнопки, сообщения и статусы оставались
  читаемыми.

Тексты:

- label поддержки, например `Поддержка`;
- заголовок auth-экранов;
- подзаголовок auth-экранов;
- help/welcome текст на auth-экранах;
- welcome/help текст в чате;
- текст пустого состояния чата, если он не обещает SLA или доступность агентов.

Страницы портала, которые должны поддерживать branding frame:

- основной экран чата;
- шапка чата;
- пустое состояние чата;
- состояние `чат недоступен/не готов`;
- страница информации о чате;
- профиль;
- настройки;
- уведомления;
- loading/error/retry pages без кастомизации security-sensitive copy.

Что остается system-owned и не кастомизируется:

- тексты ошибок входа, OTP, password/security-сообщений;
- названия полей форм;
- тексты кнопок критических действий;
- порядок auth steps;
- OTP length, resend timer and lockout;
- password policy;
- offline/retry/error states;
- системные статусы сообщений;
- layout чата и composer;
- PWA scope/start URL;
- Chatwoot/runtime/security settings.

## Принятое Визуальное Решение

Выбран вариант `C. Админ-консоль`.

Модель экрана `/admin/branding`:

- слева вертикальная навигация админки;
- текущий первый пункт - `Брендинг`;
- центральная часть - рабочая область настроек с компактными группами;
- справа - зона будущего live preview клиентского портала;
- структура готова к будущей двухпанельной админке, где слева меняются
  настройки, а справа сразу видна копия портала.

Первый проход не должен рисовать фейковый production-preview с независимыми
компонентами. Зона предпросмотра в `MT-9C` должна быть shell-state с четкой
рамкой будущего подключения реальных portal components. Полная интеграция
preview входит в следующий branding slice.

## Вход В Админ-Консоль

`/admin/login` - отдельный вход в админ-консоль, не customer login.

Визуальная модель:

- компактная карточка входа;
- заголовок на русском: `Вход в админ-консоль`;
- tenant identity видна, но сдержанно: имя tenant и monogram fallback из
  текущего public tenant context;
- logo, primary color и другие branding tokens не используются в `MT-9C`, потому
  что persistence брендинга остается следующим срезом;
- без маркетинговой landing page;
- security-sensitive copy остается system-owned.

Flow состоит из двух шагов.

Шаг email:

- поле `Email администратора`;
- CTA `Получить код`;
- вызывает `POST /api/admin/auth/request`;
- при успешном ответе переходит к шагу кода;
- если backend вернул pending challenge с cooldown, UI показывает controlled
  info state и таймер повторной отправки;
- если backend вернул `TENANT_ADMIN_DELIVERY_IN_PROGRESS`, UI остается на шаге
  email и показывает controlled error/info state без создания второго
  параллельного запроса.

Шаг кода:

- заголовок `Подтвердите вход`;
- 6 отдельных OTP ячеек или существующий shared OTP layout;
- CTA `Войти в админ-консоль`;
- `Изменить email` возвращает на первый шаг;
- `Отправить код еще раз` доступен только после `resendAvailableInSeconds`;
- вызывает `POST /api/admin/auth/verify`.

После успешного verify:

- backend выставляет admin session cookie;
- frontend обновляет admin session state через response или `/me`;
- пользователь попадает в `/admin/branding` или во внутренний admin-return path,
  сохраненный в React Router state;
- query-параметры и внешние URL для return path в `MT-9C` не используются.

## Поведение Маршрутов

Добавить admin route namespace:

- `/admin/login` - public admin gateway;
- `/admin` - protected admin namespace;
- `/admin/branding` - первая защищенная страница;
- `/admin` редиректит на `/admin/branding`.

Поведение:

- unauthenticated `/admin` и `/admin/branding` редиректят на `/admin/login`;
- authenticated `/admin/login` редиректит на `/admin/branding`;
- customer session не считается admin session;
- admin session не открывает customer `/app`;
- wildcard routing не должен случайно уводить admin paths в customer auth
  flow.

## Frontend Boundary

Customer auth остается в `features/auth`. Для админки нужен отдельный boundary,
чтобы не смешать customer session, offline startup cache и admin authority.

Рекомендуемые модули:

- `features/admin-auth/api/adminAuthClient.ts`;
- `features/admin-auth/lib/AdminSessionProvider.tsx`;
- `features/admin-auth/lib/adminSessionContext.ts`;
- `features/admin-auth/pages/AdminLoginPage.tsx`;
- `features/admin-auth/components/AdminEmailStep.tsx`;
- `features/admin-auth/components/AdminCodeStep.tsx`;
- `features/admin-shell/pages/AdminBrandingPage.tsx`;
- `features/admin-shell/components/AdminConsoleLayout.tsx`.

Можно переиспользовать shared UI:

- `TenantAuthShell` или shared auth shell primitives для tenant identity frame;
- `OtpVerificationFormLayout`, если он не протекает customer-specific copy;
- `PrimaryButton`;
- `TextField`;
- `FormField`;
- `InlineAlert`;
- shared input styles.

Нельзя переиспользовать customer `AuthSessionProvider` как admin provider.
Причина: customer provider включает customer `/api/auth/*`, offline startup
cache, PWA/session assumptions and `/app` redirects. Admin auth должен быть
online-only и scoped to `/api/admin/auth/*`.

Правило размещения маршрутов:

- admin routes должны оставаться внутри `TenantProvider`, чтобы host-based tenant
  context был доступен;
- admin routes не должны находиться внутри customer `ProtectedRoute` или
  `PublicAuthRoute`;
- план реализации должен явно решить текущий `App.tsx` факт, что
  `AuthSessionProvider` сейчас оборачивает все `AppRoutes`: либо переместить
  customer `AuthSessionProvider` внутрь customer subtree, либо доказать тестами,
  что customer provider не gate-ит `/admin` и customer offline cache не влияет
  на решение об admin session.

## Модель Admin Session

Состояния frontend admin session:

- `checking`;
- `unauthenticated`;
- `authenticated`;
- `error`.

Источник session:

- только online backend check;
- без IndexedDB/localStorage cache;
- без PWA offline startup restore;
- без background sync.

Admin provider должен:

- делать `GET /api/admin/auth/me` при входе в admin route boundary и при
  проверке уже открытого `/admin/login`;
- использовать credentials/cookies;
- считать `401 TENANT_ADMIN_UNAUTHORIZED` нормальным unauthenticated state;
- показывать controlled retry state при network/server error;
- иметь `refreshSession`;
- иметь `signOut`, который вызывает `POST /api/admin/auth/logout` и чистит
  локальный state.

## API Contract

Frontend client вызывает:

```text
POST /api/admin/auth/request
Body: { "email": "admin@example.com" }
Response: {
  "delivery": "sent" | "existing_pending",
  "email": "admin@example.com",
  "expiresInSeconds": 900,
  "nextStep": "verify_code",
  "purpose": "tenant_admin_login",
  "resendAvailableInSeconds": 60,
  "result": "admin_login_challenge_requested"
}

POST /api/admin/auth/verify
Body: { "email": "admin@example.com", "code": "123456" }
Response: {
  "admin": {
    "chatwootAgentId": 11,
    "email": "admin@example.com",
    "role": "administrator"
  },
  "session": { "expiresAt": "..." }
}

GET /api/admin/auth/me
Response: {
  "admin": {
    "chatwootAgentId": 11,
    "email": "admin@example.com",
    "role": "administrator"
  },
  "session": { "expiresAt": "..." }
}

POST /api/admin/auth/logout
Response: 204
```

UI не должен зависеть от Chatwoot `availability_status`,
`auto_offline`, avatar fields или agent list shape. Backend уже скрывает это
внутри admin verification.

Факты backend route, которые важны для frontend:

- `request`, `verify` и `logout` требуют allowed tenant origin и tenant context;
- `me` читает signed admin cookie и возвращает session только в scope текущего
  tenant host;
- `me` может вернуть `401 TENANT_ADMIN_UNAUTHORIZED`; это не ошибка UI, а
  обычное состояние отсутствия admin session.

## Error Handling

Шаг email:

- frontend валидирует пустой и некорректный email до request;
- backend validation messages показываются через `InlineAlert` или field error;
- `TENANT_ADMIN_NOT_ELIGIBLE`,
  `TENANT_ADMIN_VERIFICATION_UNAVAILABLE`,
  `TENANT_ADMIN_DELIVERY_UNAVAILABLE` и
  `TENANT_ADMIN_DELIVERY_IN_PROGRESS` используют backend-controlled copy;
- `delivery: existing_pending` переводит пользователя на шаг кода и показывает
  info state, а не обещает новую отправку email.

Шаг кода:

- frontend принимает только 6 цифр;
- expired/invalid/attempt-limit errors приходят из backend;
- invalid code оставляет пользователя на шаге кода;
- expired или missing challenge может предлагать возврат на шаг email.

Проверка session:

- `401` означает показ login;
- network/server errors показывают retry, а не silent redirect loop;
- logout failure оставляет пользователя на admin page с видимой ошибкой и retry.

Правило security copy:

- сообщения об invalid credentials, challenge expiry, attempt limits и session
  failure остаются system-owned и не редактируются через брендинг.

## Responsive Behavior

Login gateway должен работать на mobile и desktop.

Админ-консоль desktop-first. Для narrow screens ниже выбранного desktop
breakpoint `/admin/branding` показывает controlled state:

- title: `Админ-консоль доступна с широкого экрана`;
- короткое объяснение, что настройки и предпросмотр требуют desktop ширину;
- logout action остается доступным;
- editing controls не показываются в narrow state.

Точный breakpoint выбирается при реализации, но план должен стартовать от
`1024px`, если conventions кодовой базы не подскажут другое значение.

## Data And Security Boundaries

Обязательные invariants:

- браузер никогда не получает Chatwoot API token или admin verification token;
- admin auth использует только `/api/admin/auth/*`;
- customer auth использует только `/api/auth/*`;
- admin session cookie отделена от customer session cookie;
- admin logout не разлогинивает customer session;
- customer logout не чистит admin session молча, если backend позже не введет
  отдельный global logout;
- admin session не пишется в localStorage, IndexedDB, service worker cache или
  startup cache;
- admin UI не записывает tenant settings в `MT-9C`.

## Первый Экран Админки

`/admin/branding` в `MT-9C` - shell, а не полноценный редактор брендинга.

Обязательная видимая структура:

- левая навигация с выбранным пунктом `Брендинг`;
- page title `Брендинг`;
- компактные cards/groups для будущих настроек:
  - `Основное`;
  - `Цвета`;
  - `Фоны и изображения`;
  - `Тексты`;
  - `Чат`;
  - `Страницы портала`;
- правая панель с заголовком `Предпросмотр`;
- clear disabled states для controls, которые еще не активны.

Controls должны выглядеть как будущий admin workbench, но не должны притворяться,
что сохраняют реальные branding settings до появления persistence.

## Acceptance Criteria

- `/admin/login` поддерживает email-code admin login через MT-9B endpoints.
- `/admin` редиректит на `/admin/branding`.
- `/admin` и `/admin/branding` защищены admin session.
- Только customer session не открывает `/admin`.
- Только admin session не открывает customer `/app`.
- Authenticated admin на `/admin/login` редиректится на `/admin/branding`.
- Admin logout вызывает backend logout и возвращает пользователя на
  `/admin/login`.
- Login copy и admin page copy написаны на русском.
- Security-sensitive copy остается system-owned.
- Первый admin page использует принятую структуру `Админ-консоль`.
- Narrow admin console state контролируемый и не показывает сломанный layout.
- Branding persistence, asset upload и Chatwoot browser authority не добавлены.

## Required Tests

Frontend unit/component tests:

- `adminAuthClient` покрывает success/error handling для
  request/verify/me/logout;
- email step валидирует форму и успешно переводит пользователя на code step;
- code step покрывает digit validation, cooldown/resend state и verify submit;
- admin session provider покрывает `checking`, `authenticated`,
  `unauthenticated` и recoverable `error`;
- route tests покрывают unauthenticated/admin-authenticated/customer-authenticated
  combinations.

Browser/runtime validation:

- Playwright e2e или documented blocker для login flow:
  - открыть `/admin/login`;
  - запросить код через test backend/mail channel или route mock;
  - подтвердить код;
  - попасть на `/admin/branding`;
  - logout возвращает на `/admin/login`.

Backend tests из `MT-9B` не требуют новой coverage, если frontend work не меняет
backend contracts.

## Implementation Notes For The Next Plan

Recommended order для implementation plan:

1. Добавить admin auth client и typed response parsing.
2. Добавить isolated admin session context/provider.
3. Добавить admin route guards and paths.
4. Собрать `/admin/login` с email/code steps.
5. Собрать `/admin/branding` shell с desktop console layout and narrow state.
6. Добавить route/component tests.
7. Запустить frontend targeted tests, lint/build, затем browser smoke.

Implementation plan должен проверить существующие CSS/layout conventions перед
финальным выбором component/file placement.
