# Журнал Решений

## D-001. `v2` живет в отдельной папке

- дата: `2026-04-20`
- решение:
  новая версия создается в отдельной папке `chatwoot-client-portal-v2` рядом со старым проектом
- причина:
  это защищает новый код от смешивания со старой архитектурой, старым стеком и старым CSS/runtime

## D-002. Старый проект не используется как источник

- дата: `2026-04-20`
- решение:
  старый `chatwoot-client-portal` не используется как reference, источник кода, product context, edge cases, runtime-подходов или данных; сам старый проект не читается, не редактируется, не запускается и его runtime/Postgres не используются как рабочая среда для `v2`
- причина:
  цель `v2` - развивать новую самостоятельную кодовую базу без зависимости от старых компромиссов и исторического контекста старого портала

## D-003. Authority model остается backend-owned

- дата: `2026-04-20`
- решение:
  browser не получает direct Chatwoot authority; auth, session, send и realtime проходят через portal backend
- причина:
  это соответствует правильной product model и снижает архитектурную путаницу

## D-004. Frontend stack

- дата: `2026-04-20`
- решение:
  frontend строим на `React + TypeScript + Vite + Tailwind CSS`, а `Preline` подключаем выборочно через нужные headless plugins
- причина:
  это дает понятную компонентную модель, быструю сборку, типовую безопасность и новый UI-слой без зависимости от Framework7, не затягивая лишний UI-runtime целиком

## D-005. Backend stack

- дата: `2026-04-20`
- решение:
  backend строим на `Node.js 24.x + Fastify + TypeScript + PostgreSQL + Drizzle ORM + Zod`
- причина:
  стек подходит для явного modular backend, строгих контрактов и предсказуемой работы с данными

## D-006. Realtime model

- дата: `2026-04-20`
- решение:
  realtime строим через `Chatwoot webhook -> portal backend -> SSE -> browser`
- причина:
  это сохраняет backend-owned routing authority и не возвращает direct browser integration с Chatwoot

## D-007. На старте избегаем лишних слоев

- дата: `2026-04-20`
- решение:
  на старте не используем heavy UI kit, state manager и fullstack meta-framework; `Preline` допускается только модульно, по мере реальной нужды
- причина:
  `v2` должен быть максимально ясным, а не перегруженным технологиями

## D-008. `v2` должен быть installable web app

- дата: `2026-04-20`
- решение:
  `v2` закладывается как PWA-ready портал с manifest, app icons, standalone display mode и service worker foundation
- причина:
  продукт должен устанавливаться из браузера как приложение на desktop, Android и iOS/iPadOS, а не оставаться только обычным сайтом

## D-009. Chat UX scope фиксируем явно

- дата: `2026-04-20`
- решение:
  в подтвержденный продуктовый scope `v2` явно входят `reply state`, `message calendar` и `voice recording and send`
- причина:
  эти возможности уже согласованы по продукту и prototype work, поэтому они не должны оставаться только в ранних step-файлах или теряться из долгосрочного плана

## D-010. Окружение запускает только пользователь

- дата: `2026-04-21`
- решение:
  запуск, остановка и ручное приведение локального окружения `v2` в ready-state выполняются только пользователем; при этом первичную bootstrap-подготовку для первого запуска делает агент: готовит env/template-файлы, schema, migrations, init-артефакты и точные команды. После запуска нужного сервиса пользователем агент выполняет прикладную инициализацию внутри него в рамках задачи: создает БД/таблицы, прогоняет миграции, добавляет минимальные данные и запускает тесты/проверки
- причина:
  это убирает двусмысленность между bootstrap-работой и операционным контролем среды: инженерная подготовка остается на агенте, а контроль запуска и остановки среды остается у пользователя

## D-011. `v2` использует отдельный isolated `Postgres`

- дата: `2026-04-21`
- решение:
  `chatwoot-client-portal-v2` использует только свой отдельный `Postgres` runtime и отдельную базу данных; подключать `v2` к рабочей базе `Chatwoot` или к старой базе `chatwoot-client-portal` запрещено
