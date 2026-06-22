# Chatwoot 4.13 Production Upgrade Notes

Дата операции: `2026-05-07`

Сервер: `ubuntu@93.77.166.238`

Historical operation note: the public Chatwoot host used during this operation
has since been retired from the active production baseline. Current domain
baseline: primary production Chatwoot admin/runtime URL is
`https://app.lancora.ru`.

Upgrade path: Chatwoot CE `v4.12.1` -> `v4.13.0`

## Зачем Этот Файл

Этот документ фиксирует реальный опыт production-обновления Chatwoot, а не
идеальный happy path из инструкции. Он нужен, чтобы в следующий раз заранее
знать:

- какие проверки сделать до апгрейда;
- где официальный `cwctl --upgrade` может споткнуться;
- как сохранить production custom patch;
- почему сборка assets может занять много времени;
- какие проверки считать обязательными после миграций.

## Официальные Источники

- Chatwoot self-hosted Linux VM / `cwctl`:
  https://developers.chatwoot.com/self-hosted/deployment/chatwoot-ctl/
- Chatwoot release `v4.13.0`:
  https://github.com/chatwoot/chatwoot/releases/tag/v4.13.0

## Что Важно В `v4.13.0`

Для портала критично изменение webhook signing:

- `Channel::Api` получил dedicated `secret`;
- `AgentBot` получил dedicated `secret`;
- миграция `BackfillAgentBotAndChannelApiSecrets` заполняет secrets для
  существующих записей.

После `v4.13.0` portal должен использовать secret API Channel webhook, а не
старый account webhook secret.

## Preflight Checklist

Перед апгрейдом проверить:

```bash
ssh ubuntu@93.77.166.238

curl -fsS https://app.lancora.ru/api
sudo cwctl --version
systemctl is-active chatwoot-web.1.service chatwoot-worker.1.service redis-server postgresql nginx
df -h /
free -h
```

Проверить git-состояние Chatwoot:

```bash
sudo -u chatwoot bash -lc '
  cd /home/chatwoot/chatwoot
  git branch --show-current
  git rev-parse --short HEAD
  git describe --tags --always --dirty
  git status --porcelain=v1
  git remote -v
'
```

Проверить, что target release действительно тот, который нужен:

```bash
curl -fsS https://app.chatwoot.com/api

sudo -u chatwoot bash -lc '
  cd /home/chatwoot/chatwoot
  git ls-remote origin refs/heads/master refs/tags/v4.13.0 refs/tags/v4.13.0^{}
'
```

Проверить `pgvector`:

```bash
sudo -u postgres psql -d chatwoot_production -tAc \
  "select extname, extversion from pg_extension where extname='vector';"
```

## Backup

Backup был сделан перед миграциями и проверен.

Итоговый backup:

```text
/home/ubuntu/chatwoot-prod-backups/chatwoot-v4.12.1-before-v4.13.0-20260507T175416Z
```

Внутри:

- `chatwoot_production.dump` - PostgreSQL custom-format dump;
- `storage.tar.gz` - Chatwoot local storage;
- `chatwoot.env` - production `.env`;
- `metadata.txt` - snapshot состояния перед upgrade;
- `SHA256SUMS` - контрольные суммы.

Практичный backup command pattern:

```bash
BACKUP_ROOT=/home/ubuntu/chatwoot-prod-backups
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_DIR="$BACKUP_ROOT/chatwoot-v4.12.1-before-v4.13.0-$STAMP"

sudo mkdir -p "$BACKUP_DIR"
sudo chmod 700 "$BACKUP_DIR"

sudo -u postgres pg_dump -Fc --no-acl --no-owner -d chatwoot_production \
  | sudo tee "$BACKUP_DIR/chatwoot_production.dump" >/dev/null

sudo tar -C /home/chatwoot/chatwoot -czf "$BACKUP_DIR/storage.tar.gz" storage
sudo cp /home/chatwoot/chatwoot/.env "$BACKUP_DIR/chatwoot.env"
sudo chmod 600 "$BACKUP_DIR/chatwoot.env"

sudo pg_restore -l "$BACKUP_DIR/chatwoot_production.dump" >/dev/null
sudo tar -tzf "$BACKUP_DIR/storage.tar.gz" >/dev/null

sudo bash -lc "cd '$BACKUP_DIR' && sha256sum chatwoot_production.dump storage.tar.gz chatwoot.env > SHA256SUMS"
sudo du -sh "$BACKUP_DIR"
```

Важно: если dump делает пользователь `postgres`, а папка закрыта под `root`, то
`pg_dump -f "$BACKUP_DIR/file.dump"` может получить `Permission denied`.
Надежнее писать через pipe в `sudo tee`.

## Что Пошло Не По Happy Path

### Принятое Решение Для Следующих Chatwoot Upgrade

Chatwoot upgrade выполнять как отдельное maintenance window, а не как live
операцию рядом с работающим web/worker.

