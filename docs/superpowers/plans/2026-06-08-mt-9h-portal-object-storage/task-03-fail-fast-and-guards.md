# Task 03: Fail Fast And Code-Health Guards

## Цель

Не допустить повторения текущей ошибки: production backend не должен тихо
стартовать без branding storage, а future compose edits не должны случайно
удалить object-storage wiring.

## Files

- Modify: `backend/src/config/env.ts`
- Modify: `backend/src/config/env.test.ts`
- Modify: `scripts/check-code-health.mjs`
- Test: `scripts/init-production-object-storage.sh`

## Steps

- [x] **Step 1: Add failing env test for production storage**

In `backend/src/config/env.test.ts`, after
`it('leaves branding asset storage unavailable by default', ...)`, add:

```ts
it('requires branding asset storage in production', () => {
  expect(() =>
    loadEnv({
      ...baseRawEnv,
      NODE_ENV: 'production',
    }),
  ).toThrow(/BRANDING_ASSET_STORAGE_ENDPOINT/)
})
```

Add companion regression tests:

```ts
it('accepts complete branding asset storage configuration in production', () => {
  const env = loadEnv({
    ...baseRawEnv,
    NODE_ENV: 'production',
    BRANDING_ASSET_STORAGE_ACCESS_KEY_ID: 'portal-minio',
    BRANDING_ASSET_STORAGE_BUCKET: 'portal-branding-assets',
    BRANDING_ASSET_STORAGE_ENDPOINT: 'http://portal-object-storage:9000',
    BRANDING_ASSET_STORAGE_FORCE_PATH_STYLE: 'true',
    BRANDING_ASSET_STORAGE_REGION: 'us-east-1',
    BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY: 'portal-minio-secret',
  })

  expect(env.BRANDING_ASSET_STORAGE_ENDPOINT).toBe(
    'http://portal-object-storage:9000',
  )
})

it('continues allowing disabled branding asset storage outside production', () => {
  const env = loadEnv({
    ...baseRawEnv,
    NODE_ENV: 'test',
  })

  expect(env.BRANDING_ASSET_STORAGE_ENDPOINT).toBeUndefined()
})
```

Run:

```bash
pnpm --dir backend exec vitest run src/config/env.test.ts --reporter verbose
```

Expected before implementation:

- the new test fails because production currently allows disabled storage.

- [x] **Step 2: Require complete branding storage config in production**

In `backend/src/config/env.ts`, inside the existing `superRefine`, after
`const hasBrandingStorageConfig = ...`, change the branding-storage validation
to require the complete field set when `NODE_ENV=production`:

```ts
const requiresBrandingStorageConfig =
  env.NODE_ENV === 'production' || hasBrandingStorageConfig

if (requiresBrandingStorageConfig) {
  for (const field of brandingStorageFields) {
    if (!env[field]) {
      context.addIssue({
        code: 'custom',
        message: `${field} is required when branding asset storage is configured`,
        path: [field],
      })
    }
  }
}
```

Keep test/local behavior:

- non-production with no storage env is still allowed;
- partial storage env is still rejected;
- complete storage env is accepted.

- [x] **Step 3: Run env tests**

Run:

```bash
pnpm --dir backend exec vitest run src/config/env.test.ts --reporter verbose
```

Expected:

- all env tests pass.

- [x] **Step 4: Add code-health production storage guard**

In `scripts/check-code-health.mjs`, add this function before `main()`:

```js
async function checkProductionObjectStorageConfig(failures) {
  const composePath = 'infra/production/compose.yaml'
  const envExamplePath = '.env.production.example'
  const compose = await readFile(path.join(repoRoot, composePath), 'utf8')
  const envExample = await readFile(path.join(repoRoot, envExamplePath), 'utf8')
  const requiredComposeSnippets = [
    'portal-object-storage:',
    'portal-object-storage-init:',
    'portal-object-storage-data:',
    '../../scripts/init-production-object-storage.sh:/usr/local/bin/init-production-object-storage.sh:ro',
    'BRANDING_ASSET_STORAGE_ACCESS_KEY_ID:',
    'BRANDING_ASSET_STORAGE_BUCKET:',
    'BRANDING_ASSET_STORAGE_ENDPOINT:',
    'BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY:',
    'condition: service_completed_successfully',
    'portal-internal',
  ]
  const requiredEnvNames = [
    'PORTAL_OBJECT_STORAGE_IMAGE',
    'PORTAL_OBJECT_STORAGE_MC_IMAGE',
    'PORTAL_OBJECT_STORAGE_ROOT_USER',
    'PORTAL_OBJECT_STORAGE_ROOT_PASSWORD',
    'BRANDING_ASSET_STORAGE_ENDPOINT',
    'BRANDING_ASSET_STORAGE_REGION',
    'BRANDING_ASSET_STORAGE_BUCKET',
    'BRANDING_ASSET_STORAGE_ACCESS_KEY_ID',
    'BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY',
    'BRANDING_ASSET_STORAGE_FORCE_PATH_STYLE',
  ]

  for (const snippet of requiredComposeSnippets) {
    if (!compose.includes(snippet)) {
      failures.push({
        relativePath: composePath,
        message: `missing production object-storage wiring: ${snippet}`,
      })
    }
  }

  for (const envName of requiredEnvNames) {
    if (!envExample.includes(`${envName}=`)) {
      failures.push({
        relativePath: envExamplePath,
        message: `missing production object-storage env example: ${envName}`,
      })
    }
  }

  const initScriptPath = 'scripts/init-production-object-storage.sh'
  const initScript = await readFile(path.join(repoRoot, initScriptPath), 'utf8')
  const requiredInitSnippets = [
    'mc mb --ignore-existing',
    'mc admin policy create',
    'mc admin user add',
    'mc admin policy attach',
    's3:GetObject',
    's3:PutObject',
    's3:DeleteObject',
    'mc admin policy remove',
    'mc admin user remove',
  ]

  for (const snippet of requiredInitSnippets) {
    if (!initScript.includes(snippet)) {
      failures.push({
        relativePath: initScriptPath,
        message: `missing production object-storage init behavior: ${snippet}`,
      })
    }
  }

  const minioServiceBlock = compose.split('portal-object-storage:')[1] ?? ''
  const minioBlockBeforeInit =
    minioServiceBlock.split('portal-object-storage-init:')[0] ?? ''

  if (!minioBlockBeforeInit.includes('networks:')) {
    failures.push({
      relativePath: composePath,
      message: 'production object storage must declare explicit networks',
    })
  }

  if (!minioBlockBeforeInit.includes('- portal-internal')) {
    failures.push({
      relativePath: composePath,
      message: 'production object storage must be on portal-internal only',
    })
  }

  if (minioBlockBeforeInit.includes('ports:')) {
    failures.push({
      relativePath: composePath,
      message: 'production object storage must not publish host ports',
    })
  }

  const backendBlock = compose.split('portal-backend:')[1] ?? ''
  const backendBlockBeforeWeb = backendBlock.split('portal-web:')[0] ?? ''

  if (backendBlockBeforeWeb.includes('PORTAL_OBJECT_STORAGE_ROOT_PASSWORD')) {
    failures.push({
      relativePath: composePath,
      message: 'backend must not receive object-storage root password',
    })
  }

  if (!backendBlockBeforeWeb.includes('portal-object-storage-init:')) {
    failures.push({
      relativePath: composePath,
      message: 'backend must depend on object-storage init service',
    })
  }
}
```

Call it from `main()` after `checkRetiredWebhookScripts(failures)`:

```js
await checkProductionObjectStorageConfig(failures)
```

- [x] **Step 5: Run code-health**

Run:

```bash
pnpm code-health
```

Expected:

- pass after Task 01 and Task 02 are implemented;
- fail if production compose is missing storage services/env wiring;
- fail if production storage service publishes host ports.
- fail if production storage service is not explicitly scoped to
  `portal-internal`;
- fail if the init script stops creating the bucket, app user or bucket-scoped
  policy.
- fail if backend receives MinIO root credentials.

## Review Notes

- Production fail-fast is intentional. Branding upload is a production feature,
  so a production backend without storage is misconfigured.
- Test/local can still leave storage disabled for unit tests that inject a fake
  storage adapter.
- The code-health guard is a drift detector, not a full YAML parser.
