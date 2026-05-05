# Chatwoot Client Portal v2

Новая версия клиентского портала для Chatwoot.

Этот проект создается с нуля как отдельная кодовая база рядом со старым порталом, но без копирования старого кода и без использования старого проекта как reference.

## Базовые правила

- `v2` не наследует код из `v1`
- старый проект нельзя читать, запускать или использовать как источник решений
- браузер не работает с Chatwoot напрямую
- портал backend является единственной authority-зоной для auth, session, access control, send и realtime fanout
- Chatwoot остается system of record для contacts, conversations и messages
- код пишется маленькими явными модулями без лишней магии и без преждевременных абстракций

## Карта документации

- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
  Архитектурный фундамент проекта: продуктовая модель, границы, authority model, выбранный стек и целевая структура.
- [docs/IMPLEMENTATION_PLAN.md](./docs/IMPLEMENTATION_PLAN.md)
  Пошаговый план сборки `v2` без пропусков и без хаотического расползания по задачам.
- [docs/DECISIONS.md](./docs/DECISIONS.md)
  Журнал стартовых архитектурных решений, которые уже приняты.

## Рекомендуемый стартовый стек

- Frontend: `React + TypeScript + Vite + Tailwind CSS + selective Preline plugins`
- Backend: `Node.js 24.x + Fastify + TypeScript`
- Database: `PostgreSQL + Drizzle ORM`
- Validation: `Zod`
- Realtime: `Server-Sent Events`
- Tests: `Vitest + Playwright`

## Что делаем дальше

1. Утверждаем этот архитектурный фундамент.
2. Создаем каркас репозитория `frontend/` и `backend/`.
3. Начинаем реализацию только по фазам из `docs/IMPLEMENTATION_PLAN.md`.

## Local `Postgres` For `v2`

Для локальной разработки `v2` должен использовать только свой отдельный `Postgres`, а не базу работающего `Chatwoot` и не базу старого портала.

Bootstrap уже лежит в репозитории:

- `infra/postgres/compose.yaml`
- `.env.example`

Быстрый старт:

1. `cp .env.example .env`
2. `pnpm db:up`
3. Заполнить в `.env` `PORTAL_TENANT_SECRET_KEY` и `DEFAULT_TENANT_*` значения.
4. `set -a && source .env && set +a`
5. `pnpm --dir backend db:migrate`
6. `pnpm --dir backend tenant:bootstrap-default`
7. `pnpm dev:backend`
8. В другом терминале: `set -a && source .env && set +a && pnpm dev:web --host 0.0.0.0`

Если локальная база была создана до multi-tenant foundation, старые данные в
этом pre-production проекте не мигрируются вперед. Правильный local reset:

```bash
docker --context default compose --env-file .env -f infra/postgres/compose.yaml down -v
pnpm db:up
set -a && source .env && set +a
pnpm --dir backend db:migrate
pnpm --dir backend tenant:bootstrap-default
```

`pnpm db:down` останавливает только `v2` database container и не трогает `Chatwoot`.
