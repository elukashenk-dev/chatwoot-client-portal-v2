# Work Log

Короткая карта значимых внедренных шагов в `chatwoot-client-portal-v2`.

- Создан отдельный проект `v2` рядом со старым порталом: новый frontend, backend, isolated Postgres, env/bootstrap tooling и базовая структура workspace.
- Поднят frontend foundation на `React + TypeScript + Vite + Tailwind CSS`: auth shell, router, login UI, PWA shell и базовые UI-компоненты.
- Поднят backend foundation на `Fastify + TypeScript + Zod + PostgreSQL + Drizzle`: health endpoint, auth infrastructure, migrations и database bootstrap.
- Реализована DB-backed cookie session auth: login, logout, current user endpoint, protected/public route behavior и локальное создание portal user через backend CLI.
- Реализован `Phase 2. Registration Flow`: Chatwoot contact eligibility, email verification через SMTP/Mailpit, continuation token, password setup и создание portal user.
- Registration flow сохраняет durable связь `portal_user -> Chatwoot contact` и выравнивает password policy на frontend/backend.
- Реализован `Phase 3. Password Reset`: request, verify, continuation-token set-password, generic response без account disclosure и invalidation старых sessions после смены пароля.
- Реализован `Phase 4. Protected App Shell`: auth-session bootstrap через backend, protected `/app/*` routes, public auth redirects, logout UX и app shell для `/app/chat`.
- Реализован `Phase 5. Chat Read Model`: backend-owned chat context/messages endpoints, Chatwoot linked contact resolution, primary conversation selection, durable conversation mapping и bounded older-history pagination.
- `/app/chat` переведен на controlled chat states: loading, not ready/unavailable, ready transcript, attachment cards и загрузка старой истории.
- Принята chat-routing модель: портал работает с одним authoritative primary Chatwoot conversation на portal contact; durable mapping остается основой read/send/realtime routing.
- Реализован `Phase 6. Text Send And First Conversation Bootstrap`: backend-owned text send, composer на `/app/chat`, first conversation bootstrap от первого сообщения пользователя и send через mapped primary conversation.
- Добавлен durable send ledger `portal_chat_message_sends` для idempotency, retry/replay и recovery по Chatwoot `source_id`.
- Chatwoot integration расширена созданием portal contact inbox, conversation bootstrap и customer-authored text message create через account API без browser Chatwoot authority.
- Chat transcript приведен к целевому UI: группировка подряд идущих сообщений, author labels, day dividers, bubble styling, composer autoresize и устойчивое поведение прокрутки.
- Реализован `Phase 7. Attachment Send`: single-file composer flow, backend multipart endpoint, отправка customer-authored attachment в Chatwoot и отображение вложений в transcript.
- Attachment send использует durable send ledger с отдельным `messageKind = attachment`, payload hash по файлу и backend validation для размера/MIME type.
- Реализован `Phase 8. Realtime`: signed Chatwoot webhook intake, delivery dedupe ledger, mapping-based route resolution, SSE hub/endpoint и frontend EventSource merge новых сообщений.
- Chatwoot webhook path доведен до воспроизводимого local setup: documented callback `/api/integrations/chatwoot/webhooks/account`, account webhook provisioning script и синхронизация local webhook secret.
- Roadmap усилен отдельными фазами `Phase 9. PWA App Hardening` и `Phase 10. Push Notifications` с обязательными шагами для installed PWA, reconnect/offline behavior и push-уведомлений.
- Добавлен quick emoji bar в chat composer: горизонтальная лента быстрых фраз с emoji, вставка в текущую позицию курсора и возврат фокуса в текстовое поле.
- Добавлен reply state для чата: выбор сообщения для ответа, отправка Chatwoot `content_attributes.in_reply_to` и отображение quoted preview у сообщений пользователя и агента.
- Reply UX приведен к app-like поведению: mobile swipe-to-reply без конфликта с вертикальной прокруткой, desktop context menu с reply/copy и без постоянных стрелок у сообщений.
- Реализован `VoiceRecordButton`: запись микрофона через browser `MediaRecorder`, отправка голосового как backend-owned audio attachment и playback audio-вложений в transcript.
- Voice send покрыт frontend mocked microphone tests, backend audio attachment authority test и ручной runtime-проверкой микрофона в браузере.
- Закрыт review finding по composer error state: ошибка микрофона больше не маскирует следующую ошибку text/file send.
- Закрыт code-health checkpoint перед следующими крупными фичами: добавлен root `pnpm code-health`, `pnpm lint` теперь валит рост oversized `ts/tsx` файлов и фиксирует baseline allowlist для уже существующего debt.
- Chat UI разрезан на меньшие domain-local части: `MessageComposer.tsx` доведен до `457` строк через локальные subcomponents и `useVoiceRecorder`, `ChatTranscript.tsx` - до `303` строк через `MessageBubble`/`MessageContextMenu`/attachment-reply helpers.
- В архитектурные документы внесены правила feature-based роста для будущих областей `dashboard`, `notifications`, `branding`, `tariff`, `documents`, `tasks`, `service-requests` и `profile`, а `shared/` зафиксирован как строго недоменный слой.
- Начат `Phase 9. PWA App Hardening`: service worker переведен на controlled update flow без принудительного `skipWaiting`, добавлен app update banner, chat получил явное offline/reconnect-resync поведение, а manual checklist вынесен в `docs/PWA_HARDENING_CHECKLIST.md`.
- Зафиксирован rollout notifications после PWA hardening: сначала in-app unread/badges/preferences, затем browser push поверх укрепленного service worker lifecycle.
- Закрыты review findings по текущему `Phase 9` slice: expired backend-session при resume/reconnect теперь переводит пользователя обратно в auth flow вместо stale chat error, а PWA update banner учитывает top safe area.
- Исправлен runtime-gap в offline UX installed PWA: chat теперь сам переключается в offline-состояние после сетевой ошибки запроса, даже если браузер не прислал `offline` event, и возвращается через lifecycle resync; сценарий закрыт frontend runtime regression tests.
- Закрыт `F-PWA-003`: offline warning перенесен в область composer и подтвержден ручной installed-PWA проверкой на production VM; warning виден без прокрутки, а отправка блокируется сразу после потери сети.
- Добавлен production service-worker revision stamp: `frontend build` теперь подставляет уникальный revision в `dist/sw.js`, чтобы installed PWA обнаруживал новый deploy и показывал update flow вместо тихого удержания старого JS cache.
- App shell для protected `/app/*` переведен на fixed `100dvh` layout: composer больше не должен выталкиваться ниже installed-PWA viewport при поступлении новых realtime messages; transcript остается единственной scroll-зоной.
- Убран chat lifecycle resync по `window.focus`: в Windows installed PWA фокус textarea мог раз в 15 секунд запускать refresh и давать краткий visual jump ленты; reconnect/resume остается на `online` и `visibilitychange`.
- В текущую ветку возвращен production deployment baseline: Dockerfiles, production compose/Caddy, terminal installer, Chatwoot webhook secret sync core, GitHub Actions deploy scaffolding и production runbook/session log.
- Добавлен archive-based VM update helper `scripts/deploy-production-archive.sh`: он упаковывает текущий working tree, доставляет его на VM, сохраняет `.env.production`/`.install`/`logs`/`backups` и при необходимости сразу пересобирает stack и запускает webhook secret sync.
- Старый `../chatwoot-client-portal` снят с reference-scope: правила и устойчивые документы теперь запрещают читать, запускать или использовать старый портал как source of truth для `v2`.
- Закрыт `F-CHAT-001`: optimistic text send подтвержден frontend regression tests и ручной production-проверкой; composer очищается сразу, pending/failed/retry состояния работают без duplicate messages.
- Закрыты `F-DEPLOY-001` и `F-DEPLOY-002`: GitHub production deploy теперь валидирует deploy ref и передает remote args без shell interpolation, а archive helper фильтрует local/nested env files перед упаковкой текущего worktree.

## Recommended Next Step

- После зеленых targeted auto-checks сделать `Phase 9` checkpoint commit на текущей ветке.
