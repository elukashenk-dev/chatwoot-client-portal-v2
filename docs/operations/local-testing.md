# Local Testing Cheatsheet

Короткая актуальная шпаргалка для ручного запуска
`chatwoot-client-portal-v2` в multi-tenant режиме.

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
read -rsp "ZUBI Chatwoot token: " ZUBI_TOKEN; echo

BUHFIRMA_WEBHOOK_SECRET="$(openssl rand -hex 32)"
ZUBI_WEBHOOK_SECRET="$(openssl rand -hex 32)"
```

## 5. Создать Локальные Tenants

Текущий удобный local host pattern:

```text
buhfirma.127.0.0.1.nip.io
zubi.127.0.0.1.nip.io
```

`nip.io` резолвит оба hostnames в `127.0.0.1`, но для browser/backend это
разные tenant hosts.

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

## 6. Проверить Chatwoot Связку Tenants

```bash
pnpm --dir backend tenant:chatwoot:ensure-portal-inbox -- --tenant=buhfirma
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
http://zubi.127.0.0.1.nip.io:5173
```

## 9. Настроить Chatwoot Webhooks

После запуска frontend/backend:

```bash
pnpm --dir backend tenant:chatwoot:webhook:configure -- --tenant=buhfirma
pnpm --dir backend tenant:chatwoot:webhook:configure -- --tenant=zubi
```

Ожидание:

- action: `updated`;
- команда обновляет `webhook_url` tenant portal API Channel inbox;
- callback URL идет на tenant host;
- secret sync использует API Channel `secret` (`channel_api.secret` в
  Chatwoot v4.13+);
- `secretStored: true`.

## 10. Быстрый Smoke Руками

Проверить public tenant context:

```text
http://buhfirma.127.0.0.1.nip.io:5173/api/tenant
http://zubi.127.0.0.1.nip.io:5173/api/tenant
```

Проверить PWA manifest:

```text
http://buhfirma.127.0.0.1.nip.io:5173/api/tenant/manifest.webmanifest
http://zubi.127.0.0.1.nip.io:5173/api/tenant/manifest.webmanifest
```

Installed PWA smoke для реальных Android/iOS устройств описан отдельно:
`docs/operations/installed-pwa-smoke.md`.

Основной ручной сценарий:

- открыть оба tenant hosts в разных вкладках;
- убедиться, что видны разные порталы;
- зарегистрировать пользователя buhfirma;
- зарегистрировать пользователя zubi;
- в каждом tenant дойти до чата;
- отправить сообщение и получить ответ от агента;
- проверить isolation: email из tenant A должен получать отказ в tenant B.

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

Для второго tenant:

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
