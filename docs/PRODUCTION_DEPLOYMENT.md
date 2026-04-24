# Production Deployment Flow

Этот документ описывает рабочий production-flow для развертывания `chatwoot-client-portal-v2` на виртуальной машине в Yandex Cloud рядом с уже работающим production Chatwoot.

Цель: развернуть портал как отдельное production-приложение, не трогая Chatwoot core и не используя базу Chatwoot как базу портала.

## 1. Целевая Архитектура

```text
User Browser / Installed PWA
        |
        | HTTPS
        v
https://portal.example.com
        |
        v
portal-web / Caddy
        | serves static frontend
        | proxies /api/*
        v
portal-backend / Fastify :3301
        |
        +--> portal-db / isolated PostgreSQL
        |
        +--> existing Chatwoot API: https://chatwoot.example.com
        |
        +--> SMTP provider

Chatwoot account webhook
        |
        | HTTPS POST
        v
https://portal.example.com/api/integrations/chatwoot/webhooks/account
```

Production-свойства этой схемы:

- портал имеет отдельный домен, например `portal.example.com`;
- frontend и backend находятся на одном origin: `https://portal.example.com`;
- browser ходит только в portal backend через `/api`;
- browser не получает Chatwoot token и не ходит в Chatwoot напрямую;
- Chatwoot остается external system of record для contacts/conversations/messages;
- портал использует отдельный `Postgres`, а не production DB самого Chatwoot;
- Caddy выпускает и обновляет TLS-сертификаты автоматически;
- `/api/*`, включая SSE realtime, проксируется в backend;
- webhook callback доступен Chatwoot по публичному HTTPS URL портала.

## 2. Git Flow

Постоянная `prod`-ветка не нужна.

Рекомендуемая схема:

- `main` - защищенная основная ветка;
- `feature/<scope>` - рабочие ветки;
- PR в `main` после closure flow;
- release tag для production deploy: `v0.1.0`, `v0.1.1`, `v0.2.0`;
- production deploy выполняется из конкретного tag или commit SHA, а не из плавающей ветки.

Почему не нужна `prod`-ветка:

- `prod`-ветка часто превращается во вторую правду рядом с `main`;
- rollback проще делать на предыдущий tag;
- GitHub Environments позволяют держать production approvals/secrets отдельно от веток;
- deploy из immutable ref легче аудитить.

Минимальная политика для GitHub:

1. `main` защищен.
2. В `main` нельзя пушить напрямую.
3. Перед merge должны пройти checks: `lint`, `build`, `test`.
4. Production deploy запускается вручную или по tag.
5. GitHub Environment `production` хранит только production secrets.

## 3. Production Scope В Этом Репозитории

Подготовленные файлы:

- `.env.production.example` - шаблон production env без secrets;
- `backend/Dockerfile` - production image для Fastify backend;
- `frontend/Dockerfile` - frontend build + Caddy static/reverse proxy image;
- `infra/production/compose.yaml` - production docker compose stack;
- `infra/production/Caddyfile` - static/proxy config для standalone HTTPS или internal HTTP behind existing reverse proxy;
- `scripts/install-production.sh` - terminal installer с пошаговым flow, логом, state-файлом и resume после сбоя;
- `.github/workflows/ci.yml` - базовый CI для `main` и PR;
- `.github/workflows/deploy-production.yml` - ручной SSH deploy workflow через GitHub Environment `production`;
- `docs/PRODUCTION_DEPLOYMENT.md` - этот runbook.

Что пока сознательно не автоматизировано:

- отдельный migration job перед backend start;
- remote backup storage;
- zero-downtime/blue-green deploy.

Это будут следующие hardening steps после первого ручного production dry run.

## 4. Что Нужно Подготовить До Первого Деплоя

### 4.1. Домен

Нужен отдельный домен или subdomain:

```text
portal.example.com
```

DNS:

```text
A portal.example.com -> public IPv4 Yandex Cloud VM
```

Если используешь IPv6:

```text
AAAA portal.example.com -> public IPv6 Yandex Cloud VM
```

Проверка с локальной машины:

```bash
dig +short portal.example.com
```

### 4.2. Yandex Cloud VM

Минимально для первого production-test:

- Ubuntu LTS;
- 2 vCPU;
- 2-4 GB RAM;
- 20+ GB disk;
- public IP;
- snapshots/backups включить до настоящего production traffic.

Если на этой же VM уже крутится Chatwoot, обязательно проверить свободные ресурсы:

```bash
free -h
df -h
docker ps
docker stats
```

### 4.3. Yandex Cloud Security Group

Inbound rules:

| Port      | Source         | Purpose                        |
| --------- | -------------- | ------------------------------ |
| `22/tcp`  | только твой IP | SSH                            |
| `80/tcp`  | `0.0.0.0/0`    | ACME HTTP challenge / redirect |
| `443/tcp` | `0.0.0.0/0`    | HTTPS portal                   |

Не открывать наружу:

- `3301` backend;
- `5432` portal Postgres;
- любые internal Docker ports.

Outbound rules:

- разрешить HTTPS наружу для Chatwoot API, ACME/TLS и package/image downloads;
- разрешить SMTP provider endpoint/port;
- если политика outbound строгая, явно добавить нужные назначения.

Важно для realtime:

- Yandex Cloud security groups могут иметь idle TCP limits;
- portal backend уже отправляет SSE keepalive каждые 25 секунд;
- Caddy в шаблоне отключает response buffering для `/api/*` через `flush_interval -1`;
- если realtime начинает отваливаться ровно через фиксированный интервал, сначала проверять security group/NAT/proxy idle timeout.

### 4.4. Chatwoot Production Данные

Нужно заранее подготовить:

- `CHATWOOT_BASE_URL`, например `https://chatwoot.example.com`;
- `CHATWOOT_ACCOUNT_ID`;
- dedicated Chatwoot API access token;
- `CHATWOOT_PORTAL_INBOX_ID` для выделенного `Channel::Api` inbox портала;
- webhook callback URL:

```text
https://portal.example.com/api/integrations/chatwoot/webhooks/account
```

Требования к Chatwoot:

- Chatwoot core не менять;
- production DB Chatwoot не использовать для портала;
- portal inbox должен работать как single conversation/reopen same conversation;
- webhook должен слать события в portal backend.

### 4.5. SMTP

Для registration/password-reset нужен SMTP provider:

- host;
- port;
- secure mode;
- user/pass;
- from address.

Проверить, что VM может подключаться к SMTP provider:

```bash
nc -vz smtp.example.com 587
```

## 5. Подготовка VM

### 5.1. Рекомендуемый Terminal Installer

Для первого production deploy предпочтительно использовать installer:

```bash
scripts/install-production.sh --install
```

Installer работает в терминале, без GUI:

- показывает текущий шаг;
- пишет подробный лог в `logs/install-YYYYMMDD-HHMMSS.log`;
- держит ссылку на последний лог: `logs/install-latest.log`;
- пишет state в `.install/production.state`;
- при повторном запуске пропускает уже завершенные шаги и продолжает с места разрыва;
- спрашивает нужные значения: домен портала, Chatwoot URL/account/token/inbox, webhook callback URL, SMTP, DB credentials и режим проксирования;
- генерирует stable secrets, если пользователь оставляет generated secret по умолчанию;
- создает `.env.production` с правами `600`;
- записывает временный bootstrap `CHATWOOT_WEBHOOK_SECRET`, чтобы `portal-backend` мог стартовать до provisioning-а;
- устанавливает/проверяет Docker Engine и Compose plugin;
- собирает и запускает production Docker Compose stack;
- проверяет `/api/health`;
- запускает backend scripts для проверки Chatwoot inbox routing;
- создает или обновляет Chatwoot account webhook, читает фактический webhook secret из Chatwoot API, тихо обновляет `.env.production`, пересоздает только `portal-backend` и повторно проверяет `/api/health`;
- если Chatwoot API не возвращает secret, installer останавливается до завершения sync-step и просит скопировать secret из webhook edit form.

Полезные команды:

```bash
scripts/install-production.sh --status
scripts/install-production.sh --logs
scripts/install-production.sh --sync-webhook-secret
scripts/install-production.sh --paste-webhook-secret
scripts/install-production.sh --install --reconfigure
scripts/install-production.sh --reset-state
```

`--reset-state` удаляет только state installer-а. Он не удаляет `.env.production`, Docker volumes, containers и базу.

