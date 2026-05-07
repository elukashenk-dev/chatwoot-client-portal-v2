# Work Log

Короткая карта значимых завершенных шагов в `chatwoot-client-portal-v2`.

Детальные проверки, мелкие UI-polish правки, временные findings и промежуточные
эксперименты здесь не перечисляются.

## Product Baseline

- Создан отдельный проект `v2`: frontend, backend, docs, isolated Postgres, env/bootstrap tooling и базовый workspace.
- Собран рабочий portal baseline поверх Chatwoot: auth/session, registration, password reset, protected app shell, chat read model, text send, attachments, realtime и PWA foundation.
- Chat domain закреплен как backend-owned portal layer: browser не получает Chatwoot authority, а Chatwoot остается system of record для contacts, conversations, messages и attachments.
- Подготовлен production deployment baseline: Dockerfiles, production compose/Caddy, installer/runbook и webhook secret sync flow.
- Старый `../chatwoot-client-portal` снят с reference-scope и больше не используется как источник контекста.
- Продуктовая рамка уточнена: `v2` - брендируемый tenant-aware клиентский PWA-слой поверх Chatwoot для B2B-компаний.

## Multi-Tenant Program

- Принята multi-tenant архитектура: shared SaaS обслуживает много tenants одним portal deploy, dedicated install остается supported как один tenant в той же архитектуре.
- Production domain convention зафиксирован как `lk.<client-domain>`.
- `MT-0 Governance Update` завершен: single-tenant target model помечена superseded, глобальные Chatwoot runtime env запрещены как authority, старая branding/admin branch не мержится как есть.
- Зафиксированы ключевые MT-решения: tenant определяется по Host, `portal_tenants.mode` не добавляется, `hybrid` является только описанием deployment, password reset остается в `verification_records`, tenant admin verification в `MT-9` будет использовать отдельный encrypted per-tenant Chatwoot admin-verification token.
- `MT-1 Tenant Schema Foundation` завершен: добавлена `portal_tenants` модель, encrypted tenant secrets и bootstrap path для one-tenant/dedicated режима.
- `MT-2 Tenant Resolution Middleware` завершен: backend резолвит tenant по Host до auth/chat runtime, unknown host не fallback-ится в default tenant.
- `MT-3 Tenant-Aware Chatwoot Client` завершен: runtime Chatwoot config берется из current tenant, а не из глобальных `CHATWOOT_*` env.
- `MT-4 Tenant-Scoped Persistence` завершен: customer/chat-owned portal rows получили tenant scope.
- `MT-5 Tenant-Aware Customer Auth` завершен: login/session/registration/password-reset стали tenant-scoped.
- `MT-6 Tenant-Aware Chat Runtime` завершен: chat context, message send и realtime работают в tenant boundary.
- `MT-7 Tenant-Aware Webhooks And Provisioning` завершен: webhook signature, delivery bookkeeping и webhook setup стали tenant-aware.
- `MT-8 Tenant-Aware Frontend/PWA` завершен: frontend, document metadata, manifest, app identity и PWA assets стали tenant-aware.
- Post-MT runtime review закрыт: tenant URL/domain, portal inbox routing и webhook payload validation приведены к tenant-safe модели.
- Для `MT-9` зафиксировано решение по branding assets: metadata хранится в portal DB, файлы logo/PWA icon - в S3-compatible object storage; локально используется MinIO/compatible object storage, local-files fallback не делаем.
- Перед `MT-8.5`/`MT-9` добавлен `MT-8R Codebase Audit And Refactoring Readiness`: сначала audit/assessment, затем только выбранные bounded refactoring slices с targeted checks; broad "improve everything" refactor запрещен.
- Перед `MT-9` добавлен обязательный `MT-8.5 Portal UI/UX Baseline Review`: сначала утверждаем текущий customer-facing shell, brandable элементы и реальные preview screens для branding admin.
- Выполнен `MT-8R-1 Baseline Inventory And Safety Check`: создан `docs/MT_8R_CODEBASE_AUDIT.md`, зафиксирована карта backend/frontend/e2e areas, стабилизирован flaky tenant secret tamper test без production-code changes; backend tests/build/lint, frontend typecheck/tests/build, code-health/root lint, Prettier и `git diff --check` пройдены.
- Выполнен `MT-8R-2 Technical Debt Analysis`: зафиксирована module/test size map, dependency direction и candidate classification; создан deferred finding `F-MT-008` по production installer/compose global Chatwoot env до `MT-10`; broad refactoring не начинался.
- Выполнен `MT-8R-3 Code Smells Review`: детально проверены Chatwoot client boundary, email-code/password policy family, e2e tenant shape и frontend tenant route shell; создан finding `F-AUTH-002` по расхождению password reset backend policy; production-code refactoring не начинался.
- Выполнен `MT-8R-4 Refactoring Assessment`: утвержден единственный pre-`MT-9` code slice `MT-8R-5A Password Policy Alignment` для закрытия `F-AUTH-002`; Chatwoot client cleanup отложен внутрь `MT-9`, UI findings - в `MT-8.5`, production installer - в `MT-10`.
- Выполнен `MT-8R-5A Password Policy Alignment`: registration и password reset backend теперь используют единое правило пароля; `F-AUTH-002` закрыт и удален из `docs/Findings/`; backend targeted tests, full backend test, backend build и backend lint пройдены.
- Выполнен `MT-8R Final Review`: открытых `must-fix-before-MT-9` code findings не осталось; remaining findings назначены на `MT-8.5`, `MT-9`, `MT-10` или future focused experiments; переход к `MT-8.5 Portal UI/UX Baseline Review` разрешен.
- Выполнен старт `MT-8.5 Product UI Spec And Splash/Welcome Baseline`: создана спецификация branded UI-system, roadmap расширен под product UI/UX переработку, добавлены tenant bootstrap/lazy route splash и app loading/welcome screen; frontend tests/typecheck/build/lint, Prettier, `git diff --check` и root lint/code-health пройдены.
- Закрыт `F-CH-001`: app-level backend test helper вынесен из `backend/src/app.test.ts`, targeted backend app tests, backend build/lint и root lint/code-health пройдены; finding удален из `docs/Findings/`.
- Расширен `MT-8.5` UI/UX audit spec: добавлены screen-by-screen cleanup, brandable matrix, text limits, fallback logic, chat header/transcript/composer разбор, removal list и UI cleanup acceptance.
- Выполнен финальный polish `MT-8.5` UI cleanup spec: уточнены content ownership, system/security-sensitive copy, visual hierarchy, branding intensity, Chat Header left/center/right layout и account enumeration-safe password reset OTP copy.
- Уточнен `MT-8.5` UI cleanup readiness: accent color ограничен low-intensity ролью, header accent выключен по умолчанию, password reset OTP copy дополнительно смягчен, добавлен Implementation Done Checklist.
- Выполнен compatibility fix для Chatwoot `v4.13.0` API Channel webhook signing: tenant webhook sync теперь настраивает `Channel::Api` inbox `webhook_url` и сохраняет `channel_api.secret`; verifier покрыт `X-Chatwoot-*` headers и `{timestamp}.{raw_body}` HMAC; backend targeted/full tests, build, lint, root lint, Prettier и `git diff --check` пройдены.
- Локально после запуска Chatwoot `v4.13.0` API Channel webhook sync выполнен для `buhfirma`, `stroyfirma` и `zubi`; Chatwoot -> portal webhook deliveries, transcript fetch и SSE realtime smoke пройдены; `F-MT-009` закрыт архивацией local `default` tenant и проверкой отсутствия duplicate active API Channel inbox tuples.

## Current Baseline

- Локально заведены несколько tenants на одном portal deploy: `buhfirma`, `zubi`, `stroyfirma`.
- Текущий runtime baseline поддерживает shared SaaS модель и dedicated модель как один tenant.
- `ARCHITECTURE.md` приведен к текущему MT-8 baseline: оставлены устойчивые границы, runtime flows, data/API/repo shape и MT-9 deferrals.
- Docs smoke cleanup завершен: удален устаревший `docs/steps` screen-map, `README.md` обновлен под текущий multi-tenant baseline.
- Открытый архитектурный риск перед admin/branding: `F-MT-004` остается deferred до реализации `MT-9`, но стратегия уже выбрана.

## Recommended Next Step

- Вернуться к следующему согласованному product/UI scope после Chatwoot `v4.13.0` compatibility checkpoint.
