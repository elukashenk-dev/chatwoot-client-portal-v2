# Work Log

Короткая карта крупных завершенных этапов в `chatwoot-client-portal-v2`.
Мелкие fixes, refactoring slices, docs-only changes, временные findings и
детальные проверки здесь не перечисляются.

## Core Product

- `v2` закреплен как самостоятельный tenant-aware клиентский portal поверх
  Chatwoot.
- Собран рабочий portal baseline: auth/session, registration, password reset,
  protected app shell, chat read/send, attachments, realtime и PWA foundation.
- Browser не получает Chatwoot authority; portal backend остается единственной
  authority-зоной для auth, session, send, realtime и Chatwoot access.
- Chatwoot остается system of record для contacts, conversations, messages и
  attachments; portal database хранит только portal-owned данные.

## Multi-Tenant Foundation

- Принята единая multi-tenant архитектура: shared SaaS обслуживает много tenants,
  dedicated install работает как один tenant в той же модели.
- `MT-0`-`MT-8` завершены: tenant определяется по Host/domain, runtime Chatwoot
  config принадлежит tenant, persistence/auth/chat/webhooks/frontend/PWA стали
  tenant-aware.
- `MT-8R Codebase Audit And Refactoring Readiness` завершен; открытых
  `must-fix-before-MT-9` code findings не осталось.
- Для `MT-9` приняты ключевые решения: separate encrypted per-tenant Chatwoot
  admin-verification token и branding assets через portal DB metadata plus
  S3-compatible object storage.

## UI/UX Baseline

- `MT-8.5` product UI/UX baseline создан: brandable matrix, text limits,
  fallback logic, content ownership, visual hierarchy, branding intensity и
  implementation checklist.
- Auth/customer-facing screens приведены к общей структуре для login,
  registration, password reset, OTP и set-password flows.
- Chat UI перешел к customer-support baseline: компактный header, tenant mark,
  support center entry point, action menu, composer alignment и более компактный
  transcript.
- Chat composer footer упрощен до чистого input-row без лишней внутренней
  bordered surface; attachment/voice icon controls остаются без постоянной
  внешней декорации, а send остается primary action.
- Composer attachment/voice controls используют существующий chat accent color
  вместо слабого neutral gray; hover и disabled states сохранены.
- Mobile chat transcript скрывает визуальный scrollbar, сохраняя scroll
  behavior; desktop scrollbar остается доступным.
- Default auth branding assets добавлены в `frontend/public/default-branding/`.

## Production Runtime

- Chatwoot `v4.13.0` compatibility закрыт для API Channel webhook signing:
  tenant webhook sync использует `Channel::Api` webhook URL и `channel_api.secret`.
- Local Chatwoot `v4.13.0` integration проверена на tenants `buhfirma`,
  `stroyfirma` и `zubi`.
- Production Chatwoot CE обновлен до `v4.13.0`; portal `v2` clean reinstall
  выполнен на `lk.provgroup.ru` как tenant-aware one-tenant deployment для
  `provgroup`.
- Production SMTP для portal `v2` переключен на Yandex 360
  `cbr@provgroup.ru`; пользователь подтвердил successful registration code flow.
- Production hardening review завершен без high/critical findings; активные
  follow-ups ведутся через `docs/findings/`.
- `F-PROD-002` закрыт: `main` fast-forward'нут до clean-schema branch,
  `origin/main` синхронизирован, production `DEPLOY_SOURCE.txt` пишет clean
  `main` commit.

## Chat Thread Planning

- Принят и реализован production-grade portal-owned `threadId` runtime: личный
  чат `private:me` и групповые чаты через Chatwoot contact attributes, без
  выдачи Chatwoot authority в browser.
- `GET /api/chat/threads`, messages, attachment send, realtime и webhook fanout
  работают через `tenant + threadId`; group send добавляет безопасный
  Chatwoot-visible Markdown author prefix, а portal transcript показывает автора
  через structured metadata.
- Все chat thread security gates закрыты: malformed/forged thread ids,
  person/group contact validation, group membership removal, author
  formatting, realtime fanout и webhook routing проверяются fail-closed.
- `MT-8.6` расширен до destructive clean-schema cleanup по решению владельца
  проекта: старые portal users не сохраняются, migration history сжата в один
  clean baseline, старый context endpoint удален, chat mapping живет только в
  `portal_chat_threads`, send ledger scope живет только через
  `portal_chat_thread_id`.
