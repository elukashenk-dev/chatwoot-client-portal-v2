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

## Current Baseline

- Локально заведены несколько tenants на одном portal deploy: `buhfirma`, `zubi`, `stroyfirma`.
- Текущий runtime baseline поддерживает shared SaaS модель и dedicated модель как один tenant.
- `ARCHITECTURE.md` приведен к текущему MT-8 baseline: оставлены устойчивые границы, runtime flows, data/API/repo shape и MT-9 deferrals.
- Docs smoke cleanup завершен: удален устаревший `docs/steps` screen-map, `README.md` обновлен под текущий multi-tenant baseline.
- Открытый архитектурный риск перед admin/branding: `F-MT-004` остается deferred до реализации `MT-9`, но стратегия уже выбрана.

## Recommended Next Step

- Перейти к `MT-8R-2 Technical Debt Analysis`: read-only анализ module size, dependency direction, coverage distribution, duplicate tenant/runtime logic и fragile provisioning/local-dev paths; refactoring не начинать до классификации candidates.
