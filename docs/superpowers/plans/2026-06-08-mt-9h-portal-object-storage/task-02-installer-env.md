# Task 02: Production Installer And Env Defaults

## Цель

Сделать production installer responsible for object-storage secrets and env.
Operator installs one VM stack; B2B clients never choose or configure storage.

## Files

- Modify: `scripts/install-production.sh`
- Modify: `.env.production.example`

## Steps

- [x] **Step 1: Add env variables to `.env.production.example`**

Replace the current external-S3 wording with portal-owned defaults:

```dotenv
# Portal-owned branding asset object storage.
# Default production install runs internal MinIO on the Docker network.
PORTAL_OBJECT_STORAGE_IMAGE=quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z
PORTAL_OBJECT_STORAGE_MC_IMAGE=quay.io/minio/mc:RELEASE.2025-08-13T08-35-41Z
PORTAL_OBJECT_STORAGE_ROOT_USER=portal_v2_minio_root
PORTAL_OBJECT_STORAGE_ROOT_PASSWORD=generated-by-installer

BRANDING_ASSET_STORAGE_ENDPOINT=http://portal-object-storage:9000
BRANDING_ASSET_STORAGE_REGION=us-east-1
BRANDING_ASSET_STORAGE_BUCKET=portal-branding-assets
BRANDING_ASSET_STORAGE_ACCESS_KEY_ID=portal_v2_branding_assets
BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY=generated-by-installer
BRANDING_ASSET_STORAGE_FORCE_PATH_STYLE=true
```

The comments must say:

- these values are portal infrastructure;
- normal B2B clients do not provision buckets;
- external S3-compatible providers are not supported in this slice and need a
  separate operator-mode plan.

- [x] **Step 2: Add installer prompts and generated defaults**

In `scripts/install-production.sh`, inside `configure_env`, after `DATABASE_URL`
is built and before tenant secrets, add:

```bash
  PORTAL_OBJECT_STORAGE_IMAGE="quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z"
  PORTAL_OBJECT_STORAGE_MC_IMAGE="quay.io/minio/mc:RELEASE.2025-08-13T08-35-41Z"
  PORTAL_OBJECT_STORAGE_ROOT_USER="portal_v2_minio_root"

  local existing_storage_root_password
  existing_storage_root_password="$(env_value PORTAL_OBJECT_STORAGE_ROOT_PASSWORD)"
  existing_storage_root_password="${existing_storage_root_password:-$(random_hex 32)}"
  prompt_secret PORTAL_OBJECT_STORAGE_ROOT_PASSWORD "Portal object storage root password" "$existing_storage_root_password"

  BRANDING_ASSET_STORAGE_ENDPOINT="http://portal-object-storage:9000"
  BRANDING_ASSET_STORAGE_REGION="us-east-1"
  BRANDING_ASSET_STORAGE_BUCKET="portal-branding-assets"
  BRANDING_ASSET_STORAGE_ACCESS_KEY_ID="portal_v2_branding_assets"

  local existing_branding_storage_secret
  existing_branding_storage_secret="$(env_value BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY)"
  existing_branding_storage_secret="${existing_branding_storage_secret:-$(random_hex 32)}"
  prompt_secret BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY "Branding asset storage app secret key" "$existing_branding_storage_secret"

  BRANDING_ASSET_STORAGE_FORCE_PATH_STYLE="true"
```

Rationale:

- root credentials are for MinIO bootstrap/admin operations;
- `BRANDING_ASSET_STORAGE_*` credentials are app credentials used by backend;
- generated secrets are hex to avoid shell, URL and compose interpolation
  problems.
- endpoint, bucket, access key, region and path-style are fixed internal
  defaults for this slice; do not prompt for custom values.

- [x] **Step 3: Write object-storage values to `.env.production`**

In the env writer block, after `DATABASE_URL`, add:

```bash
    write_env_line PORTAL_OBJECT_STORAGE_IMAGE "$PORTAL_OBJECT_STORAGE_IMAGE"
    write_env_line PORTAL_OBJECT_STORAGE_MC_IMAGE "$PORTAL_OBJECT_STORAGE_MC_IMAGE"
    write_env_line PORTAL_OBJECT_STORAGE_ROOT_USER "$PORTAL_OBJECT_STORAGE_ROOT_USER"
    write_env_line PORTAL_OBJECT_STORAGE_ROOT_PASSWORD "$PORTAL_OBJECT_STORAGE_ROOT_PASSWORD"
    write_env_line BRANDING_ASSET_STORAGE_ENDPOINT "$BRANDING_ASSET_STORAGE_ENDPOINT"
    write_env_line BRANDING_ASSET_STORAGE_REGION "$BRANDING_ASSET_STORAGE_REGION"
    write_env_line BRANDING_ASSET_STORAGE_BUCKET "$BRANDING_ASSET_STORAGE_BUCKET"
    write_env_line BRANDING_ASSET_STORAGE_ACCESS_KEY_ID "$BRANDING_ASSET_STORAGE_ACCESS_KEY_ID"
    write_env_line BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY "$BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY"
    write_env_line BRANDING_ASSET_STORAGE_FORCE_PATH_STYLE "$BRANDING_ASSET_STORAGE_FORCE_PATH_STYLE"
```

- [x] **Step 4: Extend installer summary/log hints**

In `print_summary`, update the useful logs command:

```bash
  echo "  docker compose --env-file .env.production -f infra/production/compose.yaml logs -f portal-backend portal-web portal-object-storage"
```

Do not print secrets.

- [x] **Step 5: Static shell verification**

Run:

```bash
bash -n scripts/install-production.sh
rg 'PORTAL_OBJECT_STORAGE|BRANDING_ASSET_STORAGE' scripts/install-production.sh .env.production.example
```

Expected:

- `bash -n` exits `0`;
- all ten storage env names are present in both installer and production env
  example.

## Review Notes

- The installer must not prompt for storage endpoint, bucket, app access key,
  region or path-style in this slice.
- Image constants may stay in `.env.production` only for pinned image
  maintenance; they are not tenant/client configuration.
- The default must stay internal MinIO on `portal-internal`.
- Do not ask for any object-storage value in tenant onboarding UI.
