# Local Environment Setup

Runbook для локального запуска `chatwoot-client-portal-v2` в production-like
multi-tenant режиме. Здесь хранятся только setup-команды для окружения,
bootstrap tenants, dev servers и auto-checks.

Полные MCP/QA сценарии и результаты прогонов находятся в отдельных документах.

## Что Должно Быть Уже Поднято

Эти сервисы живут отдельно от портала:

- Node.js 24.x;
- Docker Desktop;
- Chatwoot: `http://127.0.0.1:3000`;
- Mailpit UI: `http://127.0.0.1:8025`;
- Mailpit SMTP: `127.0.0.1:1025`.

`v2` сам использует только свой isolated Postgres на `127.0.0.1:55433`.

## 1. Перейти В Проект

```bash
cd /home/evluk/projects/chatwoot-client-portal-v2
```

Если зависимости еще не установлены:

```bash
pnpm install
```

## 2. Проверить `.env`

Если `.env` отсутствует:

```bash
cp .env.example .env
```

Минимально важное для локального запуска:

```bash
DATABASE_URL=postgresql://portal_v2:portal_v2_local_dev_password@127.0.0.1:55433/chatwoot_client_portal_v2
PORT=3301
SESSION_SECRET=любой-длинный-секрет-32+символа
PORTAL_TENANT_SECRET_KEY=base64-ключ-32-byte
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
SMTP_FROM=noreply@example.com
```

Если нужен новый `PORTAL_TENANT_SECRET_KEY`:

```bash
openssl rand -base64 32
```

## 3. Пересоздать Чистую Portal DB

Делать это, когда локальные portal данные можно удалить.

```bash
docker --context default compose --env-file .env -f infra/postgres/compose.yaml down -v
pnpm db:up
```

Подождать готовность Postgres:

```bash
docker --context default compose --env-file .env -f infra/postgres/compose.yaml exec db pg_isready -U portal_v2 -d chatwoot_client_portal_v2
```

Если Postgres еще не готов, повторить эту команду через пару секунд.

Прогнать миграции:

```bash
set -a && source .env && set +a
pnpm --dir backend db:migrate
```

Если сразу после `pnpm db:up` миграция упала с connection error, Postgres еще
не успел стартовать. Подождать пару секунд и повторить `pnpm --dir backend
db:migrate`.

## 4. Подготовить Tenant Secrets В Терминале

Chatwoot API tokens не записывать в docs и не коммитить.

```bash
read -rsp "BUHFIRMA Chatwoot token: " BUHFIRMA_TOKEN; echo
read -rsp "STROYFIRMA Chatwoot token: " STROYFIRMA_TOKEN; echo
read -rsp "ZUBI Chatwoot token: " ZUBI_TOKEN; echo

BUHFIRMA_WEBHOOK_SECRET="$(openssl rand -hex 32)"
STROYFIRMA_WEBHOOK_SECRET="$(openssl rand -hex 32)"
ZUBI_WEBHOOK_SECRET="$(openssl rand -hex 32)"
```

## 5. Создать Локальные Tenants

Текущий удобный local host pattern:

```text
buhfirma.127.0.0.1.nip.io
stroyfirma.127.0.0.1.nip.io
zubi.127.0.0.1.nip.io
```

`nip.io` резолвит эти hostnames в `127.0.0.1`, но для browser/backend это
разные tenant hosts.

`default` tenant на `127.0.0.1` может оставаться в локальной БД как dev
bootstrap tenant. Для production-like multi-tenant проверок использовать
tenant hosts выше, а не `default`.

### buhfirma

```bash
DEFAULT_TENANT_SLUG=buhfirma \
DEFAULT_TENANT_DISPLAY_NAME="Бухфирма" \
DEFAULT_TENANT_PRIMARY_DOMAIN=buhfirma.127.0.0.1.nip.io \
DEFAULT_TENANT_PUBLIC_BASE_URL=http://buhfirma.127.0.0.1.nip.io:5173 \
DEFAULT_TENANT_CHATWOOT_BASE_URL=http://127.0.0.1:3000 \
DEFAULT_TENANT_CHATWOOT_ACCOUNT_ID=3 \
DEFAULT_TENANT_CHATWOOT_PORTAL_INBOX_ID=6 \
DEFAULT_TENANT_CHATWOOT_API_ACCESS_TOKEN="$BUHFIRMA_TOKEN" \
DEFAULT_TENANT_CHATWOOT_WEBHOOK_SECRET="$BUHFIRMA_WEBHOOK_SECRET" \
pnpm --dir backend tenant:bootstrap-default
```

### stroyfirma

`stroyfirma` использует тот же local Chatwoot instance, но отдельный Chatwoot
account `5`. Локальный portal `Channel::Api` inbox для этого account - `9`.
Если локальная Chatwoot DB пересоздана и id поменялись, сначала проверить
актуальный API Channel inbox в Chatwoot admin.

