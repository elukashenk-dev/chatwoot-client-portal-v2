# MT-8.5 Portal UI/UX Baseline

Документ фиксирует продуктовую спецификацию брендируемого customer-facing
PWA-чата перед `MT-9 Tenant Admin And Branding Rebuild`.

Цель `MT-8.5` - перейти от рабочего интерфейса к white-label клиентскому
приложению, которое разные B2B tenants смогут адаптировать под бренд без
поломки UX, визуальной иерархии, безопасности и основных сценариев.

## Scope

- Auth: вход, регистрация, email-code/OTP, установка пароля, восстановление
  доступа, session loading/error.
- Chat: app shell, header, loading, empty/not-ready, transcript, message
  bubbles, attachments, voice, realtime/offline states, composer.
- PWA identity: app name, icon, manifest colors, iOS Home Screen metadata,
  splash/loading behavior.
- Future branding admin: настройки, ограничения, preview screens and validation.

Non-goals:

- не реализуем tenant admin в `MT-8.5`;
- не добавляем branding asset storage до `MT-9`;
- не даем клиенту свободно редактировать layout, auth/security copy или
  порядок критических действий;
- не меняем backend authority boundary: browser не получает Chatwoot authority.

## Product Principles

- Один tenant = один узнаваемый клиентский кабинет.
- Branding работает через controlled tokens and content slots, а не через
  произвольный CSS/HTML.
- Сценарий важнее декора: CTA, ошибки, поля, порядок шагов и security states
  остаются системными.
- Белый лейбл должен выглядеть профессионально даже с минимальным брендингом:
  название, монограмма, основной цвет и PWA icon уже дают рабочий baseline.
- Brand preview в админке должен использовать реальные portal components, а не
  отдельную нарисованную копию.
- Auth header images always receive a system-owned bottom fade into the page
  background; auth footer images always receive a system-owned top fade into
  the page background. Tenants upload artwork, not manually faded layout assets.

## Content Ownership

Tenant-owned copy:

- controlled auth title and subtitle slots explicitly listed as brandable;
- controlled helper/welcome body slots explicitly listed as brandable;
- support label and optional legal/support link labels;
- safe chat empty helper when it does not promise SLA, agent availability or
  product behavior.

System-owned copy:

- CTA labels by default;
- form labels, field hints and validation messages;
- screen titles outside explicitly brandable auth title slots;
- loading/status labels, offline labels, retry labels and success handoff copy;
- message metadata, delivery status, resend countdown and password rules.

Security-sensitive copy that must not be exposed to branding admin:

- invalid credentials and session errors;
- registration eligibility and account existence behavior;
- password reset request/OTP copy that protects account enumeration;
- OTP invalid/expired/attempt-limit errors;
- password policy and continuation-token errors;
- attachment safety, upload limits, offline and Chatwoot unavailable states.

Rule:

- Tenant can change only controlled auth title/subtitle and helper/welcome body
  slots when the screen explicitly allows it. CTA labels, field labels and
  security-sensitive copy stay system-owned.

## Design System Rules

### Brand Tokens

Brandable:

- `brand.display_name`;
- `brand.logo` или fallback monogram;
- `brand.auth_brand_position`: left, center, right;
- `brand.auth_header_image` shared across auth screens with default fallback;
- `brand.auth_footer_image` shared across auth screens with default fallback;
- `brand.auth_title`;
- `brand.primary_color`;
- `brand.accent_color` optional; used only for narrow decorative highlights
  after contrast checks, never for critical states;
- `brand.app_icon`;
- `brand.auth_subtitle`;
- `brand.auth_helper_body` where a screen needs additional safe helper copy;
- `brand.welcome_body`;
- `brand.support_team_label`;
- optional legal links: privacy, terms, support policy.

Locked/system:

- CTA labels by default;
- form labels and placeholders unless explicitly listed per screen;
- форма и порядок auth steps;
- validation and error semantics;
- OTP length, resend timer and lockout behavior;
- password policy text generated from system rules;
- chat send/retry/offline/realtime states;
- attachment limits and security errors;
- PWA scope, start URL, tenant host resolution.

### Visual Hierarchy Contract

- Brand mark is supportive, not dominant.
- Primary CTA is the strongest interactive element on auth forms.
- Secondary links use low-emphasis styling and never compete with primary CTA.
- No auth screen should become a marketing landing page.
- Chat readability is more important than brand expression.
- System alerts must visually override brand styling when action or safety is at
  stake.

### Branding Intensity Rules

- Auth screens can carry brand more strongly through logo, tenant name, primary
  color, header/footer art and controlled title/subtitle body.
- Auth header art is shared across auth screens. Brand mark overlays that art at
  a controlled left/center/right position.
