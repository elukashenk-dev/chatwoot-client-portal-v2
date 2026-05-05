# Local Multi-Tenant PWA Testing

Короткий manual smoke guide для `MT-8 Tenant-Aware Frontend/PWA`.

Цель проверки:

- два local hostnames резолвятся в разные tenants;
- `/api/tenant` показывает разную public identity;
- `/api/tenant/manifest.webmanifest` отличается по Host;
- `/api/tenant/apple-touch-icon.png` проходит через tenant-aware endpoint;
- service worker не кеширует tenant dynamic metadata как static shell asset.

## 1. Подготовить local hostnames

Рекомендуемые hostnames через `nip.io`:

```text
buhfirma.127.0.0.1.nip.io
zubi.127.0.0.1.nip.io
```

Они оба указывают на `127.0.0.1`, но для browser/backend выглядят как разные
tenant hosts.

## 2. Создать два tenants локально

Сервисами управляет пользователь. Перед этим локальные Postgres/backend env
должны быть настроены как обычно.

Скрипт `tenant:bootstrap-default` можно запускать с разными
`DEFAULT_TENANT_*` значениями: он upsert-ит tenant по slug.

Пример для первого tenant:

```bash
DEFAULT_TENANT_SLUG=buhfirma \
DEFAULT_TENANT_DISPLAY_NAME="Бухфирма" \
DEFAULT_TENANT_PRIMARY_DOMAIN=buhfirma.127.0.0.1.nip.io \
DEFAULT_TENANT_PUBLIC_BASE_URL=http://buhfirma.127.0.0.1.nip.io:5173 \
pnpm --dir backend tenant:bootstrap-default
```

Пример для второго tenant:

```bash
DEFAULT_TENANT_SLUG=zubi \
DEFAULT_TENANT_DISPLAY_NAME="Зуби" \
DEFAULT_TENANT_PRIMARY_DOMAIN=zubi.127.0.0.1.nip.io \
DEFAULT_TENANT_PUBLIC_BASE_URL=http://zubi.127.0.0.1.nip.io:5173 \
pnpm --dir backend tenant:bootstrap-default
```

Остальные обязательные значения берутся из `.env`:

- `PORTAL_TENANT_SECRET_KEY`;
- `DEFAULT_TENANT_CHATWOOT_BASE_URL`;
- `DEFAULT_TENANT_CHATWOOT_ACCOUNT_ID`;
- `DEFAULT_TENANT_CHATWOOT_PORTAL_INBOX_ID`;
- `DEFAULT_TENANT_CHATWOOT_API_ACCESS_TOKEN`;
- `DEFAULT_TENANT_CHATWOOT_WEBHOOK_SECRET`.

## 3. Запустить dev services

Команды запуска выполняет пользователь:

```bash
pnpm dev:backend
pnpm dev:web --host 0.0.0.0
```

`frontend/vite.config.ts` проксирует `/api` в backend и сохраняет original
Host, поэтому backend видит tenant hostname.
Dev server explicitly allows `*.127.0.0.1.nip.io` hosts for this local
multi-tenant smoke path.

## 4. Проверить public tenant context

Открыть:

```text
http://buhfirma.127.0.0.1.nip.io:5173/api/tenant
http://zubi.127.0.0.1.nip.io:5173/api/tenant
```

Ожидание:

- первый URL возвращает `slug = buhfirma`, `displayName = Бухфирма`;
- второй URL возвращает `slug = zubi`, `displayName = Зуби`.

## 5. Проверить manifest

Открыть:

```text
http://buhfirma.127.0.0.1.nip.io:5173/api/tenant/manifest.webmanifest
http://zubi.127.0.0.1.nip.io:5173/api/tenant/manifest.webmanifest
```

Ожидание:

- `id` заканчивается на соответствующий tenant origin;
- `name` и `short_name` отличаются;
- icon URLs идут через `/api/tenant/icons/...`;
- response содержит `Cache-Control: no-store`.

## 6. Проверить iOS icon endpoint

Открыть:

```text
http://buhfirma.127.0.0.1.nip.io:5173/api/tenant/apple-touch-icon.png
http://zubi.127.0.0.1.nip.io:5173/api/tenant/apple-touch-icon.png
```

В `MT-8` endpoint может вернуть fallback icon, но сам URL уже
tenant-aware. В `MT-9` он сможет отдавать tenant-owned icon без смены HTML
contract.

## 7. Проверить installed PWA metadata вручную

Chrome/Android:

- открыть tenant host;
- проверить DevTools/Application/Manifest;
- установить PWA;
- убедиться, что app name/icon относятся к current tenant или fallback-safe.

Safari/iOS:

- открыть tenant host;
- Add to Home Screen;
- проверить Home Screen title/icon.

Важный нюанс: Android и iOS могут кешировать уже установленную icon/title
metadata. После смены branding иногда нужна переустановка PWA, поэтому
брендовые assets tenant лучше настроить до production rollout.