- причина:
  это защищает работающий admin center `Chatwoot` и старый портал от случайных миграций, конфликтов схемы и смешивания данных во время разработки `v2`

## D-012. Review findings ведутся как отдельный registry

- дата: `2026-04-21`
- решение:
  риски, найденные во время code review, фиксируются в `docs/Findings/` отдельными markdown-файлами: один файл на один finding. Перед работой над областью кода нужно читать open findings, которые относятся к этой области. После фикса и проверки finding файл удаляется, а факт закрытия фиксируется в `docs/WORK_LOG.md`
- причина:
  review findings часто являются важнее обычного work log: они описывают риски, срочность и варианты фикса. Отдельный registry не дает потерять активные риски между чатами и помогает выбирать следующий безопасный шаг; удаление закрытых файлов не дает реестру превращаться в архив старых проблем

## D-013. `v2` ведется как отдельный git repository

- дата: `2026-04-21`
- решение:
  `chatwoot-client-portal-v2` инициализирован и ведется как отдельный git repository с собственным `main`, историей и feature branches
- причина:
  `v2` является новым отдельным проектом, а не продолжением git history старого `chatwoot-client-portal`; отдельный repository boundary защищает `v2` от смешивания с большим dirty-state старого портала и делает baseline нового проекта явным

## D-014. Portal chat использует один вечный Chatwoot conversation

- дата: `2026-04-21`
- решение:
  клиентский чат портала строится как один вечный `primary conversation` на `portal_user/contact` внутри выделенного `Channel::Api` inbox. Portal inbox в Chatwoot должен быть настроен как `Conversation Routing -> Reopen same conversation` (`lock_to_single_conversation = true`). Если Chatwoot уже содержит несколько portal conversations для этого contact/inbox из-за старой настройки или ручных/API-действий, это считается legacy/config/data anomaly: backend выбирает authoritative primary conversation и дальше работает через persisted mapping, а не делает synthetic transcript из нескольких Chatwoot conversations. После перехода к multi-tenant target model это правило применяется внутри одного tenant: `primary conversation` является per tenant user, а не per global email
- причина:
  для клиента портал должен вести себя как обычный мессенджер с одной непрерывной лентой, а не как CRM с несколькими тикетами. Для операторов Chatwoot может показывать previous conversations в своем интерфейсе, но это не становится клиентской моделью портала. Один authoritative conversation упрощает send, pagination, realtime, idempotency и восстановление после retry

## D-015. Portal inbox routing enforcement

- дата: `2026-04-21`
- решение:
  после первого deploy portal backend должен один раз принудительно проверить и включить `lock_to_single_conversation = true` для tenant configured portal inbox. В обычной работе backend не проверяет эту настройку на каждом запросе. Повторная runtime-проверка и auto-fix выполняются только если chat read model обнаруживает anomaly: больше одного portal conversation для одного linked contact в выделенном inbox. При recovery valid persisted mapping остается главным; если mapping нет или он невалиден, backend выбирает canonical conversation по правилу: самый свежий active conversation, иначе самый свежий resolved conversation
- причина:
  это защищает портал от случайной админской смены `Conversation Routing -> Create new conversations`, но не добавляет лишний Chatwoot roundtrip на каждый chat request. Anomaly-driven recovery чинит настройку ровно тогда, когда неправильная конфигурация уже проявилась в данных

## D-016. Рост frontend и backend идет по product features

- дата: `2026-04-23`
- решение:
  новые крупные portal-возможности добавляются отдельными feature/module slices, а не доклеиваются в уже существующие giant files или в общий `components/` слой. Во frontend следующие product areas фиксируются как отдельные feature boundaries: `dashboard`, `notifications`, `branding`, `tariff`, `documents`, `tasks`, `service-requests`, `profile`, при этом `chat` остается только chat-domain фичей. В backend соответствующие portal-owned области заводятся как отдельные `modules/*`
- причина:
  портал уже вышел из состояния "один чат и auth". Дальше продукт будет расти быстрее, и без явных feature boundaries новые задачи начнут распухать внутри `chat`, `shared` и route-level файлов, как это уже случилось с несколькими текущими hot spots

## D-017. `shared/` держим строго недоменным

