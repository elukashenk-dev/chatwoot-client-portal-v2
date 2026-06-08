# Task 01: Production Compose Object Storage

## Цель

Сделать object storage частью production portal stack: внутренний MinIO,
одноразовый init container, volume для данных и backend env wiring.

## Files

- Modify: `infra/production/compose.yaml`
- Create: `scripts/init-production-object-storage.sh`

## Steps

- [ ] **Step 1: Create the object-storage init script**

Create `scripts/init-production-object-storage.sh`:

```sh
#!/bin/sh
set -eu

: "${BRANDING_ASSET_STORAGE_ACCESS_KEY_ID:?set BRANDING_ASSET_STORAGE_ACCESS_KEY_ID}"
: "${BRANDING_ASSET_STORAGE_BUCKET:?set BRANDING_ASSET_STORAGE_BUCKET}"
: "${BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY:?set BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY}"
: "${PORTAL_OBJECT_STORAGE_ROOT_PASSWORD:?set PORTAL_OBJECT_STORAGE_ROOT_PASSWORD}"
: "${PORTAL_OBJECT_STORAGE_ROOT_USER:?set PORTAL_OBJECT_STORAGE_ROOT_USER}"

mc alias set portal \
  http://portal-object-storage:9000 \
  "${PORTAL_OBJECT_STORAGE_ROOT_USER}" \
  "${PORTAL_OBJECT_STORAGE_ROOT_PASSWORD}"

mc mb --ignore-existing "portal/${BRANDING_ASSET_STORAGE_BUCKET}"

if mc admin user info \
  portal \
  "${BRANDING_ASSET_STORAGE_ACCESS_KEY_ID}" >/dev/null 2>&1; then
  mc admin policy detach \
    portal \
    portal-branding-assets \
    --user "${BRANDING_ASSET_STORAGE_ACCESS_KEY_ID}" >/dev/null 2>&1 || true
  mc admin user remove \
    portal \
    "${BRANDING_ASSET_STORAGE_ACCESS_KEY_ID}"
fi

if mc admin policy info portal portal-branding-assets >/dev/null 2>&1; then
  mc admin policy remove portal portal-branding-assets
fi

cat >/tmp/portal-branding-assets-policy.json <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": ["arn:aws:s3:::${BRANDING_ASSET_STORAGE_BUCKET}"]
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": ["arn:aws:s3:::${BRANDING_ASSET_STORAGE_BUCKET}/*"]
    }
  ]
}
POLICY

mc admin policy create \
  portal \
  portal-branding-assets \
  /tmp/portal-branding-assets-policy.json

mc admin user add \
  portal \
  "${BRANDING_ASSET_STORAGE_ACCESS_KEY_ID}" \
  "${BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY}"

mc admin policy attach \
  portal \
  portal-branding-assets \
  --user "${BRANDING_ASSET_STORAGE_ACCESS_KEY_ID}"
```

Make it executable:

```bash
chmod +x scripts/init-production-object-storage.sh
```

Validate syntax:

```bash
sh -n scripts/init-production-object-storage.sh
```

Expected: exit `0`.

- [ ] **Step 2: Add the production object-storage service**

Add this service before `portal-backend`:

```yaml
portal-object-storage:
  image: ${PORTAL_OBJECT_STORAGE_IMAGE:-quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z}
  restart: unless-stopped
  command: server /data --console-address ":9001"
  environment:
    MINIO_ROOT_USER: ${PORTAL_OBJECT_STORAGE_ROOT_USER:?set PORTAL_OBJECT_STORAGE_ROOT_USER}
    MINIO_ROOT_PASSWORD: ${PORTAL_OBJECT_STORAGE_ROOT_PASSWORD:?set PORTAL_OBJECT_STORAGE_ROOT_PASSWORD}
  expose:
    - '9000'
  healthcheck:
    test: ['CMD', 'mc', 'ready', 'local']
    interval: 10s
    retries: 12
    start_period: 10s
    timeout: 5s
  networks:
    - portal-internal
  volumes:
    - portal-object-storage-data:/data
```

