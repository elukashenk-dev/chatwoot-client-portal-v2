# Telegram Bridge Runbook

Status: operational source of truth for the self-hosted Telegram bridge.

The bridge replaces Yandex Cloud Functions for Telegram updates that need
group-chat support. Chatwoot remains the external system of record. The bridge
stores only tenant-owned bridge configuration and delivery dedupe state in the
portal database.

## Runtime Model

Normal setup path is the portal admin UI. CLI commands are an operator fallback
for emergency repair and automation only.

Telegram sends updates to:

```text
<tenant.publicBaseUrl>/telegram-bridge/<bridge-key>/<path-secret>
```

The public reverse proxy must route `/telegram-bridge/*` to the
`telegram-bridge` service. In the repository production stack this is done by
`infra/production/Caddyfile`; if the public host is outside that Caddyfile, add
the external host-proxy route described below.

## Environment

Set these values in `/opt/chatwoot-client-portal-v2/.env.production`.

Secrets:

- `DATABASE_URL`
- `PORTAL_TENANT_SECRET_KEY`

Public or operational values:

- `TELEGRAM_BRIDGE_PORT=3401`
- `TELEGRAM_BRIDGE_REQUEST_TIMEOUT_MS=10000`
- `TELEGRAM_BRIDGE_MAX_BODY_BYTES=1048576`
- `TELEGRAM_BRIDGE_PROCESSING_STALE_MS=600000`
- `TELEGRAM_BRIDGE_PHONE_PROMPT_TEXT=...`
- `TELEGRAM_BRIDGE_PHONE_NOT_FOUND_TEXT=...`
- `TELEGRAM_BRIDGE_PHONE_LINKED_TEXT=...`

Do not put tenant bot tokens, Chatwoot account ids, Chatwoot API tokens, or
Telegram inbox ids into production Compose env. Those values belong to encrypted
tenant bridge config created by the admin UI or CLI fallback.

## Bridge Release Boundary

Every bridge code release is part of the same three-service staged candidate as
`portal-backend` and `portal-web`. Use only the canonical `prepare` followed by
a separately approved `activate` procedure in
`docs/operations/production-deployment.md`; do not rebuild or activate
`telegram-bridge` independently. This holds even when the reviewed diff appears
limited to bridge files, because candidate provenance, image evidence, health,
tenant smoke and rollback cover the complete portal runtime.

Telegram webhook configuration remains a separate tenant operator operation.
It is not an activation flag and a release cannot use it to bypass the staged
process.

## Tenant Admin Setup

Example input:

```text
Chatwoot inbox URL: https://app.lancora.ru/app/accounts/1/settings/inboxes/17
Telegram bot token: 1234567890:AAExampleTokenForDocsOnly
```

Steps for the tenant admin:

1. Open Chatwoot.
2. Go to `Источники`.
3. Click `Добавить источник`.
4. Choose `Telegram`.
5. Paste the Telegram bot token into `Токен авторизации`.
6. Click `Создать канал Телеграмм`.
7. Open the created Chatwoot Telegram inbox settings page.
8. Copy the browser URL, for example
   `https://app.lancora.ru/app/accounts/1/settings/inboxes/17`.
9. Open the portal admin page `/admin/integrations/telegram-bridge`.
10. Paste the Chatwoot inbox URL and Telegram bot token.
11. Click `Создать Telegram bridge`.
12. Verify the page shows `Telegram bridge работает`.
13. Send one private Telegram smoke message.
14. Send one Telegram group smoke message.

If Chatwoot inbox settings are edited later, Chatwoot may call Telegram
`setWebhook` again and point the bot back to Chatwoot's native
`/webhooks/telegram/:token` endpoint. After editing the second Telegram inbox in
Chatwoot, re-open `/admin/integrations/telegram-bridge` and run setup again.
Always verify that the first bot webhook remains untouched.

## Webhook Owner Preflight

Before mutation, the admin UI records current safe Telegram webhook metadata.

Allowed current owners:

- `empty`
- `chatwoot-native`
- this `telegram-bridge`

Rejected in admin UI:

- `unknown`

Unknown-owner override is allowed only through CLI fallback after the operator
records previous webhook info and confirms the owner is safe to replace.

## CLI Fallback

Run commands from the production app path:

```bash
cd /opt/chatwoot-client-portal-v2
```

Create one new tenant-owned bridge config with a token file. This CLI fallback
is create-only: it rejects existing non-archived bot/config conflicts. For
normal reconfiguration, use the portal admin UI; for bot replacement, create a
new bridge or use a dedicated reviewed rotation flow.