- Auth footer art is decorative and must not contain required copy or controls.
- Splash and app welcome can show brand clearly, but remain short loading states.
- Chat header can carry moderate brand expression through support label and
  avatar/logo fallback.
- Header accent is disabled by default. It may be enabled only after the cleaned
  header layout stays readable at 320px and passes contrast checks.
- Chat transcript stays mostly neutral; only outgoing color and safe avatar
  fallback are brandable.
- Errors, warnings, offline states, validation and security states are always
  system-owned.
- Do not brand every surface. Repeating brand color everywhere weakens hierarchy
  and makes state colors harder to understand.

### Color Rules

- Primary color drives buttons, focus rings and brand mark.
- Accent color is optional and low-intensity. It can support tiny decorative
  lines, dividers or non-critical highlights, but must not color errors,
  warnings, offline states, field validation, primary text or required controls.
- Chat outgoing color may use primary or a derived darker token, but must keep
  readable white text.
- Incoming messages remain neutral and high-contrast; tenant brand must not turn
  both sides of chat into the same color family.
- Error, warning, success and offline colors are system-owned.
- Admin validation must reject colors with poor contrast for button text,
  critical labels and chat bubbles.

### Typography And Layout

- Auth pages use one focused column; no marketing side panel.
- Mobile is primary: no horizontal overflow at 320px width.
- Touch targets stay at least 44px.
- Headings are short and task-oriented.
- Helper text is kept below fields only when it prevents a real mistake.
- Cards are used for forms, states and repeated items only; page sections should
  not become nested decorative cards.

### Component Contracts

- Primary button: one main action per screen.
- Secondary actions: text links or quiet buttons, never competing with primary.
- Form field: label, optional short hint, validation error; filled fields keep
  a subtle non-error highlight even in installed PWA/autofill contexts. Empty
  required fields can show only soft error highlighting when the placeholder
  already explains what to enter.
- Inline alert: system-owned state with accessible role; error tone uses normal
  red text with soft border/background, not visually louder than the primary
  CTA.
- OTP verification layout: registration and password reset share one visual
  structure for OTP cells, helper card, primary CTA, change-email action and
  inline resend cooldown; only scenario copy/API handlers differ.
- Password setup layout: registration and password reset share one visual
  structure for password fields, generated rules, primary CTA and recovery
  action placement; scenario copy/API handlers and continuation routes differ.
- Chat composer: attachment, voice, textarea, send; disabled state must explain
  why sending is unavailable.
- Message bubble: readable content, timestamp/status, attachment preview,
  reply/copy actions through accessible controls.

## Screen Specification

### Login

Purpose:

- Let an existing portal user enter the tenant customer portal.

Default copy:

- Title: `Центр поддержки`
- Body: `Войдите, чтобы продолжить общение с поддержкой.`
- Primary CTA: `Войти`
- Secondary links: password reset, registration.

Brandable:

- logo/monogram;
- tenant display name;
- header/footer auth art;
- brand mark position;
- title;
- subtitle;
- primary button/focus color;
- optional legal/support links below the form.

Locked:

- email/password fields;
- password visibility control;
- login error semantics;
- redirect behavior after auth.

Audit notes:

- Current helper text under login repeats tenant eligibility context that belongs
  more naturally to registration.
- Secondary actions are useful but should not visually compete.

### Registration Request

Purpose:

- Let a contact known to the tenant request a portal account.

Default copy:

- Title: `Создать аккаунт`
- Body: `Укажите имя и рабочий email, чтобы получить код подтверждения.`
- Primary CTA: `Продолжить`

Brandable:

- intro body;
- support contact link if access is missing.

Locked:

- full name and email fields;
- eligibility check;
- enumeration-safe backend behavior;
- navigation to OTP step only after accepted request.

Audit notes:

- Current page has two links to login; keep only one clear path.
- Eligibility explanation should be concise and tenant-neutral.

### Registration OTP

Purpose:

- Confirm the email before setting a password.

Default copy:

- Title: `Подтверждение email`
- Body: `Введите 6-значный код из письма.`
- Helper: `Если письма нет, проверьте папку "Спам" или запросите новый код.`

Brandable:

- intro body only within a safe template.

Locked:

- six-digit OTP;
- resend timer;
- invalid/expired code errors;
- email change path;
- continuation token storage.

Audit notes:

- Registration can safely say that a code was sent when backend reports
  delivery for an eligible contact.

### Registration Set Password

Purpose:

- Complete account creation with a password that matches portal policy.

Default copy:

- Title: `Создание пароля`
- Body: `Создайте пароль, чтобы входить в Центр поддержки.`
- Primary CTA: `Сохранить пароль`

Brandable:

- intro body only.

Locked:

- password fields;
- password rules;
- invalid continuation handling;
- success state and login handoff.

Audit notes:

- Password rules should remain generated from shared policy, not tenant text.

### Password Reset Request

Purpose:

- Start recovery without disclosing whether an account exists.

Default copy:

- Title: `Восстановить пароль`
- Body: `Введите email. Если доступ активен, мы отправим код восстановления.`
- Primary CTA: `Получить код`

Brandable:

- intro body only within an enumeration-safe template.

Locked:

- account enumeration-safe copy;
- email field;
- generic accepted behavior;
- support link slot if tenant wants a human fallback.

Audit notes:

- This closes the copy risk tracked in `F-AUTH-001`: UI must not promise that
  an email definitely was sent for every accepted request.

### Password Reset OTP

Purpose:

- Confirm recovery code without exposing account existence.

Default copy:

- Title: `Подтверждение Email`
- Body:
  `Если доступ активен, код восстановления отправлен на {email}.`

Brandable:

- intro body only within an enumeration-safe template.

Locked:

- OTP length;
- resend behavior;
- generic copy;
- invalid/expired code handling.

Audit notes:

- Resend success copy must use `если доступ активен`, not definite delivery.

### Password Reset Set Password

Purpose:

- Save a new password after a valid reset continuation.

Default copy:

- Title: `Новый пароль`
- Body: `Создайте новый пароль для входа в Центр поддержки.`
- Primary CTA: `Сохранить пароль`

Brandable:

- intro body only.

Locked:

- password fields and generated rules;
- continuation validation;
- success login handoff.

### Tenant Bootstrap Splash

Purpose:

- Avoid an empty white startup while the app loads tenant identity, route chunks
  or first protected state.

Default copy:

- Title: `Открываем кабинет`
- Body: `Загружаем настройки.`

Brandable:

- logo/monogram;
- display name after tenant identity is known;
- primary color;
- PWA icon and native manifest background in `MT-9`.

Locked:

- no custom tenant HTML;
- no promotional content;
- no interactive CTA while bootstrap is in progress.

PWA contract:

- Chromium/Android native launch screen is generated from manifest `name`,
  `background_color` and `icons`.
- `background_color` must match the initial app background for a smooth
  transition.
- iOS Web Clip launch images require `apple-touch-startup-image`; because
  tenant branding assets are not implemented yet, `MT-8.5` uses in-app splash
  plus tenant-aware app icon/title, and leaves generated iOS startup images to
  `MT-9` asset pipeline decisions.

References:

- MDN Web App Manifest: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest
- MDN `background_color`: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/background_color
- web.dev manifest splash guidance: https://web.dev/articles/add-manifest
- Apple Safari Web Content launch images: https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html

### App Loading/Welcome Screen

Purpose:

- Give authenticated users a calm branded transition while the protected app,
  current session or chat runtime is being prepared.

Default copy:

- Title without known user: `Открываем кабинет`
- Title with known user: `Добро пожаловать, {first_name}`
- Session description: `Проверяем доступ и готовим защищенную зону.`
- Chat description: `Подключаем переписку и последние сообщения.`

Brandable:

- logo/monogram;
- tenant display name;
- primary color;
- optional short welcome text in a controlled slot.

Locked:

- no free-form tenant HTML;
- no CTA while loading;
- no promise that an agent is already connected before chat runtime confirms it;
- status semantics: session, route, chat, offline/retry.

Audit notes:

- React `Suspense` fallback is appropriate for route-code loading; data/runtime
  loading still needs explicit app state screens.
- The welcome screen must not hide recoverable errors. Session and chat errors
  still route to their existing retry/error states.

### Chat Shell

Purpose:

- Provide a focused support conversation, not a CRM ticket workspace.

Brandable:

- header logo/monogram;
- tenant display name;
- support team label;
- primary/accent color;
- optional header accent background in a constrained slot.

Locked:

- thread switcher model: personal chat plus available group chats;
- logout placement;
- connection status semantics;
- composer structure;
- realtime/offline behavior;
- Chatwoot authority boundary.

Audit notes:

- Disabled menu button should either become useful or be removed before final
  baseline.
- Header title `Поддержка клиентов` may be a brandable support label, but
  presence/error states remain system-owned.

### Chat Transcript

Purpose:

- Show a clear message history with timestamps, delivery status, attachments and
  reply context.

Brandable:

- outgoing bubble color within contrast limits;
- optional support avatar/logo fallback;
- empty state helper text within safe templates.

Locked:

- incoming/outgoing distinction;
- message metadata;
- failed-send retry;
- load older behavior;
- date dividers;
- attachment safety rendering.

Audit notes:

- `F-CHAT-UI-002` remains active: reply/copy actions need keyboard access.
- `F-CHAT-UI-003` remains active: native audio controls can overflow narrow
  incoming bubbles.

### Chat Composer

Purpose:

- Send text, one attachment or voice message with clear disabled/error states.

Brandable:

- send button color;
- placeholder text only if it stays short and neutral.

Locked:

- file input restrictions;
- voice permission/error behavior;
- offline disabled state;
- reply preview structure;
- attachment preview structure.

Audit notes:

- `F-IOS-001` remains a focused experiment, not a broad viewport rewrite.

## Screen-by-screen UI Cleanup

Этот раздел фиксирует именно cleanup существующего customer-facing UI перед
брендингом. Задача не в том, чтобы спроектировать tenant admin, а в том, чтобы
текущий портал стал чистой, устойчивой UI-системой, которой `MT-9` сможет
безопасно управлять через ограниченные branding slots.

### Login Cleanup

- Цель: быстро и спокойно войти в уже созданный клиентский аккаунт.
- Layout сверху вниз: auth header art на всю ширину, brand mark overlay
  left/center/right, короткий title, короткий subtitle, email с системной
  иконкой, password с системной иконкой и reveal, primary CTA without icon,
  low-emphasis secondary auth links, low-emphasis access info panel, optional
  legal/support links, decorative footer art.
- Actions: primary `Войти`; secondary `Забыли пароль?`; tertiary
  `Создать аккаунт`.
- Оставить: email/password, password reveal, field icons, icon-free single
  primary CTA, password reset path, registration path, concise access info
  panel below auth links, bottom-aligned through flexible layout rather than
  absolute positioning.
- Удалить/упростить: отдельный eligibility helper под формой, если он повторяет
  registration context; email hint под полем; visible field labels на login;
  decorative divider between CTA and auth links.
- Заменить тексты: default title - `Центр поддержки`; default subtitle -
  `Войдите, чтобы продолжить общение с поддержкой.`; ошибки должны быть короткими и не
  раскрывать лишние детали.
- Brandable: logo/monogram, tenant name, brand mark position, auth header image,
  auth footer image, title, subtitle, primary color, legal links, access info
  title/body/contact phone. Default access title - `Нет доступа к чату?`;
  default access body - `Поддержка: +7 (906) 12-955-12`.
- Locked/system: поля, hidden labels for accessibility, placeholders, field
  icons, password reveal, auth header bottom fade, auth footer top fade,
  invalid credentials copy, session redirect, validation.
- States: loading session, submitting, invalid field, invalid credentials,
  backend/network error, disabled submit. Email format error appears after blur
  or submit, not immediately while the user is still typing. Empty required
  email/password states show field highlighting without duplicate
  `Введите email` / `Введите пароль` copy.
- Mobile 320px: auth header height about 260px; larger shell about 320px; links
  wrap without overlap; password reveal button не сжимает input; CTA full-width;
  support phone is clickable; no horizontal overflow.
- Branding risks: длинное tenant name ломает header; слишком светлый primary
  color делает CTA нечитаемым; poorly cropped auth art hides brand mark; лишний
  welcome text создает marketing-screen вместо login.

### Registration Request Cleanup

- Цель: дать известному tenant contact запросить portal account.
- Layout сверху вниз: brand mark, title, safe helper body, full name, email,
  primary CTA, one secondary link to login, optional support fallback.
- Actions: primary `Продолжить`; secondary `Войти`; tertiary
  support contact link if configured.
- Оставить: full name, email, eligibility-safe explanation, primary CTA, one
  quiet login return link.
- Удалить/упростить: два разных login links на одном экране; повторяющиеся
  explanations про known email.
- Заменить тексты: recommended default - `Укажите имя и рабочий email, чтобы
получить код подтверждения.`; helper - `Введите email, указанный при создании
вашего профиля.`
- Default access-denied copy:
  `Мы не нашли профиль с таким email. Позвоните по тел: +7 (906) 12-955-12.`
- Brandable: intro body within safe template, support link label/url.
- Locked/system: field structure, backend eligibility check, account existence
  behavior, next route.
- States: submitting, validation errors, access denied/generic error,
  resend/not applicable, disabled submit. Email format error appears after blur
  or submit, not immediately while the user is still typing. Empty required
  name/email states show field highlighting without duplicate `Введите имя` /
  `Введите email` copy. The support phone in access-denied copy is clickable
  when present.
- Mobile 320px: secondary link must wrap below form; helper text max two short
  lines where possible.
- Branding risks: tenant-written copy может обещать доступ всем пользователям;
  support link может выглядеть как main CTA.

### Registration OTP Cleanup

- Цель: подтвердить email before password creation.
- Layout сверху вниз: brand mark, title, email summary, OTP input, helper,
  primary CTA, quiet change-email/resend row.
- Actions: primary `Продолжить`; secondary `Отправить код повторно`; tertiary
  `Изменить email`.
- Оставить: six-digit OTP, countdown, resend, change email, invalid/expired
  code alert.
- Удалить/упростить: visible OTP label on mobile auth layout; длинные
  paragraphs вокруг OTP; duplicate email mention if the address already sits in
  the summary; separate bottom resend countdown block.
