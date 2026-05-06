# Chatwoot Client Portal v2

Tenant-aware клиентский PWA-портал поверх Chatwoot для B2B-компаний.

Один portal deploy может обслуживать много компаний-tenants в shared SaaS
режиме. Dedicated install остается той же архитектурой, только с одним tenant и
своим Chatwoot.

## Базовые правила

- `v2` не наследует код из `v1`.
- Старый проект нельзя читать, запускать или использовать как источник решений.
- Browser не работает с Chatwoot напрямую.
- Portal backend является authority-зоной для auth, session, access control,
  send и realtime fanout.
- Chatwoot остается system of record для contacts, conversations, messages и
  attachments.
- Portal database всегда отдельная от runtime-базы Chatwoot.
- Tenant определяется по `Host`/domain; production convention:
  `lk.<client-domain>`.
- Runtime Chatwoot config хранится у tenant, а не в глобальных
  `CHATWOOT_ACCOUNT_ID` / `CHATWOOT_PORTAL_INBOX_ID`.

## Текущий Статус

Завершены `MT-0`-`MT-8`:

- tenant schema foundation;
- tenant resolution middleware;
- tenant-aware Chatwoot client;
- tenant-scoped persistence;
- tenant-aware auth/session/registration/password reset;
- tenant-aware chat runtime;
- tenant-aware webhooks/provisioning;
- tenant-aware frontend/PWA metadata, manifest and icons.

Следующий активный scope:

```text
MT-8R Codebase Audit And Refactoring Readiness
```

## Карта документации

- [docs/B2B_PRODUCT_GOAL.md](./docs/B2B_PRODUCT_GOAL.md)
  Продуктовая рамка: что продается B2B-компании и зачем нужен портал.
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
  Текущий устойчивый архитектурный baseline.
- [docs/DECISIONS.md](./docs/DECISIONS.md)
  Журнал принятых архитектурных решений.
- [docs/IMPLEMENTATION_PLAN.md](./docs/IMPLEMENTATION_PLAN.md)
  Актуальный roadmap и следующие MT-фазы.
- [docs/MULTI_TENANT_PORTAL_ARCHITECTURE_PLAN.md](./docs/MULTI_TENANT_PORTAL_ARCHITECTURE_PLAN.md)
  Подробный multi-tenant technical reference.
- [docs/LOCAL_TESTING_CHEATSHEET.md](./docs/LOCAL_TESTING_CHEATSHEET.md)
  Актуальная локальная шпаргалка по запуску окружения.
- [docs/PRODUCTION_DEPLOYMENT.md](./docs/PRODUCTION_DEPLOYMENT.md)
  Временный production stop-sign: deployment заблокирован до `MT-10`.
- [docs/PRODUCTION_DEPLOYMENT_SESSION_LOG.md](./docs/PRODUCTION_DEPLOYMENT_SESSION_LOG.md)
  Исходные данные production server и план будущего clean rollout.
- [docs/WORK_LOG.md](./docs/WORK_LOG.md)
  Короткий список реально завершенных шагов.
- [docs/Findings/](./docs/Findings/)
  Открытые review findings и deferred risks.

## Стек

- Frontend: `React + TypeScript + Vite + Tailwind CSS + selective Preline plugins`
- Backend: `Node.js 24.x + Fastify + TypeScript`
- Database: `PostgreSQL + Drizzle ORM`
- Validation: `Zod`
- Realtime: `Server-Sent Events`
- Tests: `Vitest + Playwright`

## Локальная Разработка

Основной источник команд для локального запуска:

```text
docs/LOCAL_TESTING_CHEATSHEET.md
```

Коротко:

- локальный Chatwoot запускается отдельно;
- `v2` использует свой isolated Postgres из `infra/postgres/compose.yaml`;
- Mailpit используется для локальных email flows;
- tenants создаются через tenant-aware bootstrap scripts;
- backend и frontend запускаются отдельными командами `pnpm dev:backend` и
  `pnpm dev:web`.

`pnpm db:down` останавливает только database container портала и не трогает
Chatwoot.
