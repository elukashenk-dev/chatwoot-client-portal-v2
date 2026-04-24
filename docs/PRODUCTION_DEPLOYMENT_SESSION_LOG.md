# Production Deployment Session Log

Протокол фактически выполненных шагов по выходу `chatwoot-client-portal-v2` в production рядом с уже работающим Chatwoot на Yandex Cloud VM.

Дата сессии: 2026-04-22.

## Исходные Условия

- Есть Yandex Cloud VM с уже работающим production Chatwoot.
- SSH-доступ к VM есть.
- Основной сайт: `provgroup.ru`.
- Chatwoot доступен на `chat.provgroup.ru`.
- Для клиентского портала выбран домен `lk.provgroup.ru`.
- Дополнительно DNS уже указывает `portal.provgroup.ru` на ту же VM, но в текущем deploy используется `lk.provgroup.ru`.
- Production Chatwoot core, его база и его application files не должны изменяться.

## Production Flow Подготовлен В Репозитории

- Создана ветка `feature/production-deploy-flow`.
- Подготовлены production Docker/Compose/Caddy templates:
  - `backend/Dockerfile`;
  - `frontend/Dockerfile`;
  - `infra/production/compose.yaml`;
  - `infra/production/Caddyfile`;
  - `.env.production.example`.
- Подготовлен runbook:
  - `docs/PRODUCTION_DEPLOYMENT.md`.
- Добавлены GitHub Actions baseline:
  - `.github/workflows/ci.yml`;
  - `.github/workflows/deploy-production.yml`.
- Исправлено решение по dev-файлам:
  - `docs/` и `frontend/screens/` остаются в git для разработки;
  - production Docker context исключает `docs` и `frontend/screens` через `.dockerignore`.
- Добавлен terminal installer:
  - `scripts/install-production.sh`.

## Installer Design

Installer сделан похожим на Chatwoot Linux VM install-flow:

- работает в терминале без GUI;
- показывает текущий шаг;
- пишет лог в `logs/install-YYYYMMDD-HHMMSS.log`;
- хранит ссылку на последний лог в `logs/install-latest.log`;
- хранит progress state в `.install/production.state`;
- при повторном запуске пропускает завершенные шаги;
- поддерживает `--install`, `--status`, `--logs`, `--reset-state`, `--reconfigure`;
- собирает `.env.production` интерактивно;
- устанавливает или проверяет Docker Engine и Docker Compose plugin;
- собирает и запускает Docker Compose stack;
- проверяет public health endpoint;
- запускает backend scripts для Chatwoot inbox routing и webhook setup.

## Почему Docker Compose

Выбран Docker Compose, а не package/systemd install, потому что на VM уже есть production Chatwoot.

Причины:

- меньше вмешательства в системные Node/Ruby/Postgres/Nginx зависимости Chatwoot;
- отдельная база портала живет в отдельном Docker volume;
- проще удалить или откатить портал без влияния на Chatwoot;
- версии Node/Postgres/Caddy фиксируются в Dockerfile/compose;
- deploy можно повторять через `docker compose up -d --build`.

## Проверка VM

SSH-доступ из WSL сначала не работал, потому что Linux/WSL использовал другой SSH key, чем Windows PowerShell.

Выполнено:

- проверен local public key `~/.ssh/id_ed25519.pub`;
- public key добавлен на VM в `~/.ssh/authorized_keys` пользователя `ubuntu`;
- после этого SSH из WSL заработал.

Проверенная VM:

- hostname: `chatwoot-vm`;
- user: `ubuntu`;
- рабочая директория пользователя: `/home/ubuntu`;
- публичный IP: `93.77.166.238`.

Проверка runtime на VM показала:

- Docker изначально не установлен;
- `80/tcp` и `443/tcp` заняты host `nginx`;
- значит выбран режим установки `reverse-proxy`.

## DNS И Nginx

Проверено с VM:

- `lk.provgroup.ru` резолвится в `93.77.166.238`;
- `portal.provgroup.ru` резолвится в `93.77.166.238`;
- внешний IPv4 VM: `93.77.166.238`.

Проверен текущий Nginx:

- `sudo nginx -t` прошел успешно;
- enabled sites:
  - `/etc/nginx/sites-enabled/default`;
  - `/etc/nginx/sites-enabled/nginx_chatwoot.conf`;
- Chatwoot Nginx config использует:
  - `chat.provgroup.ru`;
  - `www.chat.provgroup.ru`;
- `lk.provgroup.ru` в существующих Nginx configs не занят.

Решение:

- не редактировать Chatwoot Nginx config;
- добавить отдельный Nginx site для `lk.provgroup.ru`;
- проксировать `lk.provgroup.ru` в local portal container на `127.0.0.1:8088`;
- сертификат для `lk.provgroup.ru` выпускать отдельно через Let's Encrypt/certbot.

## Доставка Кода На VM

Для первого dry run выбран archive-based deploy, а не GitHub deploy key.

Причина:

- быстрее проверить VM, Nginx, Docker, portal runtime и Chatwoot webhook;
- точно доставляется текущая локальная ветка;
- GitHub-based production deploy будет настроен отдельным следующим шагом.

Локально в WSL проверено:

```bash
cd ~/projects/chatwoot-client-portal-v2
git status --short --branch
```

Состояние было чистым:

```text
## feature/production-deploy-flow
```

Создан архив:

```bash
mkdir -p /tmp/portal-deploy
git archive --format=tar.gz --output=/tmp/portal-deploy/chatwoot-client-portal-v2.tar.gz HEAD
```

Архив:

```text
/tmp/portal-deploy/chatwoot-client-portal-v2.tar.gz
size: 271K
```

Архив скопирован на VM:

```bash
scp /tmp/portal-deploy/chatwoot-client-portal-v2.tar.gz ubuntu@93.77.166.238:/tmp/chatwoot-client-portal-v2.tar.gz
```

На VM создана отдельная директория:

```bash
sudo mkdir -p /opt/chatwoot-client-portal-v2
sudo chown ubuntu:ubuntu /opt/chatwoot-client-portal-v2
```

Архив распакован в:

```text
/opt/chatwoot-client-portal-v2
```

Проверено, что на VM есть:

- `scripts/install-production.sh`;
- `infra/production/compose.yaml`;
- `infra/production/Caddyfile`;
- `.env.production.example`.

## Preflight Перед Installer

На VM проверены ресурсы:

```text
RAM total: 3.8Gi
RAM available: 2.4Gi
Swap: 4.0Gi
Disk /: 29G total, 19G available, 36% used
```

Проверены local ports:

- `127.0.0.1:8088` свободен;
- `127.0.0.1:8448` свободен.

## Installer Запущен На VM

Команда:

```bash
cd /opt/chatwoot-client-portal-v2
scripts/install-production.sh --install
```

Введенные/выбранные значения:

- `Portal domain`: `lk.provgroup.ru`;
- `Public portal origin`: `https://lk.provgroup.ru`;
- `Deployment mode`: `reverse-proxy`;
- `Local HTTP port for the portal container`: `8088`;
- `Unused local HTTPS port for the portal container`: `8448`;
- `Session secret`: generated by installer;
- `Portal Postgres database`: `chatwoot_client_portal_v2`;
- `Portal Postgres user`: `portal_v2`;
- `Portal Postgres password`: generated by installer;
- `Existing Chatwoot base URL`: `https://chat.provgroup.ru`;
- `Chatwoot account ID`: entered by user from Chatwoot account context;
- `Dedicated Chatwoot API access token`: entered by user, not recorded here;
- `Chatwoot portal inbox ID`: entered by user from Chatwoot API inbox URL;
- `Chatwoot webhook callback URL`: `https://lk.provgroup.ru/api/integrations/chatwoot/webhooks/account`;
- `Chatwoot webhook secret`: generated by installer;
- SMTP provider: Yandex 360;
- `SMTP host`: `smtp.yandex.ru`;
- `SMTP port`: `465`;
- `SMTP secure`: `true`;
- `SMTP user`: `cbr@provgroup.ru`;
- `SMTP password`: entered by user, not recorded here;
- `SMTP from address`: `cbr@provgroup.ru`.

Chatwoot webhook не создавался вручную в UI.

Installer должен был создать или обновить webhook сам через Chatwoot API.

## Installer Завершился Успешно

Финальный вывод installer-а:

```text
Production installer completed.
Portal: https://lk.provgroup.ru
Env file: /opt/chatwoot-client-portal-v2/.env.production
State file: /opt/chatwoot-client-portal-v2/.install/production.state
Log file: /opt/chatwoot-client-portal-v2/logs/install-20260422-175130.log
```

Полезные команды, которые installer показал:

```bash
scripts/install-production.sh --status
scripts/install-production.sh --logs
docker compose --env-file .env.production -f infra/production/compose.yaml ps
docker compose --env-file .env.production -f infra/production/compose.yaml logs -f portal-backend portal-web
```

## Post-Install Проверки

После завершения installer-а выполнена проверка состояния:

```bash
cd /opt/chatwoot-client-portal-v2
scripts/install-production.sh --status
curl -fsS https://lk.provgroup.ru/api/health && echo
```

Результат:

- installer state содержит завершенные шаги:
  `preflight`, `docker`, `env`, `compose_config`, `reverse_proxy_deps`, `build`, `up`, `reverse_proxy`, `public_health`, `chatwoot_routing`, `chatwoot_webhook`;
- контейнеры `portal-db`, `portal-backend`, `portal-web` подняты;
- `portal-db` и `portal-backend` healthy;
- public health endpoint вернул:

```json
{
  "app": "chatwoot-client-portal-v2",
  "environment": "production",
  "status": "ok"
}
```

Проверены публичные домены:

- `https://chat.provgroup.ru` отвечает `HTTP/2 200`;
- `https://lk.provgroup.ru` отвечает `HTTP/2 200`;
- сертификат `chat.provgroup.ru` валиден до `2026-07-03`;
- сертификат `lk.provgroup.ru` валиден до `2026-07-21`.

Проверены production setup scripts внутри `portal-backend`:

```bash
sudo docker compose --env-file .env.production -f infra/production/compose.yaml exec -T portal-backend node backend/dist/scripts/ensure-chatwoot-portal-inbox-routing.js
sudo docker compose --env-file .env.production -f infra/production/compose.yaml exec -T portal-backend node backend/dist/scripts/configure-chatwoot-account-webhook.js
```

Результат:

- portal inbox `Channel::Api` найден;
- `lockToSingleConversation` включен;
- account webhook настроен на:
  `https://lk.provgroup.ru/api/integrations/chatwoot/webhooks/account`;
- webhook subscriptions:
  `message_created`, `message_updated`.

## Webhook Secret Mismatch

Во время проверки realtime из Chatwoot в портал найден production issue:

- Chatwoot отправлял `POST /api/integrations/chatwoot/webhooks/account`;
- portal backend отвечал `401`;
- agent message появлялся в портале только после refresh.

Причина:

- installer сгенерировал `CHATWOOT_WEBHOOK_SECRET` в `.env.production`;
- Chatwoot account webhook имел свой фактический secret;
- эти значения не совпали.

Восстановление на VM:

```bash
cd /opt/chatwoot-client-portal-v2
read -rsp "Paste Chatwoot webhook secret: " WEBHOOK_SECRET; echo
sudo sed -i "s|^CHATWOOT_WEBHOOK_SECRET=.*|CHATWOOT_WEBHOOK_SECRET=\"${WEBHOOK_SECRET}\"|" .env.production
unset WEBHOOK_SECRET
sudo docker compose --env-file .env.production -f infra/production/compose.yaml up -d --force-recreate portal-backend
```

После пересоздания `portal-backend` health endpoint снова стал `ok`, и agent message начал появляться в портале без refresh.

Этот installer issue зафиксирован как active finding:

- `docs/Findings/F-PROD-001-webhook-secret-sync.md`.

## Browser Flow Проверки

На production portal проверено:

- страница `https://lk.provgroup.ru` открывается без ошибки сертификата;
- `https://chat.provgroup.ru` продолжает открываться отдельно;
- registration email через Yandex 360 SMTP приходит;
- пользователь может завершить регистрацию;
- пользователь может войти под email/password;
- после входа открывается `/app/chat`;
- первое сообщение пользователя создает Chatwoot conversation;
- сообщение агента из Chatwoot появляется в портале realtime после исправления webhook secret;
- password reset email приходит;
- пользователь может сменить пароль и войти новым паролем.

## Chatwoot Realtime Incident

Во время проверки найден отдельный production incident на стороне существующего Chatwoot:

- новые сообщения в Chatwoot admin начали появляться только после refresh;
- проблема проявилась не только для portal inbox, но и для Telegram/widget channels;
- уведомления о новых сообщениях при этом приходили;
- данные сохранялись, потери сообщений не было;
- Chatwoot `/cable` WebSocket был подключен и отправлял ping/presence frames;
- `message.created` frames в browser DevTools не приходили.

Проверено:

- host Nginx config для `chat.provgroup.ru` сохранил WebSocket upgrade headers;
- `chatwoot-web.1.service`, `chatwoot-worker.1.service`, `nginx`, `postgresql`, `redis` были active;
- Sidekiq queues не были забиты;
- Chatwoot logs не показывали явных errors/exceptions;
- ручной `ActionCable.server.broadcast` до открытой admin-вкладки не дошел.

Восстановление выполнено аккуратным рестартом только Chatwoot app services:

