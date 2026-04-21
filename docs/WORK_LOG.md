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
- Добавлен pre-Phase-5 regression baseline: Playwright auth guard/negative flows и PWA/runtime smoke, backend auth/session invariants, frontend invalid-code/state guard tests.
- Full validation для regression baseline пройдена: `pnpm test:e2e`, `pnpm test`, `pnpm lint`, `pnpm build`, targeted format/whitespace checks.

## Recommended Next Step

- Начать `Phase 5. Chat Read Model` с backend-owned `GET /api/chat/context` и controlled `/app/chat` states.