- Заменить тексты: title `Подтверждение Email`; summary
  `Код подтверждения отправлен на {email}`; helper
  `Если письма нет, проверьте «Спам» или запросите новый код после таймера.`
- Brandable: intro body only within safe template.
- Locked/system: OTP length, resend timer, attempts, error semantics,
  continuation storage.
- States: missing stored request, submitting, invalid code, expired code,
  resend pending, resend disabled, resend success.
- Mobile 320px: OTP cells use compact 52px height and fit without horizontal
  scroll; resend cooldown appears inline in the resend action, not as a
  separate bottom timer block.
- Branding risks: custom copy may imply code never expires or hide resend timer.

### Registration Set Password Cleanup

- Цель: завершить создание аккаунта безопасным паролем.
- Layout сверху вниз: brand mark, title, short body, password, confirm password,
  password rules, error/success, primary CTA.
- Actions: primary `Сохранить пароль`; secondary `Вернуться к подтверждению`
  only when continuation is invalid; tertiary `Перейти ко входу` only after
  success or relevant error.
- Оставить: generated password rules, two fields, success handoff.
- Удалить/упростить: permanent login link before success if it distracts from
  completion.
- Заменить тексты: body
  `Создайте пароль, чтобы входить в Центр поддержки.`
- Brandable: intro body only.
- Locked/system: password policy, validation, continuation handling, success
  semantics.
- States: missing continuation, invalid/expired continuation, validation,
  submitting, success.
- Mobile 320px: password rules list must not create side-by-side layout.
- Branding risks: tenant copy may weaken password expectations or hide why CTA
  is disabled.

### Password Reset Request Cleanup

- Цель: начать восстановление доступа без account enumeration.
- Layout сверху вниз: brand mark, title, enumeration-safe body, email, primary
  CTA, secondary login link, optional support fallback.
- Actions: primary `Получить код`; secondary `Вернуться ко входу`; tertiary
  support contact link if configured.
- Оставить: email field with system icon, generic accepted behavior, login
  link, one short safe helper card.
- Удалить/упростить: `Новый аккаунт` link if it competes with recovery goal;
  repeated paragraphs about known email; visible field label on mobile auth
  layout.
- Заменить тексты: recommended default - `Введите email. Если доступ активен, мы
отправим код восстановления.`; helper - `Введите email, указанный при создании
вашего профиля.`
- Brandable: intro body only within enumeration-safe template, support link.
- Locked/system: generic response, missing-account behavior, error semantics,
  field structure, field icon and email placeholder.
- States: submitting, validation, accepted, backend/network error, disabled.
  Empty required email state shows field highlighting without duplicate
  `Введите email` copy. Email format error appears after blur or submit, not
  immediately while the user is still typing.
- Mobile 320px: no two-link row if labels wrap; stack secondary actions.
- Branding risks: tenant copy can accidentally disclose account existence.

### Password Reset OTP Cleanup

- Цель: подтвердить recovery code safely.
- Layout сверху вниз: brand mark, title, safe email summary, OTP input, primary
  CTA, helper, resend row, change email link.
- Actions: primary `Продолжить`; secondary `Отправить код повторно`; tertiary
  `Изменить email`.
- Оставить: OTP, countdown, resend, generic success copy.
- Удалить/упростить: definite delivery wording like `Мы отправили код`, unless
  backend guarantees a registered active account path.
- Заменить тексты: recommended default -
  `Если доступ активен, код восстановления отправлен на {email}.`; helper -
  `Если письма нет, проверьте «Спам» или запросите новый код после таймера.`;
  resend success - `Если доступ активен, новый код отправлен на {email}.`
- Brandable: intro body only within enumeration-safe template.
- Locked/system: OTP length, resend timer, invalid/expired handling,
  continuation storage, OTP input layout.
- States: missing request, submitting, invalid code, expired code, resend
  disabled, resend accepted, network error.
- Mobile 320px: OTP cells use compact 52px height and fit without horizontal
  scroll; resend cooldown appears inline in the resend action, not as a
  separate bottom timer block.
- Branding risks: custom copy may break enumeration safety.

### Password Reset Set Password Cleanup

- Цель: сохранить новый пароль после valid recovery continuation.
- Layout сверху вниз: brand mark, title, short body, password, confirm password,
  rules, errors/success, primary CTA.
- Actions: primary `Сохранить пароль`; secondary `Вернуться к подтверждению`
  only when continuation is invalid; tertiary `Перейти ко входу` after success.
- Оставить: generated rules, continuation checks, success handoff.
- Удалить/упростить: duplicate navigation links before success.
- Заменить тексты: title `Новый пароль`; body -
  `Создайте новый пароль для входа в Центр поддержки.`