- Локальная portal DB destructive reset-нута и мигрирована заново: после reset
  нет старой chat mapping table, нет старой send-ledger колонки, portal users и
  chat threads созданы заново.
- Проверки на чистой схеме прошли: backend tests `202/202`, frontend tests
  `93/93`, Playwright e2e `25/25`, backend build, frontend typecheck/build,
  root lint/code-health, `git diff --check` и local group-thread send через
  реальный backend + локальный Chatwoot.
- `scripts/` проверены на устаревшие portal runtime следы; удалена retired
  production installer option, code-health guard оставлен без старой
  формулировки.
- Production portal clean reinstall выполнен на `lk.provgroup.ru`: portal app
  dir, containers и Docker volumes удалены перед deploy; новая portal DB
  создана с clean thread-only schema; Chatwoot core/DB/uploads/services и
  `chat.provgroup.ru` не трогались.
- Production verification после reinstall: `DEPLOY_SOURCE.txt`, `/api/health`,
  `/api/tenant`, manifest, login HTML, Docker compose health и production DB
  counts проверены; старая portal mapping table и старая send-ledger column
  отсутствуют.
- Chat thread deleted-conversation recovery добавлен: если Chatwoot conversation
  удален после mapping в portal DB, следующий send восстанавливает thread под
  lock, создает replacement conversation через contact inbox source, повторяет отправку
  и нормализует confirmed portal-send messages в `sent`, даже если Chatwoot
  помечает API-channel delivery status как `failed`.
- Portal maintenance retention добавлен: cleanup module/script с dry-run,
  tenant scope, default TTL для send ledger, webhook deliveries, expired
  rate-limit buckets, sessions и verification records; `portal_chat_threads` и
  Chatwoot-owned data не удаляются.
- Production maintenance cleanup автоматизирован: installer ставит daily
  systemd timer, перед включением выполняет dry-run, timer persistent и
  запускает cleanup внутри `portal-backend` container.
- Deleted-conversation recovery review закрыт: `F-CHAT-005` и `F-CHAT-006`
  удалены после regression coverage для ledger failed re-acquire и group
  attachment recovery; Playwright MCP проверил private/group recovery без
  portal retry/error.
- Strict group contact rename выполнен: portal chat thread model больше не
  поддерживает legacy `company`, публичный `threadId` использует `group:<id>`,
  Chatwoot attribute list переименован в `portal_client_group_contact_ids`, а
  `portal_contact_type` принимает только `person` и `group`.
- Production portal clean reinstall выполнен после strict group rename:
  `lk.provgroup.ru` поднят из clean `main` source, portal DB пересоздана,
  Chatwoot API Channel/webhook verification пройдены, Chatwoot core не трогался.
- Страница `Информация о чате` реализована как full-screen chat-adjacent page:
  backend endpoint отдает tenant/session/thread-scoped details без browser
  Chatwoot authority, frontend открывает страницу из chat menu через reusable
  `ChatFullScreenPanel`.
- Chat info details покрывают тип чата, support label, доступ, `curator_name`,
  дату начала/последней активности и безопасный список участников группового
  чата через active portal users + Chatwoot contact attribute membership.
- Local service governance обновлен: агент может запускать/перезапускать
  локальные portal-сервисы для разработки и проверок; Chatwoot остается внешним
  сервисом и без отдельной необходимости не трогается.
- Chat info Playwright e2e добавлен в `chat-read-model`: group chat info
  открывается из меню, показывает детали/куратора/участников и возвращается в
  transcript.
- Проверки chat info slice пройдены: backend targeted tests `51/51`,
  frontend targeted tests `23/23`, `pnpm build`, `pnpm lint`, Prettier targeted
  check, `git diff --check`, Playwright MCP browser validation на
  `http://127.0.0.1:5173` с mock API, repo Playwright e2e `26/26`.
- Local dev DB compatibility migration добавлена для старых
  `portal_chat_threads` schemas: legacy `company` constraint/index переводятся
  на strict `group`, чтобы group threads могли создаваться без `portal_user_id`.
- Runtime send validation на `buhfirma.127.0.0.1.nip.io:5173` пройдена через
  portal registration/login и реальные Chatwoot sends: `private:me` и
  `group:<contactId>` отправлены и прочитаны обратно из Chatwoot snapshots.
- Rendered UI validation на `buhfirma.127.0.0.1.nip.io:5173` пройдена в чистом
  Playwright context: страница `Информация о чате` открывается из меню для
  `private:me` и для `group:<contactId>`, back возвращает в transcript.