Rules:

- do not add `ports`;
- do not expose console `9001`;
- keep this service on `portal-internal` only.

- [ ] **Step 3: Add the bucket and app-user init service**

Add this service after `portal-object-storage`:

```yaml
portal-object-storage-init:
  image: ${PORTAL_OBJECT_STORAGE_MC_IMAGE:-quay.io/minio/mc:RELEASE.2025-08-13T08-35-41Z}
  depends_on:
    portal-object-storage:
      condition: service_healthy
  environment:
    BRANDING_ASSET_STORAGE_ACCESS_KEY_ID: ${BRANDING_ASSET_STORAGE_ACCESS_KEY_ID:?set BRANDING_ASSET_STORAGE_ACCESS_KEY_ID}
    BRANDING_ASSET_STORAGE_BUCKET: ${BRANDING_ASSET_STORAGE_BUCKET:?set BRANDING_ASSET_STORAGE_BUCKET}
    BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY: ${BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY:?set BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY}
    PORTAL_OBJECT_STORAGE_ROOT_PASSWORD: ${PORTAL_OBJECT_STORAGE_ROOT_PASSWORD:?set PORTAL_OBJECT_STORAGE_ROOT_PASSWORD}
    PORTAL_OBJECT_STORAGE_ROOT_USER: ${PORTAL_OBJECT_STORAGE_ROOT_USER:?set PORTAL_OBJECT_STORAGE_ROOT_USER}
  entrypoint:
    - /bin/sh
    - /usr/local/bin/init-production-object-storage.sh
  networks:
    - portal-internal
  restart: 'no'
  volumes:
    - ../../scripts/init-production-object-storage.sh:/usr/local/bin/init-production-object-storage.sh:ro
```

This service must be idempotent:

- bucket already exists -> success;
- policy is recreated from current bucket env on every init run;
- app user is recreated from current app secret env on every init run;
- policy attach can run repeatedly.
- this may briefly revoke the app user during production reconfigure, so
  object-storage init must run before backend starts.

- [ ] **Step 4: Wire backend dependencies and env**

Change `portal-backend.depends_on`:

```yaml
depends_on:
  portal-db:
    condition: service_healthy
  portal-object-storage-init:
    condition: service_completed_successfully
```

Add these to `portal-backend.environment`:

```yaml
BRANDING_ASSET_STORAGE_ACCESS_KEY_ID: ${BRANDING_ASSET_STORAGE_ACCESS_KEY_ID:?set BRANDING_ASSET_STORAGE_ACCESS_KEY_ID}
BRANDING_ASSET_STORAGE_BUCKET: ${BRANDING_ASSET_STORAGE_BUCKET:?set BRANDING_ASSET_STORAGE_BUCKET}
BRANDING_ASSET_STORAGE_ENDPOINT: ${BRANDING_ASSET_STORAGE_ENDPOINT:?set BRANDING_ASSET_STORAGE_ENDPOINT}
BRANDING_ASSET_STORAGE_FORCE_PATH_STYLE: ${BRANDING_ASSET_STORAGE_FORCE_PATH_STYLE:-true}
BRANDING_ASSET_STORAGE_REGION: ${BRANDING_ASSET_STORAGE_REGION:-us-east-1}
BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY: ${BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY:?set BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY}
```

Keep backend storage endpoint internal:

```text
BRANDING_ASSET_STORAGE_ENDPOINT=http://portal-object-storage:9000
```

- [ ] **Step 5: Add the production object-storage volume**

Add to the bottom `volumes` block:

```yaml
portal-object-storage-data:
```

- [ ] **Step 6: Validate compose config with a temporary env file**

Create `/tmp/portal-object-storage-compose.env` with safe dummy values:

```bash
cat >/tmp/portal-object-storage-compose.env <<'EOF'
PORTAL_DOMAIN=lk.example.test
APP_ORIGIN=https://lk.example.test
PORTAL_CADDY_SITE_ADDRESS=lk.example.test
PORTAL_V2_POSTGRES_DB=chatwoot_client_portal_v2
PORTAL_V2_POSTGRES_USER=portal_v2
PORTAL_V2_POSTGRES_PASSWORD=portal-v2-db-password
DATABASE_URL=postgresql://portal_v2:portal-v2-db-password@portal-db:5432/chatwoot_client_portal_v2
DEFAULT_TENANT_CHATWOOT_ACCOUNT_ID=1
DEFAULT_TENANT_CHATWOOT_API_ACCESS_TOKEN=chatwoot-token
DEFAULT_TENANT_CHATWOOT_BASE_URL=https://chat.example.test
DEFAULT_TENANT_CHATWOOT_PORTAL_INBOX_ID=1
DEFAULT_TENANT_CHATWOOT_WEBHOOK_SECRET=bootstrap-webhook-secret
DEFAULT_TENANT_DISPLAY_NAME=Example
DEFAULT_TENANT_PRIMARY_DOMAIN=lk.example.test
DEFAULT_TENANT_PUBLIC_BASE_URL=https://lk.example.test
DEFAULT_TENANT_SLUG=example
PORTAL_TENANT_SECRET_KEY=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa=
SESSION_SECRET=session-secret-with-at-least-thirty-two-characters
SMTP_FROM=noreply@example.test
SMTP_HOST=smtp.example.test
PORTAL_OBJECT_STORAGE_ROOT_USER=portal_v2_minio_root
PORTAL_OBJECT_STORAGE_ROOT_PASSWORD=11111111111111111111111111111111
BRANDING_ASSET_STORAGE_ENDPOINT=http://portal-object-storage:9000
BRANDING_ASSET_STORAGE_REGION=us-east-1
BRANDING_ASSET_STORAGE_BUCKET=portal-branding-assets
BRANDING_ASSET_STORAGE_ACCESS_KEY_ID=portal_v2_branding_assets
BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY=22222222222222222222222222222222
BRANDING_ASSET_STORAGE_FORCE_PATH_STYLE=true
EOF
```

Run:

```bash
docker compose --env-file /tmp/portal-object-storage-compose.env -f infra/production/compose.yaml config >/tmp/portal-object-storage-compose.yaml
rg 'portal-object-storage|portal-object-storage-init|BRANDING_ASSET_STORAGE_ENDPOINT|portal-object-storage-data' /tmp/portal-object-storage-compose.yaml
sh -n scripts/init-production-object-storage.sh
```

Expected:

- compose config exits `0`;
- rendered config contains both storage services;
- rendered backend env contains `BRANDING_ASSET_STORAGE_ENDPOINT`;
- rendered volumes contain `portal-object-storage-data`;
- rendered service does not contain published MinIO host ports.
- init script syntax check exits `0`.

- [ ] **Step 7: Smoke the production storage/init chain**

Run an isolated compose project with only storage and init:

```bash
docker compose \
  --project-name portal-object-storage-plan-smoke \
  --env-file /tmp/portal-object-storage-compose.env \
  -f infra/production/compose.yaml \
  up --abort-on-container-exit --exit-code-from portal-object-storage-init portal-object-storage-init

docker compose \
  --project-name portal-object-storage-plan-smoke \
  --env-file /tmp/portal-object-storage-compose.env \
  -f infra/production/compose.yaml \
  down -v --remove-orphans
```

Expected:

- `portal-object-storage` becomes healthy;
- `portal-object-storage-init` exits `0`;
- bind mount path for `scripts/init-production-object-storage.sh` works;
- bucket, policy and app user initialization completes against the pinned
  images.

## Review Notes

- The object-storage service is portal-owned, not Chatwoot-owned.
- The production bucket is shared by the portal deploy; tenant isolation is in
  portal DB and tenant-prefixed object keys.
- Do not change local `infra/object-storage/compose.yaml` in this task.
