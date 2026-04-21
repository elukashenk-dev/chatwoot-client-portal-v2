# Isolated `Postgres` For `v2`

Этот bootstrap поднимает отдельный local `Postgres` только для `chatwoot-client-portal-v2`.

Он не должен использоваться совместно:

- с runtime-базой работающего `Chatwoot`;
- со старым `chatwoot-client-portal`;
- с любыми чужими migration/state экспериментами.

## Что использует bootstrap

- image: `postgres:16`
- host port: `55433`
- default db: `chatwoot_client_portal_v2`
- default user: `portal_v2`

Значения берутся из root `.env`, который создается из `.env.example`.

## Команды

Создать локальный `.env`:

```bash
cp .env.example .env
```

Поднять isolated `Postgres`:

```bash
pnpm db:up
```

Посмотреть логи:

```bash
pnpm db:logs
```

Остановить isolated `Postgres`:

```bash
pnpm db:down
```

После старта контейнера backend `v2` использует `DATABASE_URL` из root `.env` и сам применяет миграции при запуске `pnpm --dir backend dev`.