- Проверки после migration fix пройдены: full backend suite `226/226`,
  targeted chat-thread backend tests `7/7`, buhfirma Playwright e2e `26/26`,
  `git diff --check`.
- `ChatFullScreenPanel` приведен к portal shell layout: chat-adjacent pages
  больше не выходят за `max-w-[500px]` основного portal UI.
- Chat info close flow усилен: поздний `/api/chat/threads/:id/info` response
  после `Назад` не открывает страницу повторно.
- Проверки после UI/layout fix пройдены: frontend targeted tests `21/21`,
  `pnpm --dir frontend typecheck`, `pnpm lint`, targeted Prettier check,
  targeted chat-info Playwright e2e, full buhfirma Playwright e2e `26/26`,
  `git diff --check`; runtime measurement на
  `buhfirma.127.0.0.1.nip.io:5173` подтвердил `390px` mobile и `500px`
  centered desktop для private и group chat info.
- Для следующего menu slice подготовлены spec и implementation plan:
  read-only full-screen `Медиа и файлы` page поверх текущего thread authority,
  с portal attachment proxy для медиа-страницы и существующего transcript, без
  browser Chatwoot authority и без upload/delete/search scope.
- Для `Медиа и файлы` зафиксирован выбранный UI вариант `C. Mixed View`:
  фото/видео в visual section, аудио/документы/прочие файлы в compact list.
- Реализован read-only full-screen slice `Медиа и файлы`: backend media
  endpoint, portal attachment proxy для transcript/media URLs, frontend
  `C. Mixed View` page, chat menu wiring и stale-response handling.
- Проверки `Медиа и файлы` slice пройдены: backend targeted tests, frontend
  targeted tests, full backend/frontend suites, `pnpm lint`, `pnpm build`,
  Prettier targeted check, `git diff --check` и Playwright
  `chat-read-model`.
- Review findings `F-CHAT-007`..`F-CHAT-010` закрыты: attachment proxy получил
  portal-owned cache policy, timeout на fetch/body stream, content-length guard,
  allowlist для tenant Chatwoot/object-storage origins и SSRF checks для схем,
  private hosts и redirects.
- Проверки attachment proxy fixes пройдены: targeted backend tests `48/48`,
  full backend suite `260/260`, `pnpm lint`, `pnpm build`, `git diff --check`.
- Runtime media validation на `buhfirma.127.0.0.1.nip.io:5173` выявила и
  закрыла consistency gap: сразу после отправки attachment страница
  `Медиа и файлы` теперь merge-ит свежие вложения из текущего transcript
  snapshot, пока Chatwoot media history догоняет.
- Проверки media runtime fix пройдены: frontend targeted tests `8/8`,
  `pnpm --dir frontend typecheck`, `pnpm lint`, `pnpm build`,
  `git diff --check`, buhfirma Playwright e2e `27/27`, live Playwright flow
  registration -> private PNG send -> media page -> open image через portal
  proxy.
- Production deploy `fac3412` выполнен на `lk.provgroup.ru` из clean
  `feature/phase-media-files-page`; portal backend/web containers rebuilt и
  healthy, `/api/health`, `/api/tenant` и manifest отвечают.
- Production public smoke после deploy пройден в clean Playwright context:
  login, registration и password reset routes рендерятся; unauthenticated
  media endpoint возвращает ожидаемый `401`.
- Authenticated production media smoke пока требует реального prod portal
  пользователя, который уже добавлен агентом в Chatwoot как contact и может
  войти или пройти registration.

## Current Baseline

- Текущий runtime baseline поддерживает shared SaaS модель и dedicated модель как
  один tenant.
- Локальная portal DB сейчас clean-reset baseline: default tenant и fresh test
  users созданы заново после destructive reset.
- Production portal доступен на `lk.provgroup.ru` для тестирования текущего
  post-reinstall baseline.
- Основные source-of-truth документы живут в `docs/architecture/`,
  `docs/roadmap/` и `docs/design/`.
- Stable docs cleanup выполнен: удален завершенный clean-schema execution plan,
  stable docs приведены к текущему post-reinstall baseline.
- Открытый архитектурный gate перед admin/branding: `F-MT-004` остается deferred
  до реализации `MT-9`, стратегия уже выбрана.

## Recommended Next Step

- Подготовить валидного prod portal пользователя для `lk.provgroup.ru`,
  отправить файл в личный чат и проверить, что `Медиа и файлы` открывает его
  через portal attachment proxy.
