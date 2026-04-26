# Work Log

Короткая карта значимых внедренных шагов в `chatwoot-client-portal-v2`.

- Создан отдельный проект `v2`: `frontend`, `backend`, `docs`, isolated Postgres, env/bootstrap tooling и базовый workspace.
- Поднят technical foundation: React/Vite/Tailwind frontend, Fastify/Zod/Drizzle backend, health endpoint, migrations, PWA metadata и service worker foundation.
- Реализована backend-owned auth/session основа: DB-backed cookie sessions, login/logout/current user, protected/public route behavior и protected app shell.
- Реализован `Phase 2. Registration Flow`: Chatwoot contact eligibility, email verification, continuation token, password setup и durable связь `portal_user -> Chatwoot contact`.
- Реализован `Phase 3. Password Reset`: request/verify/set-password flow, generic response без account disclosure и invalidation старых sessions после смены пароля.
- Реализован `Phase 5. Chat Read Model`: backend-owned chat context/messages, linked contact resolution, authoritative primary conversation mapping, bounded history pagination и controlled chat states.
- Принята и реализована single-primary chat routing model: один authoritative Chatwoot conversation на portal contact, portal inbox routing enforcement и anomaly recovery без synthetic multi-conversation transcript.
- Реализован `Phase 6. Text Send And First Conversation Bootstrap`: backend-owned text send, first conversation bootstrap, customer-authored Chatwoot messages и durable send ledger для idempotency/retry/recovery.
- Реализован `Phase 7. Attachment Send`: backend multipart endpoint, single-file composer flow, Chatwoot attachment delivery, attachment rendering и send ledger для файлов.
- Реализован `Phase 8. Realtime`: signed Chatwoot webhook intake, delivery dedupe ledger, mapping-based route resolution, SSE endpoint и frontend realtime merge.
- Доведен chat UX baseline: grouped transcript, day dividers, stable scroll behavior, reply state, voice recording/audio send, copy/reply context menu и mobile swipe-to-reply.
- Добавлен optimistic text send UX: composer очищается сразу, outgoing bubble получает `sending/failed/retry`, retry использует тот же `clientMessageKey`, duplicate sends защищены backend ledger.
- Закрыт code-health checkpoint: root `pnpm code-health`, lint guard, file-size baseline allowlist и feature-boundary rules для будущих portal domains.
- Реализован `Phase 9. PWA App Hardening`: controlled service worker update flow, app update banner, build revision stamp, API/SSE no-cache boundary, installed-PWA viewport/safe-area polish, offline UI и reconnect/resync behavior.
- Подготовлен production deployment baseline: backend/frontend Dockerfiles, production compose/Caddy, terminal installer, Chatwoot webhook secret sync, GitHub Actions deploy scaffolding, production runbook/session log и archive-based VM update helper.
- Старый `../chatwoot-client-portal` снят с reference-scope: правила и устойчивые документы теперь запрещают читать, запускать или использовать старый портал как source of truth для `v2`.
- Реализован первый `chat UI polish` slice: темная chat header styling, смягченная форма grouped message bubbles, реальная Chatwoot-аватарка агента и компактная in-bubble time/status metadata без текстовых delivery-статусов.
- Доработана in-bubble metadata: время/статус перенесены в inline float, убран постоянный правый gutter у длинных сообщений и reply-bubbles.
- Доработан composer typing mode: attachment и voice controls аккуратно схлопываются при появлении текстового draft и возвращаются после очистки поля.
- Доработана отправка attachment captions: текстовый draft при выбранном файле отправляется как content того же Chatwoot message, участвует в send-ledger idempotency и очищается после успешной отправки.
- Закрыт targeted review по attachment captions: добавлен multipart field-size guard и защита от silently truncated caption fields.
- Доработана compact chat header: возвращена светлая цветовая схема из `provgroup_chat_screen_01.html`, menu/logout actions оставлены как голые иконки, статус показан как компактный `Онлайн`, удалена панель календаря/последних 20 сообщений, outgoing bubble/send actions вынесены в цвет `chat-outgoing` `#465a72`, incoming bubble вынесен в `chat-incoming` `#f7f7f7` с border `#c0c0c029`, line-height bubbles уплотнен, тени с message bubbles убраны.
- Добавлен экспериментальный faceted gradient surface для outgoing и incoming bubbles.
- Добавлен экспериментальный PNG-фон шапки чата как Vite-managed asset, фон ленты возвращен к прежнему чистому surface.
- Скорректирована схема radius outgoing bubbles: `0.4rem` применяется только к нижнему правому углу одиночного или последнего сообщения в группе.
- Исправлен iOS app shell alignment: fixed viewport теперь учитывает `visualViewport.width` и `visualViewport.offsetLeft`, чтобы layout не уезжал вправо.
- Доработан iOS keyboard detection для composer: открытая клавиатура определяется по просадке `visualViewport.height` от baseline, даже если Safari/PWA меняет `innerHeight`.
- Зафиксирован deferred finding `F-IOS-001`: iOS keyboard textarea drag вызывает visual viewport pan; неудачный freeze `offsetTop` откатан и задокументирован.
- Исправлен и проверен на production attachment upload для файлов больше 1 MiB: route-level Fastify `bodyLimit` поднят только для `/api/chat/messages/attachment`, production host Nginx получил `client_max_body_size 50m`, multipart `fileSize` остается 40 MiB.
- Закрыт finding `F-CHAT-VOICE-001`: iPhone/WebKit voice recordings нормализуются в MP3 перед отправкой, MP3-энкодер вынесен в lazy-loaded chunk, production deploy выполнен, ручная проверка на iPhone подтвердила корректную отправку, duration metadata и playback на portal/agent сторонах.
- Добавлен route-level code splitting для frontend pages: auth/chat страницы вынесены в lazy chunks, основной production JS уменьшен примерно с `352 KB / 102 KB gzip` до `205 KB / 64 KB gzip`; targeted route tests, frontend build, lint, полный test-suite, production deploy и ручная проверка пройдены.
- Доработан composer controls UX: верхняя quick emoji лента и последующий composer emoji picker/button удалены, composer вернулся к простым attachment/textarea/voice/send controls; targeted composer/chat tests, frontend typecheck/build, lint, полный test-suite, production deploy и ручная мобильная проверка пройдены.
- Удален service footer menu (`Сайт`, `Поддержка`, `Позвонить`) со всех non-chat auth/app-shell экранов; targeted auth tests, frontend typecheck/build, lint и полный test-suite пройдены.
- Убрана планшетная card-оболочка portal shell: public/auth и protected app layouts теперь без `sm` padding, rounded corners, shadow и `750px` shell, общий максимум ширины ограничен `500px`; targeted layout/auth/chat tests, frontend typecheck/build, lint и полный test-suite пройдены.
- Доработан первый маленький login redesign slice: на страницу входа добавлена PNG-шапка `main-header.png`, бренд перенесен в левый верх hero, email/password/login controls получили иконки, email hint удален; LoginPage regression, frontend typecheck/build, lint и полный test-suite пройдены.

## Recommended Next Step

- Задеплоить ветку `feature/login-header-polish` на production для ручной проверки login page на mobile/tablet, затем закрыть визуальный slice.
