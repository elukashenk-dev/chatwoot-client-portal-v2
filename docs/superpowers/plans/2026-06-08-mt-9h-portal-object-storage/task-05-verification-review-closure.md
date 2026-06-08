# Task 05: Verification, Review And Closure

## Цель

Закрыть portal-object-storage slice только после targeted checks, review,
фикса findings и checkpoint commit. После этого общий `MT-9H final branding
QA/docs/deploy readiness` остается открытым до полного финального прогона.

## Targeted Checks

Run after Tasks 01-04:

```bash
pnpm --dir backend exec vitest run src/config/env.test.ts src/integrations/object-storage/brandingStorage.test.ts src/modules/branding/assetService.test.ts src/app-branding.integration.test.ts --reporter verbose
pnpm code-health
bash -n scripts/install-production.sh scripts/install-maintenance-cleanup-timer.sh
sh -n scripts/init-production-object-storage.sh
docker compose --env-file /tmp/portal-object-storage-compose.env -f infra/production/compose.yaml config >/tmp/portal-object-storage-compose.yaml
rg 'portal-object-storage|portal-object-storage-init|BRANDING_ASSET_STORAGE_ENDPOINT|portal-object-storage-data' /tmp/portal-object-storage-compose.yaml
pnpm exec prettier --check infra/production/compose.yaml .env.production.example scripts/install-production.sh scripts/init-production-object-storage.sh scripts/check-code-health.mjs docs/architecture/overview.md docs/architecture/decisions.md docs/operations/production-deployment.md docs/operations/production-clean-reinstall.md docs/operations/production-server-notes.md docs/roadmap/implementation-plan.md docs/roadmap/work-log.md
git diff --check
```

Expected:

- backend targeted tests pass;
- code-health passes and includes production object-storage guard;
- compose config renders successfully;
- rendered config contains storage services, backend env and storage volume;
- bash syntax checks pass;
- Prettier check passes;
- `git diff --check` passes.

## Runtime Smoke

If local backend/frontend are running:

1. Ensure local storage is available:

```bash
pnpm storage:up
```

2. Open:

```text
http://buhfirma.127.0.0.1.nip.io:5173/admin/branding
```

3. Upload a small PNG logo.
4. Confirm network:

```text
POST /api/admin/branding/assets/logo => 200
```

5. Confirm response includes:

```json
{
  "asset": {
    "contentType": "image/png",
    "kind": "logo",
    "publicUrl": "/api/branding/assets/<id>?v=<version>"
  }
}
```

6. Confirm public readback:

```bash
curl -D /tmp/branding-asset-headers.txt \
  -o /tmp/branding-asset-readback.png \
  -H 'Host: buhfirma.127.0.0.1.nip.io:5173' \
  'http://127.0.0.1:3301/api/branding/assets/<id>?v=<version>'
```

Expected:

- `HTTP/1.1 200 OK`;
- `content-type: image/png`;
- returned file is a PNG.

7. Delete the test logo from the admin UI so local branding data is clean.

If the runtime smoke cannot run because local auth or services are unavailable,
write the blocker in the final response and keep final production deploy
readiness open.

## Independent Review

Ask a reviewer to inspect:

- production storage is internal and not publicly exposed;
- backend receives app credentials, not root credentials;
- production backend fails fast without storage env;
- installer writes all required env values;
- compose init is idempotent;
- docs match `docs/product/b2b-product-goal.md`;
- no Chatwoot core/storage changes are introduced;
- `MT-9H` remains open for final QA/deploy readiness.

Fix Critical/Important findings before closure. If a finding is deferred by
the user, create a file in `docs/findings/` according to the Findings Workflow.

## Checkpoint Commit

After implementation, checks, review and fixes:

```bash
git status --short --branch
git add infra/production/compose.yaml .env.production.example scripts/install-production.sh scripts/init-production-object-storage.sh scripts/check-code-health.mjs backend/src/config/env.ts backend/src/config/env.test.ts docs/architecture/overview.md docs/architecture/decisions.md docs/operations/production-deployment.md docs/operations/production-clean-reinstall.md docs/operations/production-server-notes.md docs/roadmap/implementation-plan.md docs/roadmap/work-log.md docs/superpowers/plans/2026-06-08-mt-9h-portal-object-storage/
git commit -m "fix: package branding object storage for production"
```

Do not push remote until branding is fully closed and the user approves.

## Closure Summary Required

Final response should include:

- branch;
- changed files;
- tests/checks run and result;
- runtime smoke result or blocker;
- review result;
- whether work-log changed;
- commit hash if checkpoint commit was created.
