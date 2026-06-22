# Production Server Notes

Этот файл хранит только устойчивые факты о production VM и ограничения для
безопасного развертывания `chatwoot-client-portal-v2`.

Актуальные executable runbooks:

```text
docs/operations/production-deployment.md
docs/operations/production-clean-reinstall.md
```

## Текущее Production Окружение

- Есть Yandex Cloud VM с уже работающим production Chatwoot.
- Chatwoot используется реальными production users.
- Chatwoot core, база Chatwoot и application files Chatwoot не должны
  изменяться в рамках работы над portal v2.
- Portal deploy должен использовать isolated portal database и tenant-aware
  runtime config.

## Домены

Основной product/landing domain:

```text
lancora.ru
```

Primary production Chatwoot admin:

```text
app.lancora.ru
```

Legacy Chatwoot domain kept as fallback and for existing tenant runtime until a
separate tenant runtime base URL migration is performed:

```text
chat.provgroup.ru
www.chat.provgroup.ru
```

Production portal:

```text
lk.provgroup.ru
```

Next customer portal domain:

```text
lk.pronalogi.pro
```

`lk.pronalogi.pro` already has host Nginx ingress and a Let’s Encrypt
certificate on the production VM. Until the `pronalogi` tenant is provisioned,
`/api/tenant` must return `TENANT_NOT_FOUND`.

Дополнительный DNS, который может указывать на ту же VM:

```text
portal.provgroup.ru
```

Текущая production convention для новых клиентов:

```text
lk.<client-domain>
```

## VM И Доступ

Известные VM данные:

```text
hostname: chatwoot-vm
ssh user: ubuntu
home: /home/ubuntu
public IPv4: 93.77.166.238
```

SSH из WSL был настроен через добавление local public key в:

```text
/home/ubuntu/.ssh/authorized_keys
```

Перед deploy нужно заново проверить актуальность SSH-доступа и IP.

## Existing Reverse Proxy

На VM работает host `nginx`.

Известная baseline-конфигурация:

```text
80/tcp  занят host nginx
443/tcp занят host nginx
```

Enabled Nginx sites:

```text
/etc/nginx/sites-enabled/default
/etc/nginx/sites-enabled/nginx_chatwoot.conf
/etc/nginx/sites-enabled/nginx_chatwoot_app_lancora.conf
/etc/nginx/sites-enabled/chatwoot-client-portal-pronalogi.conf
```

Chatwoot Nginx configs use:

```text
app.lancora.ru
chat.provgroup.ru
www.chat.provgroup.ru
```

Предпочтительный подход для portal deploy рядом с Chatwoot:

- не редактировать Chatwoot Nginx config без необходимости;
- держать отдельный Nginx site для `lk.provgroup.ru`;
- проксировать portal в отдельный local container port;
- сертификат для `lk.provgroup.ru` выпускать отдельно;
- не открывать portal backend/Postgres ports наружу.

## Portal App Path

Production portal app path:

```text
/opt/chatwoot-client-portal-v2
```

Portal-owned artifacts at this path may include:

- `.env.production`;
- `.install`;
- Docker compose state;
- portal Docker volumes;
- portal DB data;
- portal object-storage data;
- generated logs and deployment artifacts.

Production cleanup must affect only portal-owned resources. Production Chatwoot,
its database, uploads, services, Nginx site and runtime artifacts must not be
removed or changed without a separate explicit Chatwoot maintenance plan.

Allowed `MT-10` Chatwoot-side change is limited to tenant API Channel setup:

- enable single-conversation mode if needed;
- set the portal webhook URL;
- store the returned `Channel::Api.secret` in portal DB.

## Portal Object Storage

- Branding assets are stored in the portal-owned object-storage Docker volume,
  not in Chatwoot uploads and not in the frontend/backend image.
- Backups must include both `portal-db-data` and
  `portal-object-storage-data`.

## План Развертывания

Обычный feature deploy идет через `scripts/deploy-production-archive.sh` из
clean reviewed commit. Clean reinstall нужен только для пересоздания или
глубокой reconfigure portal-owned production stack.

Clean reinstall коротко:

1. Проверить, что Chatwoot работает на `app.lancora.ru` и legacy fallback
   `chat.provgroup.ru`.
2. Подготовить clean portal-owned runtime path.
3. Залить актуальный `v2`.
4. Запустить tenant-aware installer.
5. Поднять portal v2 на `lk.provgroup.ru`.
6. Проверить tenant bootstrap, Chatwoot account/inbox verification, API Channel
   webhook setup, auth, registration, chat, realtime and PWA identity.

## Что Не Хранить В Этом Файле

- secrets;
- passwords;
- Chatwoot API tokens;
- webhook secrets;
- SMTP passwords;
- длинные command logs;
- troubleshooting, который уже перенесен в актуальный runbook.