- дата: `2026-04-23`
- решение:
  `frontend/src/shared/` используется только для generic `ui`, маленьких `lib` helpers и branding/theme primitives. Бизнес-логика документов, тарифов, задач, уведомлений, service requests и других feature rules в `shared` не переносится
- причина:
  это не дает превратить `shared` в скрытый второй monolith, где оказывается любая логика "потому что она может пригодиться еще раз"

## D-018. Root lint включает code-health guard с baseline allowlist

- дата: `2026-04-23`
- решение:
  в root workspace добавлен `pnpm code-health`, а `pnpm lint` теперь всегда сначала прогоняет этот guard. Production `ts/tsx` файлы ограничены `500` строками, test `ts/tsx` файлы ограничены `1000` строками. Для уже существующего oversized debt используется временный allowlist с текущим baseline; allowlisted file не может расти выше этого baseline без отдельного решения. Если файл после refactor снова укладывается в лимит, его нужно удалить из allowlist
- причина:
  проекту нужен встроенный ранний сигнал о giant files до того, как новый личный кабинет, уведомления и branding снова раздуют рабочие области до плохо сопровождаемого состояния

## D-019. Notifications идут после PWA hardening и в два слоя

- дата: `2026-04-23`
- решение:
  обязательные notifications не открываются до `Phase 9. PWA App Hardening`. После hardening rollout делится на два последовательных слоя: сначала in-app notification state (`unread`, badges, preferences UX), затем browser push notifications поверх уже укрепленного service worker/update lifecycle
- причина:
  push notifications в вебе опираются на service worker, installed app lifecycle и понятные reconnect/update rules. Если начать с push раньше hardening, дебаг превратится в смесь проблем permission UX, cache lifecycle, stale app shell и самих push deliveries

## D-020. Старый портал снят с reference-scope

- дата: `2026-04-24`
- решение:
  `../chatwoot-client-portal` больше не открывается и не используется для сверки продуктовых, UI, runtime или edge-case решений; рабочий контекст берется из кода и документов `v2`, официальной документации затронутых технологий и `../chatwoot-ce-stable` только для Chatwoot-вопросов, если официальной документации недостаточно
- причина:
  `v2` уже перерос старый портал: дальнейшая сверка со старым проектом добавляет шум, риск возврата старых компромиссов и мешает держать новую architecture authority самостоятельной

## D-021. Composer не содержит portal-owned emoji controls

- дата: `2026-04-26`
- решение:
  верхняя quick emoji лента, отдельная emoji-кнопка в composer и hardcoded emoji/preset picker не входят в текущий chat UX; ввод emoji остается за системной клавиатурой или OS-level средствами пользователя
- причина:
  кастомные emoji controls загромождают composer на мобильных экранах и дублируют системный ввод, особенно в iOS/PWA-контексте

## D-022. Multi-tenant portal становится целевой архитектурой

- дата: `2026-05-05`
- решение:
  `chatwoot-client-portal-v2` переходит от single-tenant target model к tenant-aware multi-tenant target model. Один portal deploy может обслуживать много B2B tenants в shared SaaS режиме; dedicated install остается поддерживаемым как portal deploy с одним tenant. Старое правило "один portal deploy = один business = один Chatwoot account" superseded как целевая architecture rule и остается только частным dedicated режимом
- причина:
  продукт должен поддерживать малых клиентов в shared SaaS модели и крупных клиентов в dedicated модели без двух разных кодовых баз. В проекте еще нет production clients, поэтому foundation можно переделать правильно до появления compatibility debt

## D-023. Tenant определяется по Host/domain

- дата: `2026-05-05`
- решение:
  production tenant resolution строится по normalized `Host`/domain до auth/session/chat/admin runtime. Принята domain convention `lk.<client-domain>`, например `lk.buhfirma.ru`, `lk.stroyfirma.ru`, `lk.zubi.ru`. Unknown host должен получать controlled failure без fallback к default tenant. Path-based tenancy и explicit tenant headers допустимы только для dev/test diagnostics, а не как production browser model