- Brandable: intro body only.
- Locked/system: password policy, validation, invalid continuation handling.
- States: missing continuation, invalid/expired continuation, validation,
  submitting, success.
- Mobile 320px: rules and alerts must fit one column.
- Branding risks: tenant text may imply old sessions remain active or password
  rules are optional.

### Tenant Bootstrap Splash Cleanup

- Цель: заменить blank first paint на calm branded startup state.
- Layout сверху вниз: brand mark/fallback, spinner/status, title, body.
- Actions: none.
- Оставить: tenant-aware brand mark, short loading text, matching background.
- Удалить/упростить: any CTA, marketing slogan, complex illustration.
- Заменить тексты: default title `Открываем кабинет`; body `Загружаем настройки.`
- Brandable: logo/monogram, tenant name, primary color, app icon in future.
- Locked/system: no free HTML, no custom layout, no promise of loaded chat.
- States: tenant loading, route chunk loading, tenant error fallback elsewhere.
- Mobile 320px: center content, no full-screen image crop requirement.
- Branding risks: heavy logo/image delays first meaningful paint.

### App Loading/Welcome Cleanup

- Цель: дать authenticated user branded transition while session/chat loads.
- Layout сверху вниз: brand mark, welcome title, short body, status pill,
  optional chat preview skeleton.
- Actions: none while loading.
- Оставить: first-name greeting when known, status label, skeleton only for chat.
- Удалить/упростить: technical debug copy, duplicate spinners.
- Заменить тексты: status labels `Проверяем сессию`, `Готовим чат`,
  `Загружаем экран.`
- Brandable: welcome body, logo/monogram, tenant name, primary color.
- Locked/system: no CTA, no claim that agent is online, error states remain
  separate.
- States: protected session checking, route loading, chat loading, eventual
  error/retry.
- Mobile 320px: skeleton width <= container, no horizontal scroll.
- Branding risks: long welcome copy delays comprehension and causes vertical
  overflow on small phones.

### Chat Header Cleanup

- Цель: identify support conversation and expose only useful top-level actions.
- Layout: hamburger navigation affordance, tenant brand mark, support title,
  assignee/status row, chat action menu.
- Actions: primary none; secondary chat menu; tertiary placeholder navigation
  menu for future `Чат / Центр поддержки`.
- Оставить: support title, assignee/team label without `Агент:` prefix,
  online/connecting status, logout through `Завершить диалог`.
- Удалить/упростить: disabled menu button, standalone logout icon, decorative
  header image if it conflicts with tenant colors.
- Заменить тексты: `Поддержка клиентов` may become safe support label; status
  remains system-owned.
- Brandable: support label, logo/avatar fallback, primary color; header accent
  stays disabled by default.
- Locked/system: status semantics, assignee fallback, accessibility labels,
  logout behavior behind `Завершить диалог`.
- States: ready, connecting, logout submitting, logout error.
- Mobile 320px: title and assignee truncate predictably; buttons remain 40-44px.
- Branding risks: long tenant/support label hides status or logout; low-contrast
  header accent weakens controls.

### Chat Transcript Cleanup

- Цель: readable conversation history with clear message ownership and recovery.
- Layout сверху вниз: load older control, optional history alert, date divider,
  message groups, empty state.
- Actions: primary contextual retry for failed sends; secondary load older;
  tertiary reply/copy per message.
- Оставить: incoming/outgoing contrast, timestamps, delivery status, failed
  retry, date dividers, empty state.
- Удалить/упростить: pointer-only message actions as the only path; any
  decorative bubble texture that reduces readability.
- Заменить тексты: empty state should invite first message only when send is
  actually available.
- Brandable: outgoing bubble color, support avatar fallback, safe empty helper.
- Locked/system: ownership, metadata, retry state, attachment safety, date
  grouping.
- States: loading older, history error, empty, failed local send, sending,
  copied, offline.
- Mobile 320px: bubbles max-width must account for avatar/padding; audio
  attachment cannot overflow.
- Branding risks: brand color too close to incoming neutral; message text
  contrast fails; custom empty copy promises instant response.

### Chat Composer Cleanup

- Цель: let user send text, one attachment or voice message with clear disabled
  reasons.
- Layout сверху вниз: offline/error alert, reply preview, attachment/voice
  preview, input row, composer error.
- Actions: primary send; secondary attach/voice; tertiary cancel reply/remove
  attachment.
- Оставить: textarea, send, attachment, voice, reply preview, offline alert.
- Удалить/упростить: controls that collapse invisibly without a clear disabled
  reason; duplicate error surfaces.
- Заменить тексты: placeholder stays short, e.g. `Сообщение...`; disabled
  placeholder `Чат временно недоступен`.
- Brandable: send button color, placeholder only if short.
- Locked/system: file accept policy, voice permissions, disabled/offline logic,
  send idempotency, reply target.