Причина: `assets:precompile` и Vite build могут надолго занять CPU/RAM. На
маленькой VM это уже приводило к swap pressure и timeout'ам публичного API.
Во время upgrade `v4.13.0` -> `v4.15.1` live build на старом размере VM был
остановлен, после чего VM временно увеличили и повторили upgrade в
maintenance window.

Принятый production-подход:

- перед upgrade делать проверенный backup Chatwoot DB, storage и `.env`;
- заранее временно увеличить VM resources, если текущий размер может не
  выдержать asset build;
- на время build/migrations остановить только Chatwoot `web` и `worker`;
- Postgres, Redis и Nginx оставлять поднятыми, если нет отдельной причины их
  останавливать;
- после build/migrations обновить systemd units, запустить Chatwoot и
  проверить `/api`, dashboard assets, portal health и tenant Chatwoot verify;
- уменьшать VM обратно только отдельным шагом после стабильного post-upgrade
  наблюдения.

### 1. `cwctl --upgrade` Не Обновил Код

Команда:

```bash
sudo cwctl --upgrade
```

стартовала нормально:

- `cwctl v3.5.0`;
- target version `v4.13.0`;
- Redis уже был `>= 7`;
- Node уже был `>= 24`;
- pnpm уже был установлен.

Но внутри `cwctl` выполняет:

```bash
git checkout master && git pull
```

На production repo была divergence:

```text
Your branch and 'origin/master' have diverged,
and have 1 and 86 different commits each, respectively.
fatal: Need to specify how to reconcile divergent branches.
```

Причина: в production Chatwoot был локальный custom commit:

```text
72660f70e fix(widget): preserve spacing after removing branding footer
```

Он менял:

```text
app/javascript/widget/components/layouts/ViewWithHeader.vue
```

Из-за этого `cwctl` не подтянул `v4.13.0`, но продолжил bundle/assets/migrate
на старом коде `v4.12.1`. После такого обязательно проверить:

```bash
curl -fsS https://app.lancora.ru/api
sudo -u chatwoot bash -lc '
  cd /home/chatwoot/chatwoot
  git describe --tags --always --dirty
'
```

### 2. Custom Patch Нужно Переносить Явно

Рабочий путь:

```bash
sudo -u chatwoot bash -lc '
  cd /home/chatwoot/chatwoot
  git branch backup/prod-v4.12.1-before-v4.13.0-20260507 72660f70e || true
  git switch -c production/v4.13.0-20260507 origin/master
'
```

`git cherry-pick 72660f70e` сначала остановился из-за отсутствующего git identity
у пользователя `chatwoot`:

```text
Committer identity unknown
fatal: empty ident name ... not allowed
```

Исправление локально в repo:

```bash
sudo -u chatwoot bash -lc '
  cd /home/chatwoot/chatwoot
  git config user.name "Provgroup Production Maintenance"
  git config user.email "ops@provgroup.local"
  git cherry-pick --continue
'
```

Итог:

```text
production/v4.13.0-20260507
94ef40b3e fix(widget): preserve spacing after removing branding footer
88ffa329e v4.13.0
```

### 3. Assets Build На Маленькой VM Очень Тяжелый

Production build Chatwoot `v4.13.0` занял примерно `17m 21s`.

Во время Vite build:

- RAM почти уперлась в потолок;
- swap начал активно использоваться;
- вывод долго молчал;
- процесс был живой, но медленный.

Проверка, что сборка не умерла:

```bash
ps -eo pid,etime,pcpu,pmem,rss,stat,cmd \
  | grep -E 'vite|node|rake|rails|assets|pnpm' \
  | grep -v grep

free -h
vmstat 1 3
```

Чтобы сборка дошла до конца, во время maintenance window были остановлены только
Chatwoot web/worker:

```bash
sudo systemctl stop chatwoot.target \
  || sudo systemctl stop chatwoot-web.1.service chatwoot-worker.1.service
```

Postgres, Redis и Nginx не останавливались.

После этого сборка завершилась, и миграции прошли успешно.

## Manual Upgrade Commands

После переноса custom patch ручная часть upgrade:

```bash
sudo -i -u chatwoot bash -lc '
  set -e
  cd chatwoot
  rvm use $(cat .ruby-version) --default
  bundle
  pnpm i
  rake assets:precompile RAILS_ENV=production NODE_OPTIONS="--max-old-space-size=4096 --openssl-legacy-provider"
  RAILS_ENV=production POSTGRES_STATEMENT_TIMEOUT=600s bundle exec rails db:chatwoot_prepare
'
```

Затем обновить systemd files из нового кода и поднять сервисы:

