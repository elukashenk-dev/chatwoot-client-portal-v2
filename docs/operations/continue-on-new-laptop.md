# Continue Project On A New Laptop

Этот файл - быстрый handoff для продолжения `chatwoot-client-portal-v2` на
другом ноутбуке. Он не заменяет runbook'и, а задает порядок входа в проект.

## Current Baseline

- Repository: `git@github.com:elukashenk-dev/chatwoot-client-portal-v2.git`
- Main branch: `main`
- Последний залитый baseline на момент создания файла:
  `55e263a34cd4072ba592a93ba6aa67fb28983ae6`
- Production portal: `https://lk.provgroup.ru`
- Production app path: `/opt/chatwoot-client-portal-v2`
- Production VM SSH target: `ubuntu@93.77.166.238`

Перед продолжением всегда перепроверить актуальность:

```bash
git fetch origin
git status --short --branch
git log --oneline --decorate -5
```

## Hard Boundaries

- Работать только в `chatwoot-client-portal-v2`.
- Chatwoot core, Chatwoot DB, uploads, services and `chat.provgroup.ru` Nginx
  config не трогать без отдельного explicit Chatwoot maintenance plan.
- Browser не получает direct Chatwoot authority.
- Portal backend остается authority для auth, session, send, realtime и
  branding assets.
- Production portal использует isolated portal Postgres и portal-owned object
  storage.
- Не коммитить `.env`, `.env.production`, secrets, local artifacts,
  `node_modules`, `dist`, `playwright-report`, `test-results`.

## Required Tools

На новом ноуте нужны:

- Git with SSH access to GitHub;
- Node.js `>=24 <25`;
- pnpm `10.33.0` через Corepack или standalone install;
- Docker Desktop / Docker Engine with Compose plugin;
- OpenSSL;
- optional: `psql`/`pg_isready` для локальной диагностики Postgres;
- optional: Playwright browsers для e2e/browser checks.

Проверка:

```bash
node --version
corepack --version
pnpm --version
docker version
docker compose version
git --version
```

Если pnpm не готов:

```bash
corepack enable
corepack prepare pnpm@10.33.0 --activate
```

## Clone And Install

```bash
mkdir -p ~/projects
cd ~/projects
git clone git@github.com:elukashenk-dev/chatwoot-client-portal-v2.git
cd chatwoot-client-portal-v2
pnpm install
```

Первым делом прочитать:

```text
AGENTS.md
docs/roadmap/work-log.md
docs/architecture/overview.md
docs/roadmap/implementation-plan.md
docs/architecture/decisions.md
```

## Local Environment

Подробный runbook:

```text
docs/operations/local-testing.md
```

Минимальный старт:

```bash
cp .env.example .env
```

В `.env` заменить placeholders:

- `SESSION_SECRET`;
- `PORTAL_TENANT_SECRET_KEY`;
- `DEFAULT_TENANT_CHATWOOT_API_ACCESS_TOKEN`;
- `DEFAULT_TENANT_CHATWOOT_ADMIN_VERIFICATION_TOKEN`, если нужен
  `/admin/login`;
- `DEFAULT_TENANT_CHATWOOT_WEBHOOK_SECRET`;
- `E2E_CHATWOOT_API_ACCESS_TOKEN`, если будут запускаться e2e against
  Chatwoot.

Не переносить secrets в docs и не коммитить `.env`.

Сгенерировать portal tenant key:

```bash
openssl rand -base64 32
```

Локальные portal services:

```bash
pnpm db:up
pnpm storage:up
```

Прогнать миграции:

```bash
set -a && source .env && set +a
pnpm --dir backend db:migrate
```

Если нужна чистая локальная portal DB, см. раздел `Пересоздать Чистую Portal
DB` в `docs/operations/local-testing.md`.

## External Local Services

Для полного локального сценария отдельно нужны:

- Chatwoot на `http://127.0.0.1:3000`;
- Mailpit UI на `http://127.0.0.1:8025`;
- Mailpit SMTP на `127.0.0.1:1025`.

Portal repository не управляет Chatwoot core. Если нужно разбираться с
Chatwoot behavior:

1. сначала смотреть официальную документацию Chatwoot;
2. если ответа нет - смотреть локальный `../chatwoot-ce-stable`.

## Run Locally

Terminal 1:

```bash
cd ~/projects/chatwoot-client-portal-v2
set -a && source .env && set +a
pnpm dev:backend
```

Terminal 2:

```bash
cd ~/projects/chatwoot-client-portal-v2
set -a && source .env && set +a
pnpm dev:web --host 0.0.0.0
```

Default local URLs depend on tenant setup. Common production-like hosts are:

```text
http://buhfirma.127.0.0.1.nip.io:5173
http://stroyfirma.127.0.0.1.nip.io:5173
http://zubi.127.0.0.1.nip.io:5173
```

If using only `.env.example` default tenant:

```text
http://127.0.0.1:5173
```

## Local Tenant Bootstrap

For multi-tenant local setup, follow:

```text
docs/operations/local-testing.md
```

Important commands:

```bash
pnpm --dir backend tenant:bootstrap-default
pnpm --dir backend tenant:chatwoot:ensure-portal-inbox -- --tenant=<slug>
pnpm --dir backend tenant:chatwoot:webhook:configure -- --tenant=<slug>
```

Admin branding login requires a separate Chatwoot admin Personal Access Token
stored in the portal tenant config as admin verification token. It must belong
to a confirmed Chatwoot administrator for that account.

## Checks Before Coding

Before starting a feature/fix:

```bash
git status --short --branch
git switch main
git pull --ff-only origin main
```

Use a separate branch per scope:

```bash
git switch -c fix/<area>-<short-slug>
# or
git switch -c feature/phase-<n>-<short-slug>
```

Do not mix unrelated cleanup with feature work.

## Standard Verification

For a normal code change:

```bash
pnpm lint
pnpm build
git diff --check
```

Run targeted tests first:

```bash
pnpm --dir frontend exec vitest run <test-files>
pnpm --dir backend test -- <test-filter-or-file>
```

Run broader suites when touching shared auth/session/runtime/provider/router,
database, tenant isolation, deployment scripts, or public contracts:

```bash
pnpm test
pnpm test:e2e
```

## Production Deploy

Detailed runbooks:

```text
docs/operations/production-deployment.md
docs/operations/production-server-notes.md
docs/operations/production-clean-reinstall.md
docs/operations/mt-10-deployment-runbooks.md
```

Routine deploy from clean reviewed `main`:

```bash
scripts/deploy-production-archive.sh \
  --host=ubuntu@93.77.166.238 \
  --app-path=/opt/chatwoot-client-portal-v2 \
  --activate
```

After deploy:

```bash
ssh ubuntu@93.77.166.238 \
  'cd /opt/chatwoot-client-portal-v2 && sed -n "1,12p" DEPLOY_SOURCE.txt && docker compose --env-file .env.production -f infra/production/compose.yaml ps'

curl -fsS https://lk.provgroup.ru/api/health
curl -fsS https://lk.provgroup.ru/api/tenant
```

Expected:

- `DEPLOY_SOURCE.txt` points to the intended clean commit;
- `portal-backend` is healthy;
- `portal-web` is running;
- `portal-db` and `portal-object-storage` are healthy;
- health returns `status: ok`;
- tenant returns `provgroup`.

## Current Production-Specific Notes

- Production deploy script already preserves `.env.production` and upgrades
  missing portal object-storage keys.
- Branding assets are stored in portal-owned object storage.
- Legal PDF/DOCX upload is part of admin branding controls.
- Auth startup surface uses `/startup-surface.js` to avoid a white flash under
  production CSP. Do not replace it with inline script unless CSP is updated
  deliberately.
- `AuthViewportDebugOverlay` was removed; do not reintroduce runtime debug UI
  unless it is scoped to a temporary branch.

## Useful Files

Project rules:

```text
AGENTS.md
```

Architecture:

```text
docs/architecture/overview.md
docs/architecture/decisions.md
docs/roadmap/implementation-plan.md
docs/roadmap/work-log.md
```

Operations:

```text
docs/operations/local-testing.md
docs/operations/production-deployment.md
docs/operations/production-server-notes.md
docs/operations/mt-10-deployment-runbooks.md
```

Open findings registry:

```text
docs/findings/
```

## Before Leaving The New Laptop Setup

Confirm:

```bash
git status --short --branch
pnpm lint
pnpm build
curl -fsS http://127.0.0.1:3301/api/health
```

If production access is configured, also confirm:

```bash
ssh ubuntu@93.77.166.238 'hostname && date'
curl -fsS https://lk.provgroup.ru/api/health
```

If any command requires secrets or production access, do not paste secrets into
chat or docs. Keep them in local `.env`, SSH agent, password manager, or the
production VM environment only.