- States: empty draft, text draft, attachment selected, voice recording,
  sending, send error, offline disabled, chat not ready.
- Mobile 320px: controls fit 44px targets; textarea grows without pushing
  controls off-screen; keyboard viewport behavior must not regress.
- Branding risks: bright send color can fail contrast; long placeholder clips;
  custom labels can make disabled state unclear.

## Branding Matrix

| Screen / area               | Brandable elements                                                                                                                        | Locked/system elements                                                       |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Login                       | logo, tenant name, brand position, auth header/footer art, title, subtitle, access info/contact phone, primary color, legal/support links | fields, placeholders, field icons, validation, invalid credentials, redirect |
| Registration request        | logo, tenant name, brand position, auth header/footer art, title, safe intro body, support link, primary color                            | eligibility, field order, generic errors                                     |
| Registration OTP            | logo, tenant name, brand position, auth header/footer art, title, safe intro body, primary color                                          | OTP length, resend timer, attempts, continuation                             |
| Registration set password   | logo, tenant name, brand position, auth header/footer art, title, short intro body, primary color                                         | password policy, fields, success/error semantics                             |
| Password reset request      | logo, tenant name, brand position, auth header/footer art, title, enumeration-safe intro, support link, primary color                     | generic accepted behavior, field order                                       |
| Password reset OTP          | logo, tenant name, brand position, auth header/footer art, title, enumeration-safe intro, primary color                                   | OTP length, resend timer, account enumeration safety                         |
| Password reset set password | logo, tenant name, brand position, auth header/footer art, title, short intro body, primary color                                         | password policy, continuation handling                                       |
| Tenant splash               | logo/monogram, tenant name, primary color, future app icon                                                                                | no CTA, no free HTML, loading semantics                                      |
| App welcome/loading         | logo/monogram, tenant name, welcome body, primary color                                                                                   | no CTA, session/chat status semantics                                        |
| Chat header                 | support label, logo/avatar fallback, primary color; header accent off by default                                                          | logout, status semantics, assignee fallback                                  |
| Chat transcript             | outgoing color, support avatar fallback, safe empty helper                                                                                | ownership, metadata, retry, attachment safety                                |
| Chat composer               | send color, short placeholder                                                                                                             | file/voice policy, disabled/offline logic, send semantics                    |
| PWA identity                | app name, short name, icon, manifest background/theme color                                                                               | scope, start URL, tenant host, cache/no-store behavior                       |

## Brandable Text Limits

These are UI cleanup limits for future controlled slots. They are not tenant
admin implementation.

| Slot                     | Limit       | Fallback / rule                                   |
| ------------------------ | ----------- | ------------------------------------------------- |
| Tenant display name      | 2-32 chars  | truncate in UI after one line                     |
| PWA short name           | 2-12 chars  | derive from display name, then truncate           |
| Auth title               | 2-32 chars  | `Центр поддержки`                                 |
| Auth subtitle            | 0-90 chars  | `Войдите, чтобы продолжить общение с поддержкой.` |
| Auth helper body         | 0-120 chars | use system body if empty                          |
| Login access info body   | 0-140 chars | use system body/contact phone if empty            |
| Registration helper      | 0-140 chars | must preserve access-active wording               |
| Password reset helper    | 0-140 chars | must preserve enumeration-safe wording            |
| Support team label       | 0-32 chars  | `Поддержка клиентов`                              |
| Chat empty helper        | 0-120 chars | system empty text                                 |
| Welcome body             | 0-100 chars | `Готовим личный кабинет.`                         |
| Splash body              | 0-80 chars  | `Загружаем настройки.`                            |
| Legal/support link label | 0-24 chars  | hide link if label or URL is missing              |
| Composer placeholder     | 0-28 chars  | `Сообщение...`                                    |

## Branding Fallback Logic

- Logo missing: render generated monogram from tenant display name.
- Logo fails to load: hide broken image and render monogram.
- Auth header image missing: use default artwork
  `/default-branding/auth-header.png`; recommended source size `1445x925`.
- Auth footer image missing: use default decorative artwork
  `/default-branding/auth-footer.png`; recommended source size `1500x528`.
- Display name missing or blank: use `Клиентский портал` in UI fallback and
  block tenant publish later.
- Display name too long: keep full value for accessible title metadata, but
  truncate visual one-line placements and derive PWA short name separately.
- App icon missing: use fallback tenant-aware default icon endpoint with
  versioned URL.
- App icon fails: manifest still points to fallback icon set; UI uses monogram.
- Bad primary color: fall back to `#112540` and system-derived brand palette.
- Missing/bad accent color: disable accent surfaces rather than deriving a loud
  secondary theme.
- Low-contrast outgoing bubble color: use system `chat-outgoing` color.
- Missing brandable copy: use system default copy from this document.
- Too-long brandable copy: truncate only in preview/admin validation; runtime
  should receive already validated values in `MT-9`.

