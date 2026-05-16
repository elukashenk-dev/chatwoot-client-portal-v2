# Chatwoot Client Portal v2

Tenant-aware клиентский PWA-портал поверх Chatwoot для B2B-компаний.

Один portal deploy может обслуживать много компаний-tenants в shared SaaS
режиме. Dedicated install остается той же архитектурой, только с одним tenant и
своим Chatwoot.

## Базовые Правила

- `v2` - самостоятельный portal project.
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

## Текущий Baseline

Завершены:

- tenant schema foundation;
- tenant resolution middleware;
- tenant-aware Chatwoot client;
- tenant-scoped persistence;
- tenant-aware auth/session/registration/password reset;
- tenant-aware chat runtime;
- tenant-aware webhooks/provisioning;
- tenant-aware frontend/PWA metadata, manifest and icons;
- `MT-8.5` customer-facing UI/UX baseline;
- portal-owned `threadId` runtime для личного чата и company threads;
- destructive clean-schema reset: old portal users и old chat mappings не
  сохраняются;
- production clean reinstall на `lk.provgroup.ru`.

Следующий активный scope:

```text
MT-9 Tenant Admin And Branding Rebuild
```

## Карта документации

См. [docs/README.md](./docs/README.md).

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
docs/operations/local-testing.md
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