- причина:
  host-based tenancy дает естественные browser origin boundaries для cookies, service worker, PWA install identity и same-origin API. Body/query-based tenant selection легче spoof-ить и проще забыть в отдельном endpoint

## D-024. Chatwoot runtime config принадлежит tenant

- дата: `2026-05-05`
- решение:
  runtime больше не должен строиться вокруг глобальных `CHATWOOT_ACCOUNT_ID` и `CHATWOOT_PORTAL_INBOX_ID`. Chatwoot base URL, account ID, portal inbox ID, API token и webhook secret должны приходить из current tenant runtime config. Старые `CHATWOOT_*` env names могут временно использоваться только как bootstrap/dev input для default tenant, но не как runtime authority
- причина:
  каждый tenant связан со своим Chatwoot account/inbox и потенциально со своей Chatwoot installation. Глобальные Chatwoot env неизбежно возвращают single-tenant assumptions и создают риск cross-tenant routing/data leaks

## D-025. Tenant scope обязателен для customer/chat persistence

- дата: `2026-05-05`
- решение:
  portal-owned rows, которые принадлежат компании или пользователю компании, должны быть tenant-scoped. `portal_users.email` не является глобально уникальным; корректная уникальность - `tenant_id + email`. Sessions, verification/reset records, contact links, conversation mappings, send ledger и webhook deliveries должны хранить/использовать tenant scope
- причина:
  один и тот же email, Chatwoot contact ID, conversation ID или webhook delivery key может легитимно существовать в разных tenants, особенно при разных Chatwoot installations/accounts. Без tenant scope persistence layer не может доказуемо защищать cross-tenant isolation

## D-026. Branding/admin старая ветка не мержится как есть

- дата: `2026-05-05`
- решение:
  `feature/phase-10-portal-branding-admin` не мержится как есть, потому что branch построена на single-tenant assumptions. Branding/admin work возвращается позже как `MT-9. Tenant Admin And Branding Rebuild`: branding становится tenant-owned, tenant admin login проверяет administrator role inside tenant Chatwoot account, а platform admin остается отдельной operator-зоной или CLI/scripts на раннем этапе
- причина:
  global branding/admin session model небезопасна для shared SaaS. До tenant foundation любая branding/admin реализация рискует закрепить неправильные authority boundaries

## D-027. Shared SaaS runtime не включается в промежуточном MT-состоянии

- дата: `2026-05-05`
- решение:
  во время multi-tenant migration возможно промежуточное unsafe-состояние: tenant уже определяется по Host и Chatwoot config уже tenant-specific, но portal users, sessions, verification records, chat mappings, send ledger или webhook deliveries еще не tenant-scoped. До завершения tenant-scoped persistence, customer auth, chat runtime и webhooks customer runtime работает только в default-tenant/one-tenant режиме. Non-default tenants могут использоваться для schema/repository/provisioning tests, но обычные HTTP customer flows должны hard-fail или быть отключены
- причина:
  это защищает реализацию и тесты от случайного запуска shared SaaS раньше полной изоляции данных. Иначе один слой уже может работать как multi-tenant, а другой все еще будет global, что создает риск смешивания пользователей, сессий, verification state, chat mappings или webhook deliveries разных компаний

## D-028. `portal_tenants.mode` не добавляем

- дата: `2026-05-05`
- решение:
  у tenant не будет поля `mode`. Tenant определяется как company + domain + точная Chatwoot-связка: `chatwoot_base_url`, `chatwoot_account_id`, `chatwoot_portal_inbox_id`, encrypted API token и encrypted webhook secret. Shared/dedicated определяется фактически по Chatwoot connection. `Hybrid` остается только описанием всей установки, где один portal deploy обслуживает tenants с разными типами Chatwoot connection, и не попадает в `portal_tenants`
- причина:
  один tenant в первой модели связан ровно с одним Chatwoot account и одним portal inbox, поэтому `hybrid` не является свойством tenant. Поле `mode` добавило бы лишний enum и риск runtime branching по ярлыку вместо фактической связи. Если позже понадобится operational reporting, можно добавить отдельное необязательное поле вроде `chatwoot_connection_label`

## D-029. Password reset остается в `verification_records`