## Elements To Remove Or Simplify Before MT-9

- Disabled chat header menu button until it has real user-facing actions.
- Duplicate login links on registration request.
- CTA/auth links divider on login when it creates unnecessary visual separation.
- Definite password reset delivery copy that conflicts with generic backend
  behavior.
- Decorative auth/chat accents that do not survive tenant colors or compete
  with form hierarchy.
- Pointer-only message action path; reply/copy need keyboard-accessible access.
- Hard audio min-width that can overflow narrow message bubbles.
- Any secondary action row that cannot wrap cleanly at 320px.

## UI Cleanup Acceptance

- Every customer-facing screen has one clear primary action or explicitly has no
  action while loading.
- Secondary and tertiary actions do not compete visually with primary actions.
- Screen titles and CTA labels remain system-owned by default.
- Login, registration and password reset copy is neutral, short and safe for
  many B2B tenants.
- Password reset request/OTP copy remains account enumeration-safe.
- No visible disabled control remains unless it explains an unavailable feature
  or has a clear upcoming state.
- Chat header, transcript and composer fit at 320px without horizontal overflow.
- Current UI has no duplicate links, redundant helper cards or decorative blocks
  that weaken hierarchy.
- Brandable slots have text limits and fallback behavior.
- Locked/system elements are not exposed as branding customization candidates.
- Open cleanup findings are either fixed or explicitly deferred before `MT-9`.

## Implementation Done Checklist

Implementation of `MT-8.5` customer-facing UI cleanup is done only when:

- Login has one primary CTA, low-emphasis secondary links and no duplicate
  helper blocks.
- Registration request has one login return path and concise access-active
  helper copy.
- Password reset request and OTP copy are account enumeration-safe.
- Registration OTP and password reset OTP use the same shared visual layout, so
  future cleanup/branding changes cannot drift between the two screens.
- Registration set-password and password reset set-password use the same shared
  visual layout, with duplicate pre-success navigation removed.
- Screen titles and CTA labels remain system-owned by default.
- Tenant-owned copy is limited to explicitly allowed helper/welcome body slots.
- Brand mark is visually supportive and does not dominate auth screens.
- Primary color passes contrast for CTA and focus states, or falls back to
  system color.
- Accent color is optional, low-intensity and disabled when missing, invalid or
  visually noisy.
- Header accent remains disabled by default.
- Chat header uses the accepted customer-support header pattern and has no
  disabled menu button without visible purpose.
- Transcript remains mostly neutral and readable; outgoing color passes contrast.
- Composer controls fit and remain understandable at 320px.
- Audio attachments do not overflow narrow incoming bubbles, or the finding is
  explicitly deferred.
- Message reply/copy has keyboard-accessible access, or the finding is
  explicitly deferred.
- Splash and app welcome screens use the same controlled brand identity and do
  not contain CTA or marketing copy.
- Frontend tests/typecheck/build/lint and `git diff --check` pass after UI
  changes.

## Branding Admin Shape For MT-9

Sections:

- Brand identity: display name, logo, monogram fallback, app icon.
- Colors: primary, outgoing bubble, optional accent, background.
- Text slots: auth welcome, registration helper, password reset safe helper,
  chat header support label, empty state helper.
- PWA: app name, short name, icon preview, install preview, splash preview.
- Links: privacy, terms, support contact.
- Domain: read-only primary domain/public base URL at first, managed by
  provisioning/runbook.
- Preview: login, registration, OTP, password reset, chat, PWA identity.

Validation:

- color contrast checks;
- text length limits per slot;
- logo/icon file type and size checks;
- no HTML in tenant-editable text;
- fallback preview before publish;
- tenant-scoped asset keys and cache versioning in `MT-9`.

## Preview Screens

Required `MT-9` previews must use real components:

- login;
- registration request;
- OTP;
- password reset request;
- chat with messages;
- chat empty/not-ready;
- PWA app identity and splash.

Auth previews must show uploaded header/footer art with real crop, brand mark
left/center/right placement, system-owned header bottom fade and system-owned
footer top fade before a tenant can publish branding changes.

## Open UI Findings

- `F-CHAT-UI-002`: context menu keyboard accessibility.
- `F-CHAT-UI-003`: audio attachment narrow width.
- `F-IOS-001`: iOS keyboard textarea viewport pan, focused experiment only.

## Acceptance For MT-8.5

- This spec reflects the accepted customer-facing shell.
- Splash/loading state exists for tenant bootstrap and route loading.
- App loading/welcome state exists for protected session and chat runtime
  loading.
- Brandable vs locked elements are explicit per screen.
- Future admin settings and preview screens are defined.
- Any UI issues not fixed in `MT-8.5` are tracked as findings or deferred with
  an owner phase.