### 5.1.1. Archive-Based Delivery Of The Current Worktree

Если нужно быстро доставить на VM именно текущий локальный feature-slice, включая еще не закоммиченные изменения, используем локальный helper:

```bash
pnpm deploy:archive -- --host=ubuntu@93.77.166.238 --app-path=/opt/chatwoot-client-portal-v2
```

Что делает helper:

- собирает `tar.gz` из текущего working tree;
- исключает local env/secrets files, `.install`, `logs`, `backups`, `node_modules`, `dist` и другие generated artifacts;
- копирует архив на VM по `scp`;
- распаковывает его в production app directory через `rsync`;
- сохраняет на VM:
  - `.env.production`;
  - `.install`;
  - `logs/`;
  - `backups/`;
  - локальный `.git`, если он там уже есть.

Если нужно сразу пересобрать stack после доставки:

```bash
pnpm deploy:archive -- --host=ubuntu@93.77.166.238 --app-path=/opt/chatwoot-client-portal-v2 --activate
```

Если после rebuild нужен еще и webhook secret sync:

```bash
pnpm deploy:archive -- --host=ubuntu@93.77.166.238 --app-path=/opt/chatwoot-client-portal-v2 --activate --sync-webhook-secret
```

Этот helper нужен именно для feature validation и repair/update текущего worktree. Канонический immutable production deploy после checkpoint commit/tag остается git/tag-based.

### 5.2. Режимы Публикации

Installer поддерживает два режима.

`standalone`:

- использовать, если на VM свободны `80/443`;
- container `portal-web` публично слушает `80/443`;
- Caddy внутри container сам выпускает TLS certificate для `PORTAL_DOMAIN`.

`reverse-proxy`:

- использовать, если на этой же VM уже работает Chatwoot и его Nginx занимает `80/443`;
- `portal-web` слушает только `127.0.0.1:8088` по HTTP;
- host Nginx проксирует `portal.example.com` в `127.0.0.1:8088`;
- installer может поставить `nginx/certbot`, создать отдельный Nginx site и запросить Let's Encrypt certificate через `certbot --nginx`;
- Chatwoot Nginx не должен редактироваться вручную внутри его application files.

Если `80/443` заняты, installer по умолчанию предложит `reverse-proxy`.

### 5.3. Подключиться По SSH

```bash
ssh user@<vm-public-ip>
```

Рекомендуется:

- отключить password SSH login;
- использовать SSH keys;
- ограничить `22/tcp` своим IP в security group;
- завести отдельного deploy user, если не хочешь деплоить под основным пользователем.

### 5.4. Установить Docker И Compose Plugin

Ориентир - официальные Docker docs для Ubuntu.

После установки проверить:

```bash
docker version
docker compose version
```

Пользователь должен иметь право запускать Docker:

```bash
sudo usermod -aG docker "$USER"
```

После этого перелогиниться.

### 5.5. Подготовить Директорию

```bash
sudo mkdir -p /opt/chatwoot-client-portal-v2
sudo chown "$USER":"$USER" /opt/chatwoot-client-portal-v2
cd /opt/chatwoot-client-portal-v2
```

Клонировать repo:

```bash
git clone git@github.com:<org-or-user>/chatwoot-client-portal-v2.git .
```

Для private repo на VM нужен deploy key или доступ через GitHub SSH.

## 6. Production Env

Скопировать шаблон:

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

Сгенерировать secrets:

```bash
openssl rand -base64 48
openssl rand -base64 32
```

Заполнить `.env.production`.

Критичные значения:

```env
PORTAL_DOMAIN=portal.example.com
APP_ORIGIN=https://portal.example.com
PORTAL_DEPLOYMENT_MODE=standalone
PORTAL_CADDY_SITE_ADDRESS=portal.example.com
PORTAL_HTTP_BIND=0.0.0.0
PORTAL_HTTP_PORT=80
PORTAL_HTTPS_BIND=0.0.0.0
PORTAL_HTTPS_PORT=443
NODE_ENV=production
SESSION_SECRET=<long-stable-secret>

PORTAL_V2_POSTGRES_PASSWORD=<strong-db-password>
DATABASE_URL=postgresql://portal_v2:<same-strong-db-password>@portal-db:5432/chatwoot_client_portal_v2

CHATWOOT_BASE_URL=https://chatwoot.example.com
CHATWOOT_ACCOUNT_ID=1
CHATWOOT_API_ACCESS_TOKEN=<dedicated-token>
CHATWOOT_PORTAL_INBOX_ID=<portal-api-inbox-id>
CHATWOOT_WEBHOOK_CALLBACK_URL=https://portal.example.com/api/integrations/chatwoot/webhooks/account
CHATWOOT_WEBHOOK_SECRET=<webhook-secret>
```

