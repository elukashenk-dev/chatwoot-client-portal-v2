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
- Доведен chat UX baseline: grouped transcript, day dividers, stable scroll behavior, reply state, quick emoji bar, voice recording/audio send, copy/reply context menu и mobile swipe-to-reply.
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

## Recommended Next Step

- Протестировать chat UI polish на production: длинные/reply bubbles, avatar/header styling, composer typing-mode transition, attachment caption send и базовую отправку файла/голоса без подписи.
