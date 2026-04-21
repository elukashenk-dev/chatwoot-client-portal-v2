# Журнал Решений

## D-001. `v2` живет в отдельной папке

- дата: `2026-04-20`
- решение:
  новая версия создается в отдельной папке `chatwoot-client-portal-v2` рядом со старым проектом
- причина:
  это защищает новый код от смешивания со старой архитектурой, старым стеком и старым CSS/runtime

## D-002. Старый код не копируется

- дата: `2026-04-20`
- решение:
  старый `chatwoot-client-portal` используется только как read-only reference; код оттуда не копируется, сам старый проект не редактируется и его runtime/Postgres не используются как рабочая среда для `v2`
- причина:
  цель `v2` - получить новую чистую кодовую базу, а не перенести старые компромиссы в новую папку

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
  в подтвержденный продуктовый scope `v2` явно входят `reply state`, `quick emoji bar`, `message calendar` и `voice recording and send`
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
  клиентский чат портала строится как один вечный `primary conversation` на `portal_user/contact` внутри выделенного `Channel::Api` inbox. Portal inbox в Chatwoot должен быть настроен как `Conversation Routing -> Reopen same conversation` (`lock_to_single_conversation = true`). Если Chatwoot уже содержит несколько portal conversations для этого contact/inbox из-за старой настройки или ручных/API-действий, это считается legacy/config/data anomaly: backend выбирает authoritative primary conversation и дальше работает через persisted mapping, а не делает synthetic transcript из нескольких Chatwoot conversations
- причина:
  для клиента портал должен вести себя как обычный мессенджер с одной непрерывной лентой, а не как CRM с несколькими тикетами. Для операторов Chatwoot может показывать previous conversations в своем интерфейсе, но это не становится клиентской моделью портала. Один authoritative conversation упрощает send, pagination, realtime, idempotency и восстановление после retry

## D-015. Portal inbox routing enforcement

- дата: `2026-04-21`
- решение:
  после первого deploy portal backend должен один раз принудительно проверить и включить `lock_to_single_conversation = true` для configured `CHATWOOT_PORTAL_INBOX_ID`. В обычной работе backend не проверяет эту настройку на каждом запросе. Повторная runtime-проверка и auto-fix выполняются только если chat read model обнаруживает anomaly: больше одного portal conversation для одного linked contact в выделенном inbox. При recovery valid persisted mapping остается главным; если mapping нет или он невалиден, backend выбирает canonical conversation по правилу: самый свежий active conversation, иначе самый свежий resolved conversation
- причина:
  это защищает портал от случайной админской смены `Conversation Routing -> Create new conversations`, но не добавляет лишний Chatwoot roundtrip на каждый chat request. Anomaly-driven recovery чинит настройку ровно тогда, когда неправильная конфигурация уже проявилась в данных
