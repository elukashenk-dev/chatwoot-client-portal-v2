# MT-9C Tenant Admin Login UI Design

## Статус

Статус: утвержденная дизайн-спецификация для первого frontend-среза tenant admin
UI.

Пользователь 2026-06-06 принял визуальное направление `C. Админ-консоль` и
отдельный вход `Admin Console Gateway`.

Этот документ не является implementation plan. Следующий шаг после ревью этой
спеки - отдельный подробный план реализации.

## Связь С Roadmap

`MT-9C` опирается на уже закрытый backend foundation `MT-9B`:

- `POST /api/admin/auth/request`;
- `POST /api/admin/auth/verify`;
- `GET /api/admin/auth/me`;
- `POST /api/admin/auth/logout`;
- отдельная admin session cookie;
- tenant-scoped проверка email через Chatwoot administrator row;
- отсутствие Chatwoot authority в browser.

`MT-9C` добавляет только frontend login/session boundary и первый shell
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
  панель настроек, правая панель preview;
- может выйти из admin session.

## Non-Goals

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

## Принятое Визуальное Решение

Выбран вариант `C. Админ-консоль`.

Модель экрана `/admin/branding`:

- слева вертикальная навигация админки;
- текущий первый пункт - `Брендинг`;
- центральная часть - рабочая область настроек с компактными группами;
- справа - live preview клиентского портала;
- структура готова к будущей двухпанельной админке, где слева меняются
  настройки, а справа сразу видна копия портала.

Первый проход не должен рисовать фейковый production-preview с независимыми
компонентами. Preview area в `MT-9C` должна быть shell-state с четкой рамкой
будущего подключения реальных portal components. Полная интеграция preview
входит в следующий branding slice.

## Admin Login Gateway

`/admin/login` - отдельный вход в админ-консоль, не customer login.

Визуальная модель:

- компактная карточка входа;
- заголовок на русском: `Вход в админ-консоль`;
- tenant brand visible but restrained: имя tenant, logo/monogram fallback,
  primary color для CTA/focus;
- без маркетинговой landing page;
- security-sensitive copy остается system-owned.

Flow состоит из двух шагов.

Шаг email:

- поле `Email администратора`;
- CTA `Получить код`;
- вызывает `POST /api/admin/auth/request`;
- при успешном ответе переходит к шагу кода;
- если backend вернул pending challenge с cooldown, UI показывает controlled
  info state и таймер повторной отправки.

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
- пользователь попадает в `/admin/branding` или в безопасный исходный
  admin-return URL.

## Route Behavior

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

## Frontend Architecture Boundary

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

- `TenantAuthShell` or shared auth shell primitives for tenant brand frame;
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

## Admin Session Model

Frontend admin session states:

- `checking`;
- `unauthenticated`;
- `authenticated`;
- `error`.

Session source:

- только online backend check;
- без IndexedDB/localStorage cache;
- без PWA offline startup restore;
- без background sync.

Admin provider должен:

- делать `GET /api/admin/auth/me` при входе в admin route boundary;
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
`auto_offline`, avatar fields или agent list shape. Backend already hides that
inside admin verification.

## Error Handling

Email step:

- frontend validates empty and invalid email before request;
- backend validation messages are displayed through `InlineAlert` or field
  error;
- unauthorized/non-admin email uses backend-controlled response semantics and
  copy.

Code step:

- frontend accepts only 6 digits;
- expired/invalid/attempt-limit errors come from backend;
- invalid code keeps the user on code step;
- expired or missing challenge can offer returning to email step.

Session check:

- `401` means show login;
- network/server errors show retry, not silent redirect loop;
- logout failure keeps user on admin page with visible error and retry.

Security copy rule:

- messages about invalid credentials, challenge expiry, attempt limits and
  session failure stay system-owned and are not editable through branding.

## Responsive Behavior

Login gateway must work on mobile and desktop.

Admin console is desktop-first. For narrow screens under the chosen desktop
breakpoint, `/admin/branding` shows a controlled state:

- title: `Админ-консоль доступна с широкого экрана`;
- short explanation that settings and live preview require desktop width;
- logout action remains available;
- no editing controls are shown in the narrow state.

The exact breakpoint can be chosen during implementation, but the plan should
start from `1024px` unless codebase conventions suggest another value.

## Data And Security Boundaries

Required invariants:

- browser never receives Chatwoot API token or admin verification token;
- admin auth uses only `/api/admin/auth/*`;
- customer auth uses only `/api/auth/*`;
- admin session cookie is separate from customer session cookie;
- admin logout does not log out customer session;
- customer logout does not silently clear admin session unless backend later
  chooses a global logout feature;
- no admin session in localStorage, IndexedDB, service worker cache or startup
  cache;
- admin UI must not write tenant settings in `MT-9C`.

## First Admin Screen Content

`/admin/branding` in `MT-9C` is a shell, not a full branding editor.

Required visible structure:

- left nav with `Брендинг` selected;
- page title `Брендинг`;
- compact cards or groups for future settings:
  - `Основное`;
  - `Цвета`;
  - `Изображения`;
  - `Тексты`;
- right pane titled `Предпросмотр`;
- clear disabled states for controls that are not active yet.

Controls should look like the future admin workbench but must not pretend to
save real branding settings before persistence exists.

## Acceptance Criteria

- `/admin/login` supports email-code admin login over MT-9B endpoints.
- `/admin` redirects to `/admin/branding`.
- `/admin` and `/admin/branding` are protected by admin session.
- Customer session alone cannot open `/admin`.
- Admin session alone does not open customer `/app`.
- Authenticated admin visiting `/admin/login` is redirected to
  `/admin/branding`.
- Admin logout calls backend logout and returns to `/admin/login`.
- Login copy and admin page copy are in Russian.
- Security-sensitive copy remains system-owned.
- First admin page uses the accepted `Админ-консоль` structure.
- Narrow admin console state is controlled and does not show broken layout.
- No branding persistence, asset upload or Chatwoot browser authority is added.

## Required Tests

Frontend unit/component tests:

- `adminAuthClient` request/verify/me/logout success and error handling;
- email step validation and successful transition to code step;
- code step digit validation, cooldown/resend state and verify submit;
- admin session provider handles `checking`, `authenticated`,
  `unauthenticated` and recoverable `error`;
- route tests for unauthenticated/admin-authenticated/customer-authenticated
  combinations.

Browser/runtime validation:

- Playwright e2e or documented blocker for the login flow:
  - open `/admin/login`;
  - request code through test backend/mail channel or route mock;
  - verify code;
  - land on `/admin/branding`;
  - logout returns to `/admin/login`.

Backend tests from `MT-9B` do not need new coverage unless frontend work changes
backend contracts.

## Implementation Notes For The Next Plan

Recommended order for the implementation plan:

1. Add admin auth client and typed response parsing.
2. Add isolated admin session context/provider.
3. Add admin route guards and paths.
4. Build `/admin/login` with email/code steps.
5. Build `/admin/branding` shell with desktop console layout and narrow state.
6. Add route/component tests.
7. Run frontend targeted tests, lint/build, then browser smoke.

The implementation plan must check existing CSS/layout conventions before
finalizing component and file placement.