```bash
DEFAULT_TENANT_SLUG=stroyfirma \
DEFAULT_TENANT_DISPLAY_NAME="Стройфирма" \
DEFAULT_TENANT_PRIMARY_DOMAIN=stroyfirma.127.0.0.1.nip.io \
DEFAULT_TENANT_PUBLIC_BASE_URL=http://stroyfirma.127.0.0.1.nip.io:5173 \
DEFAULT_TENANT_CHATWOOT_BASE_URL=http://127.0.0.1:3000 \
DEFAULT_TENANT_CHATWOOT_ACCOUNT_ID=5 \
DEFAULT_TENANT_CHATWOOT_PORTAL_INBOX_ID=9 \
DEFAULT_TENANT_CHATWOOT_API_ACCESS_TOKEN="$STROYFIRMA_TOKEN" \
DEFAULT_TENANT_CHATWOOT_WEBHOOK_SECRET="$STROYFIRMA_WEBHOOK_SECRET" \
pnpm --dir backend tenant:bootstrap-default
```

### zubi

```bash
DEFAULT_TENANT_SLUG=zubi \
DEFAULT_TENANT_DISPLAY_NAME="Зуби" \
DEFAULT_TENANT_PRIMARY_DOMAIN=zubi.127.0.0.1.nip.io \
DEFAULT_TENANT_PUBLIC_BASE_URL=http://zubi.127.0.0.1.nip.io:5173 \
DEFAULT_TENANT_CHATWOOT_BASE_URL=http://127.0.0.1:3000 \
DEFAULT_TENANT_CHATWOOT_ACCOUNT_ID=1 \
DEFAULT_TENANT_CHATWOOT_PORTAL_INBOX_ID=8 \
DEFAULT_TENANT_CHATWOOT_API_ACCESS_TOKEN="$ZUBI_TOKEN" \
DEFAULT_TENANT_CHATWOOT_WEBHOOK_SECRET="$ZUBI_WEBHOOK_SECRET" \
pnpm --dir backend tenant:bootstrap-default
```

Проверить фактический список локальных tenants:

```bash
set -a && source .env && set +a
psql "$DATABASE_URL" -c \
  "select slug, display_name, primary_domain, chatwoot_account_id, chatwoot_portal_inbox_id, status from portal_tenants order by slug;"
```

## 6. Проверить Chatwoot Связку Tenants

```bash
pnpm --dir backend tenant:chatwoot:ensure-portal-inbox -- --tenant=buhfirma
pnpm --dir backend tenant:chatwoot:ensure-portal-inbox -- --tenant=stroyfirma
pnpm --dir backend tenant:chatwoot:ensure-portal-inbox -- --tenant=zubi
```

Ожидание:

- result: `verified`;
- inbox type: `Channel::Api`;
- `lockToSingleConversation: true`.

## 7. Запустить Backend

В отдельном терминале:

```bash
cd /home/evluk/projects/chatwoot-client-portal-v2
set -a && source .env && set +a
pnpm dev:backend
```

Backend URL:

```text
http://127.0.0.1:3301
```

Health check:

```bash
curl http://127.0.0.1:3301/api/health
```

## 8. Запустить Frontend

В отдельном терминале:

```bash
cd /home/evluk/projects/chatwoot-client-portal-v2
set -a && source .env && set +a
pnpm dev:web --host 0.0.0.0
```

Открывать:

```text
http://buhfirma.127.0.0.1.nip.io:5173
http://stroyfirma.127.0.0.1.nip.io:5173
http://zubi.127.0.0.1.nip.io:5173
```

## 9. Настроить Chatwoot Webhooks

После запуска frontend/backend:

```bash
pnpm --dir backend tenant:chatwoot:webhook:configure -- --tenant=buhfirma
pnpm --dir backend tenant:chatwoot:webhook:configure -- --tenant=stroyfirma
pnpm --dir backend tenant:chatwoot:webhook:configure -- --tenant=zubi
```

Ожидание:

- action: `updated`;
- команда обновляет `webhook_url` tenant portal API Channel inbox;
- callback URL идет на tenant host;
- secret sync использует API Channel `secret` (`channel_api.secret` в
  Chatwoot v4.13+);
- `secretStored: true`.

## 10. Проверить Готовность Окружения

Эти проверки подтверждают, что локальное окружение поднято. Полные QA сценарии
не хранить в этом файле.

Проверить public tenant context:

```text
http://buhfirma.127.0.0.1.nip.io:5173/api/tenant
http://stroyfirma.127.0.0.1.nip.io:5173/api/tenant
http://zubi.127.0.0.1.nip.io:5173/api/tenant
```

Проверить PWA manifest:

```text
http://buhfirma.127.0.0.1.nip.io:5173/api/tenant/manifest.webmanifest
http://stroyfirma.127.0.0.1.nip.io:5173/api/tenant/manifest.webmanifest
http://zubi.127.0.0.1.nip.io:5173/api/tenant/manifest.webmanifest
```

Installed PWA smoke для реальных Android/iOS устройств описан отдельно:
`docs/operations/installed-pwa-smoke.md`.

Полные MCP Playwright сценарии для production, staging и local
production-like окружений:
`docs/operations/production-mcp-playwright-test-cycle.md`.

Подготовка Chatwoot contacts, portal registration test users, group contacts,
обязательных `portal_*` custom attributes и Mailpit registration flow описана
отдельно:
`docs/operations/local-cross-tenant-test-data.md`.

Последний результат MCP Playwright прогона записывать сюда, перезаписывая файл
целиком:
`docs/operations/mcp-playwright-latest-results.md`.

Коды registration/password reset смотреть в Mailpit:

```text
http://127.0.0.1:8025
```

## 11. Создать Portal User Без Registration

Использовать только для быстрых локальных проверок.

```bash
printf 'PortalPass123!\n' | pnpm --dir backend user:create -- \
  --tenant=buhfirma \
  --email=name@company.test \
  --full-name="Portal User" \
  --password-stdin
```

Login:

```text
http://buhfirma.127.0.0.1.nip.io:5173/auth/login
```

## 12. Автопроверки

Полезный общий набор:

```bash
pnpm test
pnpm lint
pnpm build
```

Точечно:

```bash
pnpm --dir backend test
pnpm --dir backend build
pnpm --dir frontend test
pnpm --dir frontend typecheck
pnpm --dir frontend build
```

## 13. Maintenance Cleanup Dry-Run

Проверить, сколько устаревших служебных записей portal DB можно удалить:

```bash
set -a && source .env && set +a
pnpm --dir backend maintenance:cleanup -- --dry-run
```

Команда чистит только portal-owned service traces. Chatwoot DB и история чатов
не затрагиваются.

## 14. Playwright E2E

Перед запуском должны быть подняты:

- Postgres v2;
- backend `http://127.0.0.1:3301`;
- frontend на нужном tenant host;
- Chatwoot/Mailpit, если сценарий их требует.

Для полного parallel-suite backend нужно поднять с увеличенным local/e2e auth
rate limit, иначе несколько login-сценариев с одного `127.0.0.1` честно
упрутся в production-default `5/min`:

```bash
AUTH_RATE_LIMIT_MAX=100 pnpm dev:backend
```

Для конкретного tenant host:

```bash
E2E_CHATWOOT_BASE_URL=http://127.0.0.1:3000 \
E2E_CHATWOOT_ACCOUNT_ID=3 \
E2E_CHATWOOT_PORTAL_INBOX_ID=6 \
E2E_CHATWOOT_API_ACCESS_TOKEN="$BUHFIRMA_TOKEN" \
PLAYWRIGHT_BASE_URL=http://buhfirma.127.0.0.1.nip.io:5173 \
E2E_TENANT_SLUG=buhfirma \
pnpm test:e2e
```

Для stroyfirma:

```bash
E2E_CHATWOOT_BASE_URL=http://127.0.0.1:3000 \
E2E_CHATWOOT_ACCOUNT_ID=5 \
E2E_CHATWOOT_PORTAL_INBOX_ID=9 \
E2E_CHATWOOT_API_ACCESS_TOKEN="$STROYFIRMA_TOKEN" \
PLAYWRIGHT_BASE_URL=http://stroyfirma.127.0.0.1.nip.io:5173 \
E2E_TENANT_SLUG=stroyfirma \
pnpm test:e2e
```

Для zubi:

```bash
E2E_CHATWOOT_BASE_URL=http://127.0.0.1:3000 \
E2E_CHATWOOT_ACCOUNT_ID=1 \
E2E_CHATWOOT_PORTAL_INBOX_ID=8 \
E2E_CHATWOOT_API_ACCESS_TOKEN="$ZUBI_TOKEN" \
PLAYWRIGHT_BASE_URL=http://zubi.127.0.0.1.nip.io:5173 \
E2E_TENANT_SLUG=zubi \
pnpm test:e2e
```

Дополнительные режимы:

```bash
pnpm test:e2e:headed
pnpm test:e2e:ui
pnpm test:e2e:report
```

Если браузерные binaries отсутствуют:

```bash
pnpm exec playwright install chromium
```

## 15. Остановить

Backend/frontend остановить через `Ctrl+C`.

Остановить только isolated Postgres для `v2`:

```bash
pnpm db:down
```

Удалить local portal DB полностью:

```bash
docker --context default compose --env-file .env -f infra/postgres/compose.yaml down -v
```