- дата: `2026-05-05`
- решение:
  отдельную таблицу `password_reset_records` не создаем. `verification_records` остается общим persistence layer для email-code flows: registration использует `purpose = registration`, password reset использует `purpose = password_reset`. В multi-tenant migration `tenant_id` добавляется именно в `verification_records`, continuation token поля остаются там же, advisory lock key строится как `purpose + tenant_id + normalized email`
- причина:
  текущий backend уже реализует password reset через `verification_records`, а отдельная таблица добавила бы лишнюю схему без новой domain-границы. Для multi-tenant isolation достаточно tenant-aware индексов и lookup по `tenant_id`, `email`, `purpose`, `status`

## D-030. Tenant admin verification uses separate token

- дата: `2026-05-06`
- решение:
  `F-MT-004` не блокирует `MT-1` и остается deferred до `MT-9 Tenant Admin And Branding Rebuild`, но strategy уже выбрана: tenant admin verification использует отдельный per-tenant Chatwoot admin-verification token. В `MT-1` schema admin-verification token не добавляли. В `MT-9` нужно добавить encrypted tenant secret, например `chatwoot_admin_verification_token_ciphertext`, и использовать его только backend-side для проверки Chatwoot administrator внутри текущего `tenant.chatwoot_account_id`. Runtime Chatwoot token не переиспользуется как implicit admin authority, а provisioning/platform-admin token не используется для tenant admin login
- причина:
  Chatwoot Agents API использует `api_access_token`, а доступ к endpoint зависит от прав пользователя-владельца token. Для admin login это отдельная security boundary: если обычный runtime token слишком узкий, проверка админа не должна ломать чат; если admin-verification token шире, он не должен участвовать в обычном chat runtime. Отдельный per-tenant token дает более понятную ротацию, аудит и tenant isolation

## D-031. `portal_tenant_domains` не добавляем в MT-1

- дата: `2026-05-05`
- решение:
  в `MT-1` tenant foundation храним один canonical domain в `portal_tenants.primary_domain`. Отдельную таблицу `portal_tenant_domains` не создаем в первом implementation pass. Multi-domain/custom-domain поддержку оставляем на будущий slice, когда появится реальная потребность в нескольких доменах на один tenant
- причина:
  текущая production convention `lk.<client-domain>` требует одного основного host для tenant resolution. Отдельная таблица доменов уже нужна только для secondary/custom domains, verified domains и domain ownership flow. Добавлять ее сейчас означало бы расширить scope MT-1 без runtime-пользы

## D-032. Forwarded host доверяем только в trusted proxy режиме

- дата: `2026-05-05`
- решение:
  tenant resolution использует normalized request host. `X-Forwarded-Host` учитывается только когда backend запущен с `PORTAL_TRUST_PROXY=true`. По умолчанию `PORTAL_TRUST_PROXY=false`, и backend берет обычный `Host`. В production включать trusted proxy mode можно только если backend недоступен напрямую из интернета и получает traffic через контролируемый Caddy/Nginx boundary
- причина:
  host выбирает tenant до auth/session/chat runtime. Если публичный клиент сможет произвольно подставить forwarded host, он сможет попытаться выбрать чужой tenant. Поэтому forwarded headers допустимы только как часть явно контролируемой reverse proxy схемы

## D-033. Chatwoot runtime client создается из current tenant

- дата: `2026-05-05`
- решение:
  backend runtime больше не создает общий Chatwoot client из глобальных `CHATWOOT_*` env. Для registration, chat runtime и webhook processing Chatwoot client создается на request из `request.tenant.chatwoot`: tenant `baseUrl`, `accountId`, `portalInboxId`, decrypted runtime API token и decrypted webhook secret. Старые `CHATWOOT_*` env остаются допустимы только для bootstrap/provisioning scripts, пока они не заменены tenant-aware scripts
- причина:
  один portal deploy может обслуживать tenants с разными Chatwoot accounts или installations. Общий env-bound Chatwoot client возвращал single-tenant authority и мог отправить запросы не в тот Chatwoot account/inbox

## D-034. Customer/chat persistence требует tenant scope

