# Production Server Notes

Этот файл больше не является session log-ом старого production dry run.

Здесь оставлены только исходные данные о реальном сервере и планы, которые
понадобятся для будущего безопасного развертывания `chatwoot-client-portal-v2`.

## Текущее Production Окружение

- Есть Yandex Cloud VM с уже работающим production Chatwoot.
- Chatwoot используется реальными production users.
- Chatwoot core, база Chatwoot и application files Chatwoot не должны
  изменяться в рамках работы над portal v2.
- Старый клиентский портал на сервере можно считать временным/retired runtime с
  тестовыми данными.
- Старый портал не использовать как source of truth для `v2`.

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

Целевой домен клиентского portal:

```text
lk.provgroup.ru
```

Дополнительный DNS, который уже указывал на ту же VM во время старого dry run:

```text
portal.provgroup.ru
```

Текущая production convention для новых клиентов:

```text
lk.<client-domain>
```

## VM И Доступ

Проверенные данные старого dry run:

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

Перед будущим deploy нужно заново проверить актуальность SSH-доступа и IP.

## Existing Reverse Proxy

На VM уже работал host `nginx`.

Во время dry run было проверено:

```text
80/tcp  занят host nginx
443/tcp занят host nginx
```

Enabled Nginx sites на тот момент:

```text
/etc/nginx/sites-enabled/default
/etc/nginx/sites-enabled/nginx_chatwoot.conf
```

Chatwoot Nginx config использовал:

```text
chat.provgroup.ru
www.chat.provgroup.ru
```

`lk.provgroup.ru` тогда не был занят в существующих Nginx configs.

Предпочтительный подход для будущего portal deploy рядом с Chatwoot:

- не редактировать Chatwoot Nginx config без необходимости;
- добавить отдельный Nginx site для `lk.provgroup.ru`;
- проксировать portal в отдельный local container port;
- сертификат для `lk.provgroup.ru` выпускать отдельно;
- не открывать portal backend/Postgres ports наружу.

## Предыдущий Portal App Path

Во время старого dry run портал распаковывался в:

```text
/opt/chatwoot-client-portal-v2
```

Там могли остаться:

- старый test runtime;
- `.env.production`;
- Docker compose state;
- portal Docker volumes;
- test portal DB.

Перед новым production rollout нужно решить:

- удалить старый test portal runtime;
- удалить все старое, что относится к прежнему клиентскому порталу: old portal
  app directory, old portal containers, old portal volumes, old portal DB,
  old portal env/state/log artifacts and old portal reverse-proxy site;
- сохранить backup перед удалением, если нужно;
- поднять новый `v2` только после актуализации `MT-10` production runbook,
  compose и installer под multi-tenant runtime.

Важно:

- это правило относится только к старому клиентскому порталу;
- production Chatwoot, его database, uploads, services, Nginx site и runtime
  artifacts не удалять и не менять без отдельного explicit Chatwoot maintenance
  plan;
- исключение для `MT-10`: installer может только настроить tenant API Channel
  inbox - включить single-conversation режим, прописать webhook URL и сохранить
  возвращенный `Channel::Api.secret` в portal DB.

## Старый Dry Run: Что Важно Запомнить

Старый dry run подтвердил полезные вещи:

- portal можно было поднять рядом с production Chatwoot без изменения Chatwoot
  core;
- отдельная portal DB в Docker volume не использовала Chatwoot DB;
- reverse-proxy режим был нужен, потому что `80/443` уже заняты host Nginx;
- `lk.provgroup.ru` был рабочим candidate-доменом для portal;
- Chatwoot webhook secret нужно синхронизировать с фактическим secret из
  Chatwoot, а не считать generated local value финальным.

Старый dry run больше не является актуальной инструкцией, потому что был сделан
до multi-tenant architecture update.

## Важное Ограничение После MT-8

Production docs/installer/compose приведены к tenant-aware dedicated
one-tenant flow в рамках `MT-10`.

Актуальный clean reinstall runbook:

```text
docs/MT_10_PRODUCTION_CLEAN_REINSTALL_RUNBOOK.md
```

Ограничения остаются:

- не использовать старые global `CHATWOOT_*` как production runtime authority;
- не менять production Chatwoot ради portal deploy за пределами явно
  разрешенной tenant API Channel настройки;
- не переносить данные из старого портала в `v2`.

## План Будущего Развертывания

Production rollout должен идти по `MT-10 Production Clean Reinstall Runbook`.

Коротко:

1. Проверить, что Chatwoot работает на `chat.provgroup.ru`.
2. Удалить только старый portal runtime.
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
- длинный лог старых команд;
- troubleshooting, который уже перенесен в актуальный runbook.
