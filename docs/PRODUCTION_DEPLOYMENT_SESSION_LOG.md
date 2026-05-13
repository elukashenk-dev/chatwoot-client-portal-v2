# Production Server Notes

Этот файл хранит только устойчивые факты о production VM и ограничения для
безопасного развертывания `chatwoot-client-portal-v2`.

Актуальный executable runbook:

```text
docs/MT_10_PRODUCTION_CLEAN_REINSTALL_RUNBOOK.md
```

## Текущее Production Окружение

- Есть Yandex Cloud VM с уже работающим production Chatwoot.
- Chatwoot используется реальными production users.
- Chatwoot core, база Chatwoot и application files Chatwoot не должны
  изменяться в рамках работы над portal v2.
- Portal deploy должен использовать isolated portal database и tenant-aware
  runtime config.

## Домены

Основной сайт:

```text
provgroup.ru
```

Production Chatwoot:

```text
chat.provgroup.ru
www.chat.provgroup.ru
```

Production portal:

```text
lk.provgroup.ru
```

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
```

Chatwoot Nginx config использует:

```text
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
- generated logs and deployment artifacts.

Production cleanup must affect only portal-owned resources. Production Chatwoot,
its database, uploads, services, Nginx site and runtime artifacts must not be
removed or changed without a separate explicit Chatwoot maintenance plan.

Allowed `MT-10` Chatwoot-side change is limited to tenant API Channel setup:

- enable single-conversation mode if needed;
- set the portal webhook URL;
- store the returned `Channel::Api.secret` in portal DB.

## План Развертывания

Production rollout должен идти по `MT-10 Production Clean Reinstall Runbook`.

Коротко:

1. Проверить, что Chatwoot работает на `chat.provgroup.ru`.
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