```bash
pnpm --dir backend telegram-bridge:config:create \
  --tenant=<tenant-slug> \
  --bridge-key=<public-key> \
  --display-name=<label> \
  --chatwoot-telegram-inbox-id=<id> \
  --telegram-bot-token-file=/secure/path/to/bot-token
```

Alternative without putting the token in shell history:

```bash
pnpm --dir backend telegram-bridge:config:create \
  --tenant=<tenant-slug> \
  --bridge-key=<public-key> \
  --display-name=<label> \
  --chatwoot-telegram-inbox-id=<id> \
  --telegram-bot-token-stdin
```

Configure Telegram webhook for an existing bridge:

```bash
pnpm --dir backend telegram-bridge:webhook:configure --bridge-key=<public-key>
```

Verify current Telegram webhook for an existing bridge:

```bash
pnpm --dir backend telegram-bridge:webhook:info --bridge-key=<public-key>
```

Verify current Telegram webhook before a bridge config exists:

```bash
pnpm --dir backend telegram-bridge:webhook:info \
  --telegram-bot-token-file=/secure/path/to/bot-token \
  --public-base-url=https://tenant.example.com
```

## Public Proxy

### Repo Caddy Host

If the tenant `publicBaseUrl` host is served by this repo's production
Caddyfile, no host Nginx change is required. Verify that host reaches the
bridge:

```bash
curl -fsS "<tenant.publicBaseUrl>/telegram-bridge/health"
```

Expected response:

```json
{ "status": "ok" }
```

### External Chatwoot Host

If a tenant uses a public host owned by host Nginx outside this repo's
Caddyfile, for example `tenant.publicBaseUrl=https://app.lancora.ru`, add the
same `/telegram-bridge/` proxy route on that host. Current known production
Nginx site from `docs/operations/production-server-notes.md`:

```text
/etc/nginx/sites-enabled/nginx_chatwoot_app_lancora.conf
```

Before editing, verify that this file owns `server_name app.lancora.ru`:

```bash
sudo nginx -T | grep -nE "nginx_chatwoot_app_lancora|server_name app\\.lancora\\.ru|telegram-bridge"
```

Back up the file:

```bash
sudo cp /etc/nginx/sites-enabled/nginx_chatwoot_app_lancora.conf \
  /home/ubuntu/nginx_chatwoot_app_lancora.conf.before-telegram-bridge.$(date +%Y%m%d%H%M%S)
```

Add a `location /telegram-bridge/` block before the generic Chatwoot proxy
location. It should proxy to the portal Caddy host bind, not directly to
Chatwoot. Use the actual `PORTAL_HTTP_PORT` from `.env.production`.

```nginx
location /telegram-bridge/ {
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_pass http://127.0.0.1:<PORTAL_HTTP_PORT>;
}
```

Reload:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Verify before `setWebhook`:

```bash
curl -fsS https://app.lancora.ru/telegram-bridge/health
```

Expected response:

```json
{ "status": "ok" }
```

Rollback external host proxy:

1. Restore the backed-up Nginx file.
2. Run `sudo nginx -t && sudo systemctl reload nginx`.
3. Verify `https://app.lancora.ru/api` still returns Chatwoot health.

## Smoke Cases

Run after setup or webhook repair:

- Private unknown user gets the phone prompt.
- Foreign contact card is rejected.
- Known phone links the Telegram user to the Chatwoot contact.
- Duplicate phone inside the same tenant is rejected as ambiguous.
- Same phone in another tenant does not link the current bridge user.
- Known linked private user forwards a message to Chatwoot.
- Group message appears in Chatwoot with an author prefix.
- Chatwoot reply reaches the Telegram group.
- Duplicate Telegram update is not forwarded twice.

## Rollback

Before cutover, record previous webhook info:

```bash
pnpm --dir backend telegram-bridge:webhook:info \
  --telegram-bot-token-file=/secure/path/to/bot-token \
  --public-base-url=https://tenant.example.com
```

Rollback steps:

1. Restore the previous Telegram webhook URL with Telegram `setWebhook`.
2. Stop the `telegram-bridge` service:

```bash
docker compose --env-file .env.production -f infra/production/compose.yaml stop telegram-bridge
```

3. Verify the Chatwoot private direct path or previous function path according
   to the recorded webhook URL.
4. If an external host Nginx route was added only for the bridge, remove it and
   reload Nginx.
