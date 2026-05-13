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
- Production Chatwoot CE обновлен до `v4.13.0`; опыт upgrade, backup, custom patch переноса, assets build pressure и post-upgrade checks зафиксирован в `docs/CHATWOOT_4_13_PRODUCTION_UPGRADE_NOTES.md`.
- Подготовлен `MT-10` production clean reinstall flow для portal `v2`: production compose/install переведены на `PORTAL_TENANT_SECRET_KEY` и `DEFAULT_TENANT_*`, tenant bootstrap/verify/webhook scripts подключены в installer, runbook создан в `docs/MT_10_PRODUCTION_CLEAN_REINSTALL_RUNBOOK.md`; `F-MT-008` закрыт и удален.
- Закрыт `F-MT-010`: MT-10 docs и installer теперь явно отделяют запрещенные изменения Chatwoot core/DB/services от разрешенной tenant API Channel настройки; перед API Channel changes добавлен installer approval gate.
- Закрыт `F-MT-011`: production archive deploy теперь блокирует неявный dirty worktree deploy, разрешает WIP device-preview только через `--allow-dirty-preview` + `--preview-label`, и пишет `DEPLOY_SOURCE.txt` в архив.
- Выполнен финальный `MT-10` readiness review: runbook/installer/deploy-helper сверены, `/opt` app path creation через deploy-helper исправлен, compose config, tenant script tests, backend build, frontend build, Prettier и `git diff --check` пройдены.
- Выполнен `MT-10` production clean reinstall portal `v2` на `lk.provgroup.ru`: старый portal runtime удален, новый tenant-aware stack поднят как dirty preview `mt-8-5-auth-ui-mobile`, tenant `provgroup` создан, Chatwoot API Channel inbox `5` verified/configured, HTTPS/public health/tenant/PWA manifest/auth screens проверены.
- Production SMTP для portal `v2` переключен на Yandex 360 `cbr@provgroup.ru`; backend контейнер пересоздан, SMTP verify прошел, пользователь подтвердил успешную регистрацию и отправку кода.
- `MT-8.5` login production-preview polish задеплоен на `lk.provgroup.ru` как `mt-8-5-login-polish-1`: auth-поля снижены по высоте, links упрощены без иконок, нижний info-блок обновлен под телефонный запрос доступа.
- `MT-8.5` login spacing preview задеплоен на `lk.provgroup.ru` как `mt-8-5-login-spacing-2`: vertical spacing между login-полями уменьшен до `space-y-4`, верхний padding auth content убран.
- `MT-8.5` login visual preview задеплоен на `lk.provgroup.ru` как `mt-8-5-login-visual-3`: auth header image switched to `contain`, login fields/icons reduced, CTA icon removed, secondary links softened, access phone copy updated and marked brandable in spec, footer art softened and offset from bottom.
- `MT-8.5` auth viewport lock preview задеплоен на `lk.provgroup.ru` как `mt-8-5-auth-viewport-lock`: auth frame переведен на fixed viewport lock, document/body scroll removed, overscroll locked inside auth panel.
- `MT-8.5` auth footer edge preview задеплоен на `lk.provgroup.ru` как `mt-8-5-auth-footer-edge`: footer art returned to `bottom-0` so the visual background reaches the viewport edge while body/document scroll remains locked.
- `MT-8.5` iPhone/header spacing preview задеплоен на `lk.provgroup.ru` как `mt-8-5-iphone-header-spacing`: viewport now includes `viewport-fit=cover`, initial/body background is white for iOS safe-area, login links increased by 1px, auth header shell heights reduced for `contain` artwork.
- `MT-8.5` header cover restore preview задеплоен на `lk.provgroup.ru` как `mt-8-5-header-cover-restore`: auth header artwork returned to `background-size: cover` while viewport lock, iOS safe-area background and reduced header heights remain in place.
- `MT-8.5` login bottom flex preview задеплоен на `lk.provgroup.ru` как `mt-8-5-login-bottom-flex`: login access info panel now uses flexible bottom alignment instead of absolute positioning, with auth content bottom padding adjusted for safe-area.
- `MT-8.5` auth scroll parent preview задеплоен на `lk.provgroup.ru` как `mt-8-5-auth-scroll-parent`: fixed viewport lock remains, but auth overflow now scrolls on the outer auth panel instead of clipping content inside the auth shell.
- `MT-8.5` login contact card preview задеплоен на `lk.provgroup.ru` как `mt-8-5-login-contact-card`: login subtitle updated, intro line-height reduced to `leading-6`, and bottom access info redesigned as a phone contact card.
- `MT-8.5` compact login contact card preview задеплоен на `lk.provgroup.ru` как `mt-8-5-login-contact-card-compact`: bottom access card reduced to a two-line layout with smaller icon, padding and support phone copy.
- `MT-8.5` login field/validation/phone preview задеплоен на `lk.provgroup.ru` как `mt-8-5-login-field-validation-phone`: filled field highlight made robust for PWA/autofill, email format error hidden while actively typing, support phone made clickable via `tel:`.
- `MT-8.5` filled field background preview задеплоен на `lk.provgroup.ru` как `mt-8-5-filled-field-bg`: filled auth inputs now restore the subtle background color, including a WebKit autofill inset fallback.
- `MT-8.5` contact card radius preview задеплоен на `lk.provgroup.ru` как `mt-8-5-contact-card-radius`: bottom phone card corner radius aligned with login fields and CTA (`0.6rem`).
- `MT-8.5` registration request first pass preview задеплоен на `lk.provgroup.ru` как `mt-8-5-register-request-first-pass`: registration request title/copy, fields, helper card, CTA spacing and single login return link aligned with the accepted login baseline.
- `MT-8.5` registration helper copy preview задеплоен на `lk.provgroup.ru` как `mt-8-5-register-helper-profile-copy`: registration request helper now tells users to enter the email specified when their profile was created.
- `MT-8.5` registration error copy/tone preview задеплоен на `lk.provgroup.ru` как `mt-8-5-register-error-copy-tone`: contact-not-found copy now points to support phone, error alert tone is calmer and backend/frontend targeted checks passed.
- `MT-8.5` registration/login error softening preview задеплоен на `lk.provgroup.ru` как `mt-8-5-register-error-softening`: empty required field copy hidden for registration, required fields still highlight softly, alert errors use normal red text, and support phone in alert is clickable.
- `MT-8.5` registration helper font preview задеплоен на `lk.provgroup.ru` как `mt-8-5-register-helper-font`: registration helper card text increased from 13px to 14px and production smoke confirmed the computed font size.
- `MT-8.5` muted alert red preview задеплоен на `lk.provgroup.ru` как `mt-8-5-alert-muted-red`: registration error alert switched from saturated rose to muted red text, pale border/background and softer phone underline.
- `MT-8.5` password reset request preview задеплоен на `lk.provgroup.ru` как `mt-8-5-password-reset-request`: request screen aligned with auth baseline, copy made enumeration-safe, email field/icon/helper updated, empty email copy hidden, competing `Новый аккаунт` link removed.
- `MT-8.5` password reset OTP preview задеплоен на `lk.provgroup.ru` как `mt-8-5-password-reset-otp`: confirmation screen now uses enumeration-safe copy, compact OTP cells, auth helper styling, quiet resend/change-email actions, and closes/removes `F-AUTH-001`.
- `MT-8.5` password reset OTP bottom preview задеплоен на `lk.provgroup.ru` как `mt-8-5-password-reset-otp-bottom`: separate resend countdown block removed, cooldown now appears inline as `Повторить через MM:SS`.
- Production PWA cache headers updated for preview loop: `index.html`/SPA routes now use `Cache-Control: no-store`, `/sw.js` uses no-cache/no-store, hashed assets use immutable cache, and missing assets return 404 instead of SPA fallback.
- `MT-8.5` registration OTP refresh preview задеплоен на `lk.provgroup.ru` как `mt-8-5-register-otp-refresh`: `/auth/register/verify` now uses updated OTP layout, compact cells, hidden visible label, refreshed helper copy, inline resend cooldown and no old `Мы отправили...` copy.
- Оформлен `F-AUTH-002`: registration/password-reset OTP screens currently duplicate the same visual layout and should be unified into one shared OTP verification layout to prevent future drift.
- Закрыт `MT-8.5` `F-AUTH-002`: registration/password-reset OTP forms now share `OtpVerificationFormLayout` and shared resend countdown helper; finding removed, auth tests/typecheck/frontend build passed, production preview `mt-8-5-shared-otp-layout` smoke checked both OTP routes.
- `MT-8.5` set-password layout preview задеплоен на `lk.provgroup.ru` как `mt-8-5-set-password-layout`: registration/password-reset set-password screens now share `PasswordSetupFormLayout`, password rules match auth styling, duplicate pre-success links removed, auth tests/typecheck/frontend build and production smoke passed.
- `MT-8.5` chat header compact preview задеплоен на `lk.provgroup.ru` как `mt-8-5-chat-header-compact`: header now follows the accepted customer-support pattern with burger placeholder navigation, tenant mark restored to compact chat-header scale, brandable future support title, assignee subtitle without `Агент:`, online status and chat action menu; `Завершить диалог` uses the existing logout flow, targeted chat/auth tests, typecheck, frontend build, `git diff --check` and production health/asset smoke passed.
- `MT-8.5` transcript bubble compact preview задеплоен на `lk.provgroup.ru` как `mt-8-5-transcript-bubble-compact-radius`: message bubbles keep the current width but use smaller vertical padding, `0.7rem` radius and `0.3rem` tail corners; targeted chat tests, typecheck, frontend build, `git diff --check` and production health/asset smoke passed.

## Current Baseline

- Локально заведены несколько tenants на одном portal deploy: `buhfirma`, `zubi`, `stroyfirma`.
- Текущий runtime baseline поддерживает shared SaaS модель и dedicated модель как один tenant.
- `ARCHITECTURE.md` приведен к текущему MT-8 baseline: оставлены устойчивые границы, runtime flows, data/API/repo shape и MT-9 deferrals.
- Docs smoke cleanup завершен: удален устаревший `docs/steps` screen-map, `README.md` обновлен под текущий multi-tenant baseline.
- Открытый архитектурный риск перед admin/branding: `F-MT-004` остается deferred до реализации `MT-9`, но стратегия уже выбрана.

## Recommended Next Step

- Проверить compact transcript bubbles на реальном устройстве; затем решить, трогаем ли ширину/цвет bubbles или переходим к следующей зоне чата.
