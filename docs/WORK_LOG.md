# Work Log

Короткий лог важных внедренных шагов в `chatwoot-client-portal-v2`.

- Создан отдельный проект `v2` рядом со старым порталом, без копирования кода из `v1`.
- Собран базовый workspace: root scripts, `pnpm`, frontend, backend, env/example и tooling.
- Поднят frontend foundation на `React + TypeScript + Vite + Tailwind CSS`; добавлены auth shell, router, login UI, PWA manifest/service worker и базовые UI-компоненты.
- Поднят backend foundation на `Fastify + TypeScript + Zod + PostgreSQL + Drizzle`; добавлены isolated Postgres bootstrap, migrations и health/auth infrastructure.
- Реализована DB-backed cookie session auth: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`; login screen переведен на реальный backend flow.
- Добавлен backend CLI `pnpm --dir backend user:create` для локального создания portal user.
- Реализован `Phase 2. Registration Flow`: Chatwoot contact eligibility, email verification через SMTP/Mailpit, `/auth/register`, `/auth/register/verify`, `/auth/register/set-password`, continuation token и создание `portal_user` после successful verify + password set.
- Registration flow сохраняет durable связь `portal_user -> Chatwoot contact`, использует scoped transaction locks для verification lifecycle и выровненную password policy на frontend/backend.
- Реализован `Phase 3. Password Reset`: request, verify, continuation-token set-password, generic request response без account disclosure, SMTP/Mailpit delivery и invalidation старых sessions после смены пароля.
- Password reset flow подключен на frontend routes `/auth/password-reset/request`, `/auth/password-reset/verify`, `/auth/password-reset/set-password` с session-backed state и shared password rules UI.
- Password reset hardening: frontend reset state истекает по TTL, недоставленный SMTP reset не оставляет stale pending record, request response не ждет active-user-only SMTP path.
- Реализован `Phase 4. Protected App Shell`: auth-session bootstrap через `/api/auth/me`, protected `/app/*` routes, public auth redirect for authenticated sessions, logout UX и protected empty state на `/app/chat`.
- Расширен Playwright e2e baseline: auto-seeded portal user, login/session/logout и protected auth routing checks.
- Текущий baseline покрыт frontend/backend tests, lint, typecheck/build checks по внедренным фазам.
- Добавлены Mailpit-backed Playwright e2e happy paths для registration и password reset: registration создает eligible Chatwoot contact, читает verification code из Mailpit, проверяет `portal_user -> Chatwoot contact` link и логин; reset проверяет Mailpit code, old-password rejection и new-password login.
- Для Mailpit e2e шага пройдены targeted/full browser checks, unit/integration tests, lint, build и format check.
- Инициализирован отдельный git repository для `chatwoot-client-portal-v2`; в `AGENTS.md` добавлены правила git boundary, feature branches и intake/closure для нового функционала.
- Добавлено правило `Commit Advisory Rule`: агент должен сам подсказывать удачные моменты для git commit, предупреждать когда commit рано делать и предлагать checkpoint после завершенных фаз, slices, findings и docs-only governance updates.
- Добавлено правило `Phase Checkpoint Flow`: перед новой phase агент должен оценить regression safety net, закрыть недостающие тесты по риску и только затем предлагать checkpoint commit.
- Добавлен pre-Phase-5 regression baseline: Playwright auth guard/negative flows и PWA/runtime smoke, backend auth/session invariants, frontend invalid-code/state guard tests.
- Full validation для regression baseline пройдена: `pnpm test:e2e`, `pnpm test`, `pnpm lint`, `pnpm build`, targeted format/whitespace checks.
- Реализован `Phase 5. Chat Read Model`: backend-owned `GET /api/chat/context`, `GET /api/chat/messages`, Chatwoot linked contact/primary conversation resolution, durable conversation mapping и bounded older-history pagination.
- `/app/chat` переведен с placeholder на controlled chat states: loading, not_ready/unavailable и ready transcript с последними 20 сообщениями, attachment cards, disabled future composer и кнопкой загрузки старой истории.
- Phase 5 покрыт backend route/service/client tests, frontend chat/auth route tests и Playwright chat read model e2e; full validation пройдена: `pnpm test:e2e`, `pnpm test`, `pnpm lint`, `pnpm build`, targeted format/whitespace checks.
- Принято финальное chat-routing решение: портал использует один вечный primary Chatwoot conversation; portal inbox должен быть настроен как `Reopen same conversation`, а несколько Chatwoot conversations для одного portal contact считаются anomaly, не клиентской transcript-моделью.
- Принято routing enforcement правило: первый deploy выполняет backend setup-check для portal inbox, а runtime auto-fix запускается только при anomaly `>1 portal conversation`; canonical fallback без valid mapping выбирает самый свежий active conversation, иначе самый свежий resolved conversation.
- Закрыты Phase 5 review findings `F-CHAT-001`, `F-CHAT-003`: добавлены Chatwoot portal inbox routing setup/auto-fix, capped contact conversations recovery через source_id, valid persisted mapping authority и canonical fallback active/newest-resolved.
- Закрыт Phase 5 review finding `F-CHAT-002`: older-history failure теперь остается локальной retryable ошибкой у Load Older и не скрывает уже видимый transcript.
- Устранена хрупкость backend integration tests по фиксированной дате verification/reset records: app-level tests теперь используют relative future timestamps.
- Validation после review fixes: targeted chat tests, targeted ChatPage test, `pnpm test`, `pnpm lint`, `pnpm build`, `git diff --check`; setup-check `pnpm --dir backend chatwoot:ensure-portal-inbox` подтвердил `lockToSingleConversation: true` для inbox `6`.

## Recommended Next Step

- Сделать checkpoint commit для Phase 5 review fixes и chat routing decision, затем переходить к `Phase 6. Text Send And First Conversation Bootstrap`.
