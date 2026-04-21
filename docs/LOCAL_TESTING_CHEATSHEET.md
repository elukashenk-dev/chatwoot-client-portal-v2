# Local Manual Testing Cheatsheet

Короткая шпаргалка для регулярного ручного тестирования уже установленного `chatwoot-client-portal-v2`.

## 1. Перейти в проект

```bash
cd /home/evluk/projects/chatwoot-client-portal-v2
```

## 2. Проверить `.env`

Обычно `.env` уже есть. Перед ручным тестом важно, чтобы в нем были актуальные значения:

```bash
SESSION_SECRET=любой-длинный-секрет-32+символа
CHATWOOT_BASE_URL=http://127.0.0.1:3000
CHATWOOT_ACCOUNT_ID=1
CHATWOOT_API_ACCESS_TOKEN=токен-из-chatwoot
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
SMTP_FROM=noreply@example.com
```

Если `.env` вдруг отсутствует:

```bash
cp .env.example .env
```

## 3. Убедиться, что внешние сервисы уже подняты

Для живого ручного тестирования должны работать отдельно:

```text
Chatwoot: http://127.0.0.1:3000
Mailpit UI: http://127.0.0.1:8025
Mailpit SMTP: 127.0.0.1:1025
```

Chatwoot и Mailpit эта шпаргалка не запускает.

## 4. Поднять Postgres для `v2`

Это отдельная БД только для `chatwoot-client-portal-v2`.

```bash
pnpm db:up
```

Логи БД:

```bash
pnpm db:logs
```

## 5. Запустить backend

В отдельном терминале:

```bash
cd /home/evluk/projects/chatwoot-client-portal-v2
set -a && source .env && set +a
pnpm dev:backend
```

Backend:

```text
http://127.0.0.1:3301
```

Backend применяет миграции сам при старте. Ручной вариант:

```bash
cd /home/evluk/projects/chatwoot-client-portal-v2
set -a && source .env && set +a
pnpm --dir backend db:migrate
```

## 6. Запустить frontend

В отдельном терминале:

```bash
cd /home/evluk/projects/chatwoot-client-portal-v2
set -a && source .env && set +a
pnpm dev:web
```

Открывать:

```text
http://127.0.0.1:5173
```

## 7. Быстрый тестовый login user

Если нужен пользователь без прохождения registration:

```bash
cd /home/evluk/projects/chatwoot-client-portal-v2
set -a && source .env && set +a
pnpm --dir backend user:create -- --email=name@company.ru --full-name="Portal User" --password='PortalPass123!'
```

Вход:

```text
/auth/login
email: name@company.ru
password: PortalPass123!
```

## 8. Где брать коды регистрации/reset

```text
http://127.0.0.1:8025
```

## 9. Автопроверки перед/после ручного теста

```bash
pnpm test
pnpm lint
pnpm build
```

Точечно:

```bash
pnpm --dir backend test
pnpm --dir frontend test
pnpm --dir backend build
pnpm --dir frontend typecheck
pnpm --dir frontend build
```

## 10. Playwright e2e проверки

Playwright нужен для автоматических браузерных сценариев, которые проверяют UI глубже, чем ручной быстрый просмотр.

Перед запуском Playwright окружение должно быть уже поднято:

```text
Postgres v2
backend: http://127.0.0.1:3301
frontend: http://127.0.0.1:5173
Chatwoot/Mailpit, если сценарий их требует
```

При запуске e2e Playwright сам читает `.env`, прогоняет миграции и пересоздает отдельного пользователя `e2e.portal.user@example.test` в БД `v2`.

Проверить версию:

```bash
pnpm exec playwright --version
```

Запустить e2e:

```bash
pnpm test:e2e
```

Запустить с видимым браузером:

```bash
pnpm test:e2e:headed
```

Открыть Playwright UI:

```bash
pnpm test:e2e:ui
```

Открыть последний HTML report:

```bash
pnpm test:e2e:report
```

Если браузерные binaries отсутствуют:

```bash
pnpm exec playwright install chromium
```

## 11. Остановить окружение

Backend/frontend остановить через `Ctrl+C`.

Остановить только isolated Postgres для `v2`:

```bash
pnpm db:down
```

`pnpm db:down` не трогает Chatwoot.