Важно:

- `APP_ORIGIN` должен быть точным origin браузера;
- в production cookie становится `secure`, поэтому нужен HTTPS;
- `PORTAL_CADDY_SITE_ADDRESS=portal.example.com` включает standalone HTTPS через Caddy;
- если портал стоит behind existing Nginx, ставить `PORTAL_CADDY_SITE_ADDRESS=:80`, `PORTAL_HTTP_BIND=127.0.0.1`, `PORTAL_HTTP_PORT=8088`;
- `DATABASE_URL` должен указывать на compose service `portal-db`, не на `127.0.0.1`;
- `CHATWOOT_BASE_URL` должен быть доступен с VM;
- при installer-flow `CHATWOOT_WEBHOOK_SECRET` сначала может быть bootstrap value, но после `chatwoot_webhook_secret_sync` обязан совпадать с фактическим secret Chatwoot account webhook;
- при manual deploy без installer нужно либо сразу вписать фактический webhook secret из Chatwoot, либо после старта backend выполнить sync/paste flow ниже;
- secrets не коммитить.

## 7. Первый Ручной Deploy

С VM, из директории repo:

```bash
docker compose \
  --env-file .env.production \
  -f infra/production/compose.yaml \
  build
```

Запуск:

```bash
docker compose \
  --env-file .env.production \
  -f infra/production/compose.yaml \
  up -d
```

Проверить состояние:

```bash
docker compose \
  --env-file .env.production \
  -f infra/production/compose.yaml \
  ps
```

Логи:

```bash
docker compose \
  --env-file .env.production \
  -f infra/production/compose.yaml \
  logs -f portal-backend portal-web
```

Backend при старте применяет Drizzle migrations автоматически.

Health check:

```bash
curl -fsS https://portal.example.com/api/health
```

Ожидаемый ответ:

```json
{
  "app": "chatwoot-client-portal-v2",
  "environment": "production",
  "status": "ok"
}
```

## 8. Chatwoot Setup После Старта Portal Backend

Проверить/включить portal inbox routing:

```bash
docker compose \
  --env-file .env.production \
  -f infra/production/compose.yaml \
  exec portal-backend \
  node backend/dist/scripts/ensure-chatwoot-portal-inbox-routing.js
```

Создать/синхронизировать account webhook:

```bash
scripts/install-production.sh --sync-webhook-secret
```

Если это repair существующей VM после доставки обновленного архива с новым installer-кодом, сначала пересобрать и пересоздать `portal-backend`, чтобы running container уже содержал поддержку `--installer-output`:

```bash
docker compose \
  --env-file .env.production \
  -f infra/production/compose.yaml \
  build portal-backend

docker compose \
  --env-file .env.production \
  -f infra/production/compose.yaml \
  up -d --force-recreate --no-deps portal-backend

scripts/install-production.sh --sync-webhook-secret
```

Команда:

- создает или обновляет существующий webhook по URL;
- обновляет subscriptions;
- читает фактический secret из Chatwoot API;
- обновляет `CHATWOOT_WEBHOOK_SECRET` в `.env.production`;
- пересоздает только `portal-backend`;
- проверяет public `/api/health`.

Если Chatwoot API не вернул secret, открыть Chatwoot webhook edit form, скопировать secret и выполнить:

```bash
scripts/install-production.sh --paste-webhook-secret
```

Обычный backend script можно запускать для безопасной проверки без печати secret:

```bash
docker compose \
  --env-file .env.production \
  -f infra/production/compose.yaml \
  exec portal-backend \
  node backend/dist/scripts/configure-chatwoot-account-webhook.js
```

После sync/paste flow в Chatwoot admin проверить:

- webhook URL;
- webhook secret;
- account scope;
- нужные message/conversation events.