```bash
sudo systemctl restart chatwoot-web.1.service chatwoot-worker.1.service
sleep 10
sudo systemctl is-active chatwoot-web.1.service chatwoot-worker.1.service nginx.service redis-server.service
curl -fsS https://chat.provgroup.ru >/dev/null && echo "chatwoot ok"
```

Результат:

- `chatwoot-web.1.service` active;
- `chatwoot-worker.1.service` active;
- `nginx.service` active;
- `redis-server.service` active;
- `https://chat.provgroup.ru` отвечает;
- realtime снова работает во всех проверенных каналах и в обе стороны.

Вывод:

- портал не сломал данные Chatwoot;
- на VM завис realtime/broadcast слой Chatwoot;
- host Nginx и portal Nginx site не менялись для `chat.provgroup.ru`;
- для runbook нужен operational checklist: при похожем симптоме сначала проверить `/cable`, queues/logs, затем перезапустить `chatwoot-web` и `chatwoot-worker`.

## Follow-up: F-PROD-001 Installer Fix

Дата follow-up: 2026-04-23.

Выполнено локально:

- production installer перестал считать generated secret финальным Chatwoot webhook secret;
- backend webhook provisioning script получил installer-output режим, который возвращает фактический secret только для machine-readable sync path;
- обычный вывод provisioning script остается redacted и показывает только `hasSecret`;
- installer добавил `chatwoot_webhook_secret_sync`, `--sync-webhook-secret` и `--paste-webhook-secret`;
- installer sync flow обновляет `CHATWOOT_WEBHOOK_SECRET` в `.env.production`, пересоздает только `portal-backend` и повторно проверяет `/api/health`;
- если Chatwoot API не вернет secret, installer останавливается и просит скопировать secret из webhook edit form через paste flow.

Локальные проверки:

```bash
bash -n scripts/install-production.sh
pnpm --dir backend build
pnpm --dir backend test
pnpm exec prettier --check backend/src/scripts/configure-chatwoot-account-webhook.ts backend/src/scripts/configure-chatwoot-account-webhook-core.ts backend/src/scripts/configure-chatwoot-account-webhook-core.test.ts docs/PRODUCTION_DEPLOYMENT.md docs/WORK_LOG.md
git diff --check
```

Результат:

- shell syntax ok;
- backend build ok;
- backend tests: `12 passed`, `90 passed`;
- targeted prettier check ok;
- `git diff --check` ok.

Repo-wide check:

```bash
pnpm exec prettier --check .
```

Результат:

- failed on existing unrelated formatting debt outside this production finding scope;
- changed webhook/installer/runbook files were not in the warning list.

VM repair:

- обновленный archive доставлен на VM;
- перед repair создан backup текущей portal code directory в `/tmp/portal-backups`;
- `/opt/chatwoot-client-portal-v2` обновлен из archive без `.env.production`, logs, runtime artifacts и `node_modules`;
- `portal-backend` пересобран и пересоздан из новой версии кода;
- `scripts/install-production.sh --sync-webhook-secret` завершился успешно;
- Chatwoot account webhook updated:
  - webhook URL: `https://lk.provgroup.ru/api/integrations/chatwoot/webhooks/account`;
  - subscriptions: `message_created,message_updated`;
  - secret source: `save-response`;
- `.env.production` обновлен без печати secret в output;
- `portal-backend` пересоздан только один service;
- public health endpoint вернул:

```json
{
  "app": "chatwoot-client-portal-v2",
  "environment": "production",
  "status": "ok"
}
```

Signed webhook verification на VM:

- synthetic signed POST на `https://lk.provgroup.ru/api/integrations/chatwoot/webhooks/account` выполнен с secret из production env без вывода secret в лог;
- response:

```json
{
  "reason": "unmapped_conversation",
  "result": "ignored"
}
```

- HTTP status: `200`;
- это подтверждает, что валидно подписанный webhook больше не получает `401`.

Installer state после repair:

- добавлен завершенный step `chatwoot_webhook_secret_sync`;
- `portal-backend` healthy;
- `portal-db` healthy;
- `portal-web` running.

Finding закрыт:

- `docs/Findings/F-PROD-001-webhook-secret-sync.md` удален.

## Что Сделать После Dry Run

- Добавить в production runbook operational troubleshooting для Chatwoot realtime stall.
- Настроить production deploy "по-взрослому":
  - GitHub remote/deploy key или GitHub Actions;
  - deploy из immutable tag/commit;
  - backup перед update;
  - rollback flow.
- После подтверждения production runtime добавить отдельный checkpoint commit/merge flow.