- дата: `2026-05-05`
- решение:
  tenant-owned tables получили `tenant_id`: `portal_users`, `portal_sessions`, `verification_records`, `portal_user_contact_links`, `portal_user_chatwoot_conversations`, `portal_chat_message_sends` и `chatwoot_webhook_deliveries`. Unique/index scope для email, Chatwoot contact id, conversation id, send ledger и webhook delivery key теперь включает tenant там, где это нужно для isolation. Runtime repositories для этих таблиц создаются или вызываются с tenant scope
- причина:
  один и тот же email, Chatwoot contact id, conversation id или delivery key может легитимно повторяться в разных tenants. Без `tenant_id` persistence layer оставался бы скрыто global и мог смешать данные компаний даже при правильном Host-based tenant resolution

## D-035. Customer auth state изолирован tenant scope

- дата: `2026-05-05`
- решение:
  customer auth state проверяется через tenant-aware service/repository boundary: login ищет пользователя по `tenant_id + email`, session lookup требует current tenant, registration verification records и password reset records используют tenant-scoped locks/lookups/continuation tokens. Non-default HTTP customer runtime guard остается включенным до завершения `MT-6`/`MT-7`, поэтому cross-tenant auth isolation дополнительно закреплена service-level regression tests
- причина:
  пока shared SaaS runtime еще закрыт transitional guard-ом, нельзя полагаться только на HTTP happy-path tests для non-default tenants. Но auth boundary уже должен быть доказуемо tenant-safe, чтобы следующий chat/runtime слой строился поверх правильной основы

## D-036. Chat realtime fanout требует tenant key

- дата: `2026-05-05`
- решение:
  chat realtime subscriptions and publications ключуются по `tenant_id + portal_user_id + primary_conversation_id`. Chat context repository, conversation mapping repository и send ledger уже создаются с tenant scope, а SSE hub теперь также не может доставить event подписчику из другого tenant даже при совпадении user/conversation identifiers
- причина:
  realtime fanout - это отдельная runtime boundary, не просто DB lookup. Без `tenant_id` в ключе подписки future schema/import/provisioning changes могли бы создать скрытый cross-tenant delivery risk, даже если persistence layer уже tenant-scoped

## D-037. Tenant webhook provisioning хранит secret в tenant record

- дата: `2026-05-05`
- решение:
  после закрытия `MT-4`-`MT-7` transitional hard-fail для non-default customer runtime снят. Chatwoot webhook signature проверяется secret-ом current tenant, выбранного по Host. Tenant-aware webhook configure script использует Chatwoot connection из `portal_tenants`, строит callback URL из `tenant.public_base_url`, настраивает account webhook через Chatwoot account API и сохраняет возвращенный webhook secret обратно в `portal_tenants.chatwoot_webhook_secret_ciphertext`
- причина:
  webhook secret больше не является global env authority. Для shared SaaS один portal deploy должен принимать события от разных Chatwoot accounts/installations и проверять каждое событие secret-ом того tenant, на чей host пришел callback

## D-038. PWA install identity резолвится по tenant

- дата: `2026-05-05`
- решение:
  PWA install identity больше не задается одним static `manifest.webmanifest`. `MT-8` использует tenant-aware `/api/tenant/manifest.webmanifest` для `id`, `name`, `short_name`, `start_url`, `scope`, colors и icon URLs. Для iOS/iPadOS Home Screen installs HTML metadata также tenant-aware: `apple-mobile-web-app-title` обновляется на frontend, а `<link rel="apple-touch-icon">` указывает на `/api/tenant/apple-touch-icon.png`. До возвращения полноценного tenant branding в `MT-9` endpoints могут отдавать fallback assets, но browser contract уже должен быть tenant-owned
- причина:
  Android/Chrome устанавливают PWA на основе manifest identity, а Safari/iOS использует HTML touch icon/title metadata для Home Screen web clips. Если оставить один global manifest или одну global install icon, две разные компании в shared SaaS могут получить одинаковую установленную app identity или stale branding. Host-based tenant resolution и no-store dynamic metadata сохраняют безопасную границу до полноценного branding/admin слоя