```bash
sudo cp /home/chatwoot/chatwoot/deployment/chatwoot-web.1.service /etc/systemd/system/chatwoot-web.1.service
sudo cp /home/chatwoot/chatwoot/deployment/chatwoot-worker.1.service /etc/systemd/system/chatwoot-worker.1.service
sudo cp /home/chatwoot/chatwoot/deployment/chatwoot.target /etc/systemd/system/chatwoot.target
sudo cp /home/chatwoot/chatwoot/deployment/chatwoot /etc/sudoers.d/chatwoot

sudo systemctl daemon-reload
sudo systemctl reset-failed chatwoot-web.1.service chatwoot-worker.1.service chatwoot.target || true
sudo systemctl start chatwoot.target
```

## Миграции, Которые Важно Увидеть

В успешном выводе были:

```text
AddSecretToAgentBots
AddSecretToChannelApi
BackfillAgentBotAndChannelApiSecrets
CreateCalls
EnableAssignmentV2ForNewAccounts
AddEditedToCaptainAssistantResponses
AddSyncColumnsToCaptainDocuments
BackfillEditedOnCaptainAssistantResponses
```

Для portal compatibility особенно важны первые три.

## Post-Upgrade Checks

Проверить публичный health:

```bash
curl -fsS https://app.lancora.ru/api
```

Ожидаемый результат:

```json
{ "version": "4.13.0", "queue_services": "ok", "data_services": "ok" }
```

Проверить сервисы:

```bash
systemctl is-active chatwoot-web.1.service chatwoot-worker.1.service redis-server postgresql nginx
systemctl --no-pager --failed
```

Проверить git:

```bash
sudo -u chatwoot bash -lc '
  cd /home/chatwoot/chatwoot
  git branch --show-current
  git rev-parse --short HEAD
  git describe --tags --always --dirty
  git status --short
'
```

Фактический итог:

```text
branch: production/v4.13.0-20260507
head: 94ef40b3e
describe: v4.13.0-1-g94ef40b3e
status: clean
```

Проверить отсутствие pending migrations:

```bash
sudo -i -u chatwoot bash -lc '
  cd chatwoot
  RAILS_ENV=production bundle exec rails db:migrate:status | grep -E "^ *down" || true
'
```

Проверить webhook secrets:

```bash
sudo -i -u chatwoot bash -lc 'cd chatwoot && RAILS_ENV=production bundle exec rails runner -' <<'RUBY'
require 'json'
puts JSON.generate({
  version: Chatwoot.config[:version],
  channel_api_total: Channel::Api.count,
  channel_api_missing_secret: Channel::Api.where(secret: [nil, '']).count,
  agent_bot_total: AgentBot.count,
  agent_bot_missing_secret: AgentBot.where(secret: [nil, '']).count
})
RUBY
```

Фактический итог:

```json
{
  "version": "4.13.0",
  "channel_api_total": 1,
  "channel_api_missing_secret": 0,
  "agent_bot_total": 0,
  "agent_bot_missing_secret": 0
}
```

## Нюанс С `/api data_services: failing`

Сразу после restart `/api` временно показывал:

```json
{ "version": "4.13.0", "queue_services": "ok", "data_services": "failing" }
```

При этом Rails runner `SELECT 1` работал, сервисы были active, а DB была
доступна. После обращения к DB-backed endpoint и повторного `/api` статус стал:

```json
{ "version": "4.13.0", "queue_services": "ok", "data_services": "ok" }
```

Практический вывод: если после рестарта `/api` показывает `data_services:
failing`, не паниковать сразу. Проверить настоящую DB-доступность:

```bash
sudo -i -u chatwoot bash -lc 'cd chatwoot && RAILS_ENV=production bundle exec rails runner -' <<'RUBY'
puts ActiveRecord::Base.connection.active?
puts ActiveRecord::Base.connection.select_value('SELECT 1')
puts ActiveRecord::Base.connection.active?
RUBY
```

Затем дернуть обычный DB-backed endpoint или открыть dashboard и повторить
`/api`.

## Что Считать Готовым

Upgrade можно считать закрытым, если:

- backup создан и проверен;
- Chatwoot `/api` показывает `version: 4.13.0`;
- `queue_services: ok`;
- `data_services: ok`;
- `chatwoot-web.1` и `chatwoot-worker.1` active;
- `postgresql`, `redis-server`, `nginx` active;
- pending migrations нет;
- git status Chatwoot clean;
- `Channel::Api.where(secret: [nil, ""]).count == 0`;
- portal compatibility с `v4.13.0` уже проверена или запланирована сразу после.

## Рекомендации На Следующий Апгрейд

- Не полагаться только на `cwctl --upgrade`, если production repo содержит
  custom commits.
- Перед запуском всегда смотреть `git log origin/master..master`.
- Если есть custom commit, заранее решить: cherry-pick поверх нового release или
  удалить patch.
- На VM с `4 GB RAM` планировать долгую сборку assets и возможный stop
  web/worker на время build.
- Для следующего production upgrade рассмотреть временное увеличение RAM или
  swap до maintenance window.
- После Chatwoot upgrade сразу проверять portal webhook signature path, потому
  что с `v4.13.0` API Channel webhook secret стал отдельным source of truth.