## 9. Manual Production Validation Checklist

### 9.1. Basic Runtime

- `https://portal.example.com` открывается.
- HTTPS certificate валиден.
- `/api/health` возвращает `production`.
- В browser devtools нет mixed content.
- Service worker registered.
- Manifest доступен: `https://portal.example.com/manifest.webmanifest`.

### 9.2. Auth

- Login работает.
- Logout очищает session.
- Неавторизованный пользователь не попадает в `/app/chat`.
- Cookie `portal_session`:
  - `HttpOnly`;
  - `Secure`;
  - `SameSite=Lax`.

### 9.3. Registration / Password Reset

- Eligibility check работает на существующем Chatwoot contact.
- Email verification письмо уходит через production SMTP.
- Password setup завершает registration.
- Password reset письмо уходит.
- Новый пароль работает.

### 9.4. Chat

- Пользователь видит основной чат.
- История сообщений загружается.
- Старые сообщения подгружаются.
- Text send работает.
- Первый send создает conversation, если ее еще не было.
- Attachment send работает.
- Reply от пользователя работает:
  - desktop: right click -> `Ответить`;
  - mobile/PWA: swipe left.
- Copy из desktop context menu работает.
- Reply от агента из Chatwoot виден с quoted preview.
- Переводы строк от агента отображаются без лишних slash.

### 9.5. Realtime

- Сообщение агента появляется у пользователя без refresh.
- Повторная webhook delivery не создает duplicate.
- SSE не отваливается через 1-3 минуты простоя.
- После sleep/background PWA reconnect/resync будет проверен отдельно в PWA hardening phase.

### 9.6. PWA

- Android/Chrome предлагает установить приложение или позволяет install.
- Installed PWA открывается как standalone.
- iOS Add to Home Screen показывает корректное имя/icon.
- Chat composer и keyboard не ломают viewport.
- Attachment picker работает в standalone mode.

## 10. Backup Перед Обновлением

Создать директорию backups:

```bash
mkdir -p backups
```

Загрузить env в shell:

```bash
set -a
source .env.production
set +a
```

Сделать dump portal DB:

```bash
docker compose \
  --env-file .env.production \
  -f infra/production/compose.yaml \
  exec -T portal-db \
  pg_dump -U "$PORTAL_V2_POSTGRES_USER" "$PORTAL_V2_POSTGRES_DB" \
  | gzip > "backups/portal-db-$(date +%Y%m%d-%H%M%S).sql.gz"
```

Проверить, что файл не пустой:

```bash
ls -lh backups/
gzip -t backups/portal-db-*.sql.gz
```

Рекомендуется копировать backups за пределы VM:

```bash
scp backups/portal-db-YYYYMMDD-HHMMSS.sql.gz local-backups/
```

## 11. Update Flow

### 11.1. Fast VM Update From The Current Local Slice

Если нужно проверить на VM текущую локальную ветку до checkpoint commit, используем archive helper из раздела выше:

```bash
pnpm deploy:archive -- --host=ubuntu@93.77.166.238 --app-path=/opt/chatwoot-client-portal-v2 --activate
```

Если обновление затрагивает production webhook provisioning logic, после rebuild сразу синхронизировать secret:

```bash
pnpm deploy:archive -- --host=ubuntu@93.77.166.238 --app-path=/opt/chatwoot-client-portal-v2 --activate --sync-webhook-secret
```

### 11.2. Immutable Git/Tag Update

Перед update:

1. Проверить, что GitHub checks зеленые.
2. Создать release tag.
3. На VM сделать backup portal DB.
4. Записать текущий deployed ref:

```bash
git rev-parse --short HEAD
```

Обновить код:

```bash
git fetch --tags --prune
git checkout v0.1.0
```

Пересобрать и применить:

```bash
docker compose \
  --env-file .env.production \
  -f infra/production/compose.yaml \
  up -d --build
```

Проверить:

```bash
curl -fsS https://portal.example.com/api/health
docker compose --env-file .env.production -f infra/production/compose.yaml ps
```

Потом пройти короткий smoke:

- login;
- chat load;
- text send;
- agent realtime;
- attachment if touched;
- reply if touched.

## 12. Rollback Flow

Если новый release сломался, сначала определить тип поломки.

### 12.1. Code-only Rollback

Если DB migrations не применяли breaking changes:

```bash
git fetch --tags --prune
git checkout <previous-good-tag>

docker compose \
  --env-file .env.production \
  -f infra/production/compose.yaml \
  up -d --build
```

Проверить `/api/health` и smoke.

### 12.2. DB Restore Rollback

Если новая версия применила несовместимые migrations:

1. Остановить portal backend.

```bash
docker compose \
  --env-file .env.production \
  -f infra/production/compose.yaml \
  stop portal-backend
```

2. Восстановить dump.

Осторожно: эта команда перезаписывает portal DB.

```bash
gunzip -c backups/portal-db-YYYYMMDD-HHMMSS.sql.gz \
  | docker compose \
      --env-file .env.production \
      -f infra/production/compose.yaml \
      exec -T portal-db \
      psql -U "$PORTAL_V2_POSTGRES_USER" "$PORTAL_V2_POSTGRES_DB"
```

3. Вернуть предыдущий tag и поднять stack.

```bash
git checkout <previous-good-tag>

docker compose \
  --env-file .env.production \
  -f infra/production/compose.yaml \
  up -d --build
```

## 13. Logs And Operations

Статус:

```bash
docker compose --env-file .env.production -f infra/production/compose.yaml ps
```

Логи backend:

```bash
docker compose --env-file .env.production -f infra/production/compose.yaml logs -f portal-backend
```

Логи Caddy:

```bash
docker compose --env-file .env.production -f infra/production/compose.yaml logs -f portal-web
```

Логи DB:

```bash
docker compose --env-file .env.production -f infra/production/compose.yaml logs -f portal-db
```

Перезапуск backend:

```bash
docker compose --env-file .env.production -f infra/production/compose.yaml restart portal-backend
```

Посмотреть resources:

```bash
docker stats
df -h
free -h
```

## 14. Operational Troubleshooting

### 14.1. Chatwoot Admin Realtime Stall

Симптом:

- сообщения сохраняются;
- portal health ok;
- уведомления могут приходить;
- но в Chatwoot admin новые сообщения появляются только после refresh;
- проблема видна не только в portal inbox, но и в других Chatwoot channels.

Это похоже не на поломку портала, а на зависание realtime/broadcast слоя Chatwoot.

Что проверить:

1. `https://chatwoot.example.com` открывается.
2. В Chatwoot admin browser DevTools `/cable` подключен.
3. Новые сообщения реально сохраняются и появляются после refresh.
4. Проблема повторяется хотя бы в одном не-portal channel.
5. На VM активны Chatwoot services:

```bash
sudo systemctl is-active \
  chatwoot-web.1.service \
  chatwoot-worker.1.service \
  nginx.service \
  redis-server.service
```

Если явной ошибки в logs/queues нет и симптомы совпадают, аккуратно перезапустить только Chatwoot app services:

```bash
sudo systemctl restart chatwoot-web.1.service chatwoot-worker.1.service
sleep 10
sudo systemctl is-active chatwoot-web.1.service chatwoot-worker.1.service nginx.service redis-server.service
curl -fsS https://chatwoot.example.com >/dev/null && echo "chatwoot ok"
```

После этого проверить:

- Chatwoot admin снова получает новые сообщения без refresh;
- `https://portal.example.com/api/health` остается `ok`;
- agent reply снова появляется в portal realtime без refresh.

Не трогать для этого incident:

- Chatwoot database;
- portal database;
- Chatwoot application files;
- portal Docker volumes.

## 15. GitHub Actions

В репозитории уже есть два стартовых workflow:

- `.github/workflows/ci.yml`;
- `.github/workflows/deploy-production.yml`.

### 15.1. CI

CI запускается на PR в `main` и push в `main`:

- `pnpm install --frozen-lockfile`;
- `pnpm lint`;
- `pnpm build`;
- `pnpm test`;
- focused e2e будет добавлен отдельно, когда для runner будет готов reproducible browser/runtime environment.

### 15.2. Production Deploy

Текущий workflow `Deploy Production` запускается вручную через `workflow_dispatch` и принимает `ref`: tag, branch или commit SHA.

Нужные GitHub Environment secrets для `production`:

| Secret                       | Meaning                                                              |
| ---------------------------- | -------------------------------------------------------------------- |
| `PRODUCTION_SSH_HOST`        | public IP или DNS VM                                                 |
| `PRODUCTION_SSH_PORT`        | SSH port, обычно `22`                                                |
| `PRODUCTION_SSH_USER`        | deploy user на VM                                                    |
| `PRODUCTION_SSH_PRIVATE_KEY` | private key для доступа на VM                                        |
| `PRODUCTION_SSH_KNOWN_HOSTS` | pinned known_hosts entry; если пусто, workflow сделает `ssh-keyscan` |
| `PRODUCTION_APP_PATH`        | путь repo на VM, например `/opt/chatwoot-client-portal-v2`           |

Текущий workflow делает:

1. SSH на VM.
2. `git fetch --tags --prune origin`.
3. `git checkout <ref>`.
4. `docker compose --env-file .env.production -f infra/production/compose.yaml up -d --build`.
5. `docker compose ... ps`.

Важное условие: VM должна иметь доступ к GitHub repo. Для private repo нужен deploy key на VM или другой одобренный способ pull.

Рекомендуемый mature path на будущее:

1. GitHub Actions собирает Docker images.
2. Images пушатся в GHCR.
3. VM тянет immutable images по tag.
4. Deploy workflow использует GitHub Environment `production`.
5. Deploy требует ручного approval.
6. VM не собирает код, а только `docker compose pull && docker compose up -d`.

Текущий path проще:

1. GitHub Actions SSH-ится на VM.
2. VM делает `git fetch`.
3. VM checkout нужного tag.
4. VM выполняет `docker compose up -d --build`.

Упрощенный path быстрее стартует, но mature path лучше для production:

- сборка воспроизводимее;
- deploy быстрее;
- VM не нужны build dependencies;
- rollback проще через image tag.

## 16. Security Checklist

- `.env.production` не в git.
- `SESSION_SECRET` длинный и стабильный.
- `CHATWOOT_API_ACCESS_TOKEN` dedicated для портала.
- `CHATWOOT_WEBHOOK_SECRET` отдельный и сильный.
- DB password сильный.
- VM security group не открывает DB/backend ports наружу.
- SSH открыт только с твоего IP.
- Caddy получает валидный HTTPS certificate.
- `APP_ORIGIN` строго равен `https://portal.example.com`.
- Browser не получает Chatwoot secrets.
- В logs не писать tokens/passwords/webhook secrets.
- Перед production traffic сделать snapshot VM или backup DB.

## 17. Known Production Gaps

Эти пункты нужно усилить перед настоящим production traffic:

- отдельный migration job вместо auto-migrate on backend start;
- external/off-VM backups;
- CI/CD через immutable Docker images;
- observability: structured logs, error monitoring, uptime check;
- rate limiting на auth-sensitive endpoints;
- PWA hardening: update UX, background/sleep reconnect, offline state;
- push notifications phase.

## 18. Official References

- Yandex Cloud Security Groups: https://yandex.cloud/ru/docs/vpc/concepts/security-groups
- Yandex Cloud VPC limits: https://yandex.cloud/ru/docs/vpc/concepts/limits
- Yandex Cloud SSH to VM: https://yandex.cloud/ru/docs/compute/operations/vm-connect/ssh
- Docker Engine on Ubuntu: https://docs.docker.com/engine/install/ubuntu/
- Docker Compose plugin on Linux: https://docs.docker.com/compose/install/linux/
- Caddy Automatic HTTPS: https://caddyserver.com/docs/automatic-https
- Caddy `reverse_proxy`: https://caddyserver.com/docs/caddyfile/directives/reverse_proxy
- Chatwoot Linux VM install: https://developers.chatwoot.com/self-hosted/deployment/linux-vm
- Chatwoot CTL: https://developers.chatwoot.com/self-hosted/deployment/chatwoot-ctl
- Chatwoot webhooks: https://www.chatwoot.com/hc/user-guide/articles/1677693021-how-to-use-webhooks
- Chatwoot API reference: https://developers.chatwoot.com/api-reference/introduction
- GitHub Environments: https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments
- GitHub protected branches: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
- MDN Secure Contexts: https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts
- MDN installable PWAs: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
