# Full Application Risk Audit

## Executive Verdict

**Итог: NO-GO для подключения новых клиентов и расширения production на
зафиксированном commit
`a61b4975ae7b59e244c0b5bbc4efd02466aa075c`.**

Это не означает, что портал не работает или что аудит доказал взлом. Наоборот:
Critical-уязвимостей не найдено, новая валидированная High-уязвимость не
подтвердилась, сборка и 1 574 backend/frontend теста прошли. Но правила аудита
не позволяют заменить отсутствующее доказательство зелёными unit-тестами.
Безопасность эксплуатации и подключения новых клиентов пока нельзя подтвердить
из-за трёх границ с возможным High-влиянием:

1. conditional Deep Security Scan для `backend/` не дошёл до saturation,
   canonical validation и финального отчёта (`SEC-DEEP-001`);
2. нет внешнего доказательства off-host backup, заданных RPO/RTO и полного
   восстановления БД, объектов и ключей (`OPS-009`);
3. shared-SaaS ingress и tenant lifecycle не прошли production-like проверку;
   открытый [F-OPS-002](../../../findings/F-OPS-002-mt10a-domain-ingress-readiness.md)
   остаётся High-гипотезой.

До повторной оценки допустимы разработка, локальные проверки и обслуживание
текущего строго ограниченного окружения. Нельзя трактовать этот отчёт как
разрешение расширять production, обещать восстановимость или подключать новых
клиентов. Если уже есть production-пользователи, практическая мера — не
расширять контур и сначала получить backup/restore и ingress evidence; отчёт не
предписывает аварийно выключать работающий сервис.

Канонический итог: 71 строка ledger, из них 58 `validated`, 11
`needs_follow_up`, 2 `rejected`. После дедупликации это 56 активных
валидированных findings: **0 Critical, 0 High, 40 Medium и 16 Low**. Высокий
итоговый риск создают не скрытые подтверждённые дефекты, а перечисленные выше
не закрытые core/production proof gates.

## What Was Audited

Проверен весь portal v2 на одном неизменяемом commit: backend, frontend/PWA,
tenant resolution, customer/admin auth и sessions, Postgres schema/migrations,
Chatwoot API/webhooks/realtime/messages, attachments/avatars, push и offline
outbox, branding/legal/object storage, Telegram bridge, CI, Docker/Compose,
deploy/backup/restore, dependencies, документация и поведение при росте нагрузки.

Границы и фактическое покрытие перечислены в [coverage matrix](coverage-matrix.md).
Подробные evidence-отчёты находятся в [stages](stages/). Chatwoot рассматривался
как внешний сервис: его core, production runtime и production data не менялись.
Продуктовый код portal также не менялся.

Standard Codex Security Scan завершён и sealed. Он дал 19 канонических
findings: 9 Medium и 10 Low. Полный сгенерированный отчёт находился во
временном scanner worktree и намеренно не хранится в repository. Его результаты
импортированы в `F-SEC-001`–`F-SEC-019`; детали capability gate и
незавершённого Deep сохранены в [Stage 02](stages/02-security.md).

## What Was Dynamically Verified

На точном frozen source подтверждено:

- `pnpm lint` — PASS, включая code-health для 750 файлов;
- `pnpm build` — PASS;
- `pnpm test` — PASS: backend 125 файлов / 842 теста, frontend 127 файлов /
  732 теста, production env/ingress checks PASS;
- targeted admin-auth integration — 3/3 PASS;
- targeted service-worker background-sync — 8/8 PASS;
- локально запущенные backend/frontend отвечали: health и tenant endpoint —
  HTTP 200; после проверки процессы остановлены;
- bounded security PoC и query-plan probes, перечисленные в этапах 02–07,
  выполнены только на локальных синтетических данных.

Browser gate не зелёный. Все 28 разрешённых Playwright-сценариев остановились
до своих целевых assertions: 21 customer-тест использует старый password/
registration login contract, 7 admin-branding тестов не мокают обязательный
`/api/admin/legal-documents`. Ещё 11 Chatwoot-зависимых сценариев безопасно не
запускались: локальный Chatwoot и нужные fixture variables отсутствовали.
Точный command/evidence ledger находится в
[Stage 09](stages/09-dynamic-validation.md). Один full-suite timing failure
outbox-теста не повторился в четырёх isolated runs и оставлен как `DYN-002
needs_follow_up`, а не объявлен дефектом или PASS.

## Blocking Findings

В этой секции «blocking» означает blocker для итогового решения, а не
автоматически подтверждённую уязвимость.

| Blocker                                                                    | Что это означает простыми словами                                                                                                                     | Статус и техническое evidence                                                                                                 | Что закрывает blocker                                                                                                                                   |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SEC-DEEP-001`                                                             | Углублённая проверка backend остановлена после первого дорогого discovery round; девять расширенных candidate families не получили канонический итог. | `needs_follow_up`, High hypothesis; [Stage 02](stages/02-security.md#conditional-backend-deep-gate)                           | Использовать сохранённый merge, закончить saturation/validation/attack paths/report либо доказательно отвергнуть High-влияние каждой незакрытой family. |
| `OPS-009`                                                                  | Репозиторий не доказывает, что портал восстановится после потери VM/диска: локальный dump и volume недостаточны.                                      | `needs_follow_up`, High hypothesis; [Stage 07](stages/07-operations-supply-chain.md#backup-restore-and-failure-recovery)      | Зафиксированные RPO/RTO/retention, off-host copy, monitoring и успешное изолированное восстановление БД + объектов + ключей.                            |
| [F-OPS-002](../../../findings/F-OPS-002-mt10a-domain-ingress-readiness.md) | Shared-SaaS домены, TLS, сохранение Host и tenant lifecycle не доказаны в production-like окружении.                                                  | `needs_follow_up`, High hypothesis; [Stage 08](stages/08-existing-findings.md#f-ops-002-shared-saas-domain-ingress-readiness) | Сначала закрыть F-OPS-004, выбрать domain mode и выполнить disposable public rehearsal create → verify → webhook → reconcile → archive.                 |

Ни один из этих пунктов нельзя «закрыть документом»: нужны воспроизводимые
артефакты, runtime evidence и указанные acceptance gates.

## Non-Blocking Validated Findings

56 уникальных findings подтверждены кодом, reachable failure path и
counterevidence, но ни один отдельно не достиг Critical/High после canonical
validation. Они не отменяются этим статусом: Medium требуют плановой
ремедиации, Low — bounded hardening/maintenance.

| Группа                                                     |           Количество | Содержание и source of truth                                                                                                                                                                                                  |
| ---------------------------------------------------------- | -------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Security Standard                                          | 19: 9 Medium, 10 Low | Auth/session lifetime, SSRF redirect, secret permissions, upload/parser budgets и fanout/load; [Stage 02](stages/02-security.md#canonical-standard-findings) и `F-SEC-001`–`F-SEC-019`.                                       |
| Architecture/backend/integrations/frontend/load/operations | 34: 29 Medium, 5 Low | Уникальные proof tuples из Stages 00–07; полное соответствие candidate → finding в [Stage 10](stages/10-canonical-validation.md#canonical-outcome).                                                                           |
| Ранее существовавшие и повторно подтверждённые             |   3: 2 Medium, 1 Low | [F-AUTH-001](../../../findings/F-AUTH-001-rate-limit-shared-store.md), [F-CHAT-005](../../../findings/F-CHAT-005-frontend-attachment-validation.md), [F-OPS-001](../../../findings/F-OPS-001-apt-daily-chatwoot-realtime.md). |

Точные 40 Medium и 16 Low перечислены по одному scope в разделе
`Required Remediation Order`; [candidate ledger](candidate-ledger.md) хранит
evidence, counterevidence и validation action для каждой строки.

## Existing Finding Dispositions

Все десять файлов, существовавших до аудита, проверены повторно:

| Disposition     | Findings                                                                          | Решение                                                                                                                                                                                                                                                     |
| --------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| validated       | `F-AUTH-001`, `F-CHAT-005`, `F-OPS-001`                                           | Риск остаётся; три файла включены в 56 канонических findings.                                                                                                                                                                                               |
| needs follow-up | `F-CHAT-008`, `F-PWA-003`, `F-IOS-001`, `F-CHAT-UI-003`, `F-OPS-002`, `F-OPS-003` | Код и countercontrols уточнены, но закрытие требует device/deployment/product evidence. `F-PWA-003` в canonical ledger понижен с исходного High до Medium hypothesis.                                                                                       |
| superseded      | `F-E2E-001`                                                                       | Старый registration-fixture диагноз больше не соответствует продукту; актуальная проблема зарегистрирована как [F-E2E-002](../../../findings/F-E2E-002-customer-browser-auth-suite-stale.md). Старый файл сохранён до отдельного preservation-safe cleanup. |

История, ссылки и причины сохранения описаны в
[Stage 08](stages/08-existing-findings.md).

## Modernization Opportunities

Модернизация отделена от дефектов в
[modernization opportunities](modernization-opportunities.md). Возраст
библиотеки или привлекательность нового паттерна сами по себе не меняли
вердикт.

Сгенерированный security hardening portfolio предлагал две архитектурные темы:
generation-aware authority lifecycle и bounded work admission. Он находился в
том же временном scanner worktree и не является tracked deliverable. Выводы
сохранены в [modernization opportunities](modernization-opportunities.md), но
не заменяют прямые fixes. Практический порядок — сначала закрыть конкретные
findings, затем отдельным design scope решить, оправдана ли общая
архитектурная граница.

## Unverified Areas And Blockers

На frozen commit одиннадцать ledger rows имели статус `needs_follow_up`; скрытых
`candidate` или `validating` строк не было. После аудита `F-OPS-005` и
`F-OPS-006` закрыты staged deployment authority в коммите `0f08d31`, а
`F-DOC-001` — сверкой mandatory entry documentation. Эти три finding были
отдельными зарегистрированными `validated` rows, поэтому таблица ниже сохраняет
исходные одиннадцать follow-up rows.

| ID             | Уровень | Что не доказано                                  | Точный следующий шаг                                                                                                  |
| -------------- | ------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `SEC-DEEP-001` | High    | Backend Deep не получил каноническое завершение. | Продолжить существующий scan с сохранённых families, без повторного широкого discovery, и выпустить canonical report. |
| `OPS-009`      | High    | Off-host backup и полный restore.                | Провести изолированный restore drill с RPO/RTO, checksum/catalog и monitoring evidence.                               |
| `F-OPS-002`    | High    | Shared-SaaS ingress/lifecycle.                   | Закрыть F-OPS-004 и пройти public disposable rehearsal.                                                               |
| `ARCH-009`     | Medium  | Deployed proxy/trusted-forwarding contract.      | Проверить реальную proxy chain и negative Host/forwarded-header cases.                                                |
| `FRONT-005`    | Medium  | Other-thread push marker на installed/open app.  | Воспроизвести push/focus/visibility schedules и проверить unread projection.                                          |
| `FRONT-006`    | Medium  | Closed-app Android Background Sync.              | Пройти real-device close/lock/network-restore test с exactly-once key.                                                |
| `FRONT-007`    | Medium  | iOS keyboard/visual viewport.                    | Выполнить focused real-iPhone matrix без широкого viewport workaround.                                                |
| `F-OPS-003`    | Medium  | Operator model при росте tenant lifecycle.       | Выбрать CLI controls или audited wrapper до передачи non-engineer operators.                                          |
| `DYN-002`      | Low     | Один неповторившийся outbox test timing failure. | Инструментировать ordering и повторить under controlled schedule/load.                                                |
| `INT-005`      | Low     | Реальные Chatwoot latency/response-size budgets. | Измерить provider responses и закрепить timeout/byte limits.                                                          |
| `FRONT-008`    | Low     | Native audio layout на узких устройствах.        | Проверить representative iOS/Android/desktop native controls.                                                         |

Дополнительно Standard coverage оставляет deployment/provider/device proof
questions, перечисленные в
[Stage 02 limitations](stages/02-security.md#limitations-and-deferred-evidence).
Docker CLI, локальный MinIO и локальный Chatwoot в dynamic stage были
недоступны; существующий isolated Postgres и Mailpit были доступны. Эти
ограничения не переименованы в `No issue found`.

## Required Remediation Order

Каждая строка ниже — отдельный future scope. По правилам репозитория scope
начинается от актуального `main` после принятия audit checkpoint и использует
отдельную ветку с указанным prefix. Полный `acceptance` из finding-файла
обязателен; таблицы фиксируют минимальный test/runtime gate. Fixes в рамках
этого аудита не выполнялись.

### 0. Reassessment proof gates

1. Закрыть `SEC-DEEP-001` на существующих Deep artifacts; это audit/evidence
   scope, а не product fix.
2. Закрыть recovery evidence `OPS-009` в disposable environment.
3. Для High [F-OPS-002](../../../findings/F-OPS-002-mt10a-domain-ingress-readiness.md)
   сначала выполнить implementable prerequisite
   [F-OPS-004](../../../findings/F-OPS-004-production-env-propagation.md), затем
   public ingress/lifecycle rehearsal.

### 1. High operations closure and regression safety net

| Finding                                                                       | Branch prefix | Required tests                                         | Runtime acceptance gate                                                                                 |
| ----------------------------------------------------------------------------- | ------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| [F-OPS-004](../../../findings/F-OPS-004-production-env-propagation.md)        | `fix/ops-`    | production compose/env contract tests, lint/build      | Все required runtime variables реально доходят в соответствующий container; lifecycle wrapper проходит. |
| [F-E2E-002](../../../findings/F-E2E-002-customer-browser-auth-suite-stale.md) | `fix/e2e-`    | affected customer Playwright + auth unit/integration   | Все 21 текущих сценария проходят current email-code login и достигают своих целевых assertions.         |
| [F-CI-001](../../../findings/F-CI-001-critical-playwright-gate.md)            | `fix/ci-`     | workflow validation + bounded critical Playwright pack | Required CI check реально блокирует merge при поломке auth/session/chat critical path.                  |
| [F-E2E-003](../../../findings/F-E2E-003-admin-branding-legal-fixture.md)      | `fix/e2e-`    | 7 admin-branding Playwright scenarios                  | Fixture мокает актуальный legal contract; 7/7 доходят до branding assertions.                           |

### 2. Medium authority, session and data integrity

| Finding                                                                      | Branch prefix   | Required tests                                     | Runtime acceptance gate                                                                                |
| ---------------------------------------------------------------------------- | --------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [F-SEC-002](../../../findings/F-SEC-002-admin-code-attempt-rollback.md)      | `fix/security-` | backend transaction/integration                    | Неверный код durable увеличивает attempts и audit, даже когда API отвечает ошибкой.                    |
| [F-SEC-003](../../../findings/F-SEC-003-admin-role-recheck.md)               | `fix/security-` | admin-auth integration with role downgrade         | Downgrade между request/verify не создаёт session/cookie и оставляет audit denial.                     |
| [F-SEC-004](../../../findings/F-SEC-004-passwordless-resend-cooldown.md)     | `fix/security-` | passwordless integration across terminal states    | Invalid/expired/consumed proof не сбрасывает bounded resend cooldown.                                  |
| [F-SEC-005](../../../findings/F-SEC-005-password-reset-generation-fence.md)  | `fix/security-` | reset concurrency integration + saved PoC          | Старое verified continuation не работает после завершения более нового reset.                          |
| [F-SEC-006](../../../findings/F-SEC-006-sse-session-lifecycle.md)            | `fix/security-` | SSE integration for expiry/logout/deactivation     | Поток закрывается либо не получает message/typing после утраты authority.                              |
| [F-SEC-009](../../../findings/F-SEC-009-push-subscription-cardinality.md)    | `fix/security-` | subscription repository/integration + cap boundary | Один user не может превысить объявленный active-subscription limit; fanout bounded.                    |
| [F-SEC-010](../../../findings/F-SEC-010-attachment-prebuffer-limit.md)       | `fix/security-` | multipart integration + memory/admission probe     | Over-limit request отклоняется до полного 40 MiB buffering и внешнего вызова.                          |
| [F-SEC-018](../../../findings/F-SEC-018-chatwoot-redirect-ssrf.md)           | `fix/security-` | redirect-chain unit/integration + SSRF PoC         | Каждый redirect target заново валидируется; private/link-local destination не достигается.             |
| [F-SEC-019](../../../findings/F-SEC-019-secret-file-permissions.md)          | `fix/security-` | installer/ops permission test                      | Secret-файл создаётся сразу с restrictive mode; permissive intermediate state отсутствует.             |
| [F-AUTH-002](../../../findings/F-AUTH-002-admin-email-enumeration.md)        | `fix/auth-`     | admin request API unit/integration                 | Exists/non-exists/non-admin cases имеют одинаковый public contract и не раскрывают роль.               |
| [F-AUTH-004](../../../findings/F-AUTH-004-reset-delivery-generation-race.md) | `fix/auth-`     | reset delivery concurrency integration             | Ошибка доставки новой generation не возвращает к жизни предыдущий reset authority.                     |
| [F-AUTH-005](../../../findings/F-AUTH-005-admin-challenge-sending-lease.md)  | `fix/auth-`     | parallel request/send lease integration            | Для одной logical challenge один sender; timeout/retry не дублирует письмо бесконтрольно.              |
| [F-AUTH-006](../../../findings/F-AUTH-006-frontend-session-expiry.md)        | `fix/auth-`     | frontend state unit + Playwright expiry/logout     | Все открытые routes/state переходят в signed-out без stale protected UI.                               |
| [F-DATA-001](../../../findings/F-DATA-001-admin-auth-retention.md)           | `fix/data-`     | cleanup unit/integration + indexed batch plan      | Expired challenges/sessions очищаются bounded batches; audit retention следует утверждённой политике.  |
| [F-LEGAL-001](../../../findings/F-LEGAL-001-acceptance-version-binding.md)   | `fix/legal-`    | backend acceptance integration                     | Acceptance относится к точной активной версии; concurrent publish не подменяет согласованный документ. |
| [F-CHAT-009](../../../findings/F-CHAT-009-group-message-key-scope.md)        | `fix/chat-`     | two-user group send integration                    | Одинаковый client key у разных users не alias-ит message и не меняет attribution.                      |
| [F-DB-001](../../../findings/F-DB-001-drizzle-snapshot-lineage.md)           | `fix/db-`       | clean migration, replay, journal/snapshot checks   | Fresh DB и supported upgrade path дают одну schema без drift или destructive surprise.                 |

### 3. Medium message delivery, integrations and operations

| Finding                                                                      | Branch prefix       | Required tests                                       | Runtime acceptance gate                                                                            |
| ---------------------------------------------------------------------------- | ------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [F-CHAT-005](../../../findings/F-CHAT-005-frontend-attachment-validation.md) | `fix/chat-`         | composer unit + targeted Playwright upload/voice     | Предсказуемо невалидный файл отклоняется до upload; backend остаётся authority.                    |
| [F-CHAT-010](../../../findings/F-CHAT-010-source-id-recovery-window.md)      | `fix/chat-`         | recovery integration with older-than-20 overlap      | Source ID восстанавливается без duplicate/alias даже вне latest-20 окна.                           |
| [F-CHAT-011](../../../findings/F-CHAT-011-send-lease-external-effect.md)     | `fix/chat-`         | parallel send/lease integration                      | Один idempotency key создаёт не более одного внешнего Chatwoot side effect.                        |
| [F-INT-001](../../../findings/F-INT-001-chatwoot-webhook-reconciliation.md)  | `fix/integrations-` | missed/replayed webhook integration                  | Потерянный terminal webhook восстанавливается bounded reconciliation без дублей.                   |
| [F-TG-001](../../../findings/F-TG-001-telegram-effect-replay.md)             | `fix/telegram-`     | ambiguous Bot API response/replay integration        | Retry после неизвестного ответа не создаёт duplicate external effect.                              |
| [F-TG-002](../../../findings/F-TG-002-telegram-webhook-cutover.md)           | `fix/telegram-`     | cutover failure/rollback integration                 | Новый webhook считается активным только после подтверждения; старый путь восстанавливаем.          |
| [F-PROV-001](../../../findings/F-PROV-001-provisioning-single-owner.md)      | `fix/provisioning-` | parallel same-slug integration                       | Один owner выполняет external provisioning; остальные resume/read state.                           |
| [F-OPS-001](../../../findings/F-OPS-001-apt-daily-chatwoot-realtime.md)      | `fix/ops-`          | runbook/ops tests + controlled maintenance rehearsal | После OS/Redis maintenance Chatwoot web/worker и portal webhook/realtime проверены end-to-end.     |
| [F-SUPPLY-001](../../../findings/F-SUPPLY-001-production-advisory-gate.md)   | `fix/supply-chain-` | package audit policy + CI fixture                    | Неисключённая production advisory блокирует release; exception имеет owner и expiry.               |
| [F-SUPPLY-002](../../../findings/F-SUPPLY-002-immutable-build-inputs.md)     | `fix/supply-chain-` | workflow/container reproducibility checks            | Actions закреплены SHA, images digest; один portal commit не получает незаметно новый build input. |

### 4. Medium load, reliability and offline behavior

| Finding                                                                       | Branch prefix | Required tests                                           | Runtime acceptance gate                                                                       |
| ----------------------------------------------------------------------------- | ------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [F-LOAD-001](../../../findings/F-LOAD-001-admin-session-touch-writes.md)      | `fix/load-`   | repository/session integration + write-count assertion   | Touch writes coalesced с bounded interval; expiry/rotation semantics сохранены.               |
| [F-LOAD-002](../../../findings/F-LOAD-002-thread-bootstrap-transaction-io.md) | `fix/load-`   | transaction integration with slow Chatwoot fake          | External I/O не удерживает DB transaction/locks; resume остаётся idempotent.                  |
| [F-LOAD-003](../../../findings/F-LOAD-003-multi-instance-realtime.md)         | `fix/load-`   | two-instance realtime integration                        | При >1 replica событие достигает нужного stream независимо от instance affinity.              |
| [F-LOAD-004](../../../findings/F-LOAD-004-thread-refresh-amplification.md)    | `fix/load-`   | frontend/backend call-count tests                        | Refresh/reconnect имеет bounded DB/Chatwoot calls без N×threads amplification.                |
| [F-LOAD-005](../../../findings/F-LOAD-005-support-polling-amplification.md)   | `fix/load-`   | fake-timer/call-count tests                              | Polling deduplicated/cached с объявленным TTL и не масштабируется per tab без bound.          |
| [F-LOAD-006](../../../findings/F-LOAD-006-presence-throttle-state.md)         | `fix/load-`   | multi-tenant presence throttle tests                     | Throttle state bounded, tenant-scoped и предсказуем при 10× reconnects.                       |
| [F-LOAD-007](../../../findings/F-LOAD-007-maintenance-work-budget.md)         | `fix/load-`   | maintenance batch/retry integration                      | Job имеет batch/time budget, progress/idempotency и не сканирует всё в одном hot transaction. |
| [F-PWA-004](../../../findings/F-PWA-004-offline-retention-bounds.md)          | `fix/pwa-`    | IndexedDB quota/retention unit + installed-browser check | Cache/outbox cardinality и age bounded; cleanup не теряет pending durable sends.              |

### 5. Low findings

| Finding                                                                          | Branch prefix   | Required tests                                 | Runtime acceptance gate                                                                     |
| -------------------------------------------------------------------------------- | --------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| [F-API-001](../../../findings/F-API-001-parser-error-status-mapping.md)          | `fix/api-`      | route/parser unit + integration                | Клиентская parser/input ошибка получает стабильный 4xx, internal failure — 5xx.             |
| [F-AUTH-001](../../../findings/F-AUTH-001-rate-limit-shared-store.md)            | `fix/auth-`     | shared-store fake + two-instance limiter test  | До horizontal scaling лимит общий для route/tenant/IP и сохраняет `Retry-After`.            |
| [F-AUTH-003](../../../findings/F-AUTH-003-cookie-name-collision.md)              | `fix/auth-`     | config/cookie contract tests                   | Customer/admin cookie names различны и оба auth flows работают на одном host.               |
| [F-PWA-005](../../../findings/F-PWA-005-private-avatar-cache-purge.md)           | `fix/pwa-`      | cache unit + logout/account-switch Playwright  | Private avatar bytes удаляются при logout/user/tenant switch и не выдаются другой identity. |
| [F-SEC-001](../../../findings/F-SEC-001-login-normalized-email-index.md)         | `fix/security-` | migration/query integration + PostgreSQL plan  | Login miss использует tenant+normalized-email index seek с bounded work.                    |
| [F-SEC-007](../../../findings/F-SEC-007-group-info-call-amplification.md)        | `fix/security-` | integration call-count at large tenant fixture | Group-info path имеет bounded/batched calls, а не tenant-wide sequential fanout.            |
| [F-SEC-008](../../../findings/F-SEC-008-push-session-lifecycle.md)               | `fix/security-` | logout/expiry push integration                 | Expired/logged-out session не оставляет subscription, получающую новые metadata.            |
| [F-SEC-011](../../../findings/F-SEC-011-rate-limit-key-cardinality.md)           | `fix/security-` | rejected-label cardinality/load test           | Unauthorized labels не создают persistent/in-memory buckets; keyspace bounded.              |
| [F-SEC-012](../../../findings/F-SEC-012-webhook-dedupe-before-recipient-work.md) | `fix/security-` | duplicate webhook integration + work count     | Dedupe claim происходит до recipient/unread work; retry выполняет near-constant work.       |
| [F-SEC-013](../../../findings/F-SEC-013-realtime-fanout-backpressure.md)         | `fix/security-` | slow-client fanout/load test                   | Webhook ack и memory bounded; slow SSE client получает backpressure/drop policy.            |
| [F-SEC-014](../../../findings/F-SEC-014-push-fanout-backpressure.md)             | `fix/security-` | fanout queue/retry/load integration            | Accepted event создаёт bounded durable work с idempotency, queue limit и retry policy.      |
| [F-SEC-015](../../../findings/F-SEC-015-docx-parser-budgets.md)                  | `fix/security-` | compressed-expansion/parser budget tests       | Over-budget DOCX прекращается до unbounded allocation/CPU и получает controlled error.      |
| [F-SEC-016](../../../findings/F-SEC-016-pdf-parser-budgets.md)                   | `fix/security-` | page/object/text/time budget tests             | Over-budget PDF прекращается детерминированно без долгого shared-process monopolization.    |
| [F-SEC-017](../../../findings/F-SEC-017-branding-upload-race-cleanup.md)         | `fix/security-` | concurrent same-kind upload integration        | Concurrent uploads оставляют один active object/metadata и очищают проигравший side effect. |

После этих scopes архитектурные modernization options рассматриваются отдельно;
они не должны превращать локальные fixes в один рискованный rewrite.

## Conditions For Reassessment

Повторная оценка должна использовать новый immutable commit и завершиться до
подключения клиентов. Минимальные условия:

1. `SEC-DEEP-001` закрыт canonical Deep report либо доказательным disposition
   всех plausibly High families.
2. `OPS-009` закрыт успешным off-host restore rehearsal с утверждёнными
   RPO/RTO/retention и monitoring.
3. F-OPS-004 исправлен, затем F-OPS-002 подтверждён или закрыт public
   production-like ingress/lifecycle rehearsal.
4. F-E2E-002, F-CI-001 и F-E2E-003 закрыты; intended Playwright assertions
   реально выполняются. Chatwoot-зависимые 11 сценариев запускаются только на
   безопасном локальном/disposable fixture.
5. Для оставшихся Medium/Low рисков записаны владельцы, порядок и явные
   operational limits. До F-AUTH-001/F-LOAD-003 сохраняется single-backend
   topology; любые numeric 10×/100× limits задаются после измерений, а не
   выдумываются этим отчётом.
6. На новом baseline повторяются lint, build, full unit/integration, production
   ops gates, targeted Playwright и security delta review. Passing tests не
   отменяют незакрытый blocker.

Выполнение этих условий не предрешает `GO`: оно даёт достаточное evidence для
механической повторной классификации в `NO-GO`, `GO with conditions` или `GO`.

## Evidence And Artifact Map

| Artifact                                                                        | Назначение                                                   |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [Audit manifest](manifest.md)                                                   | Frozen commit, runtime boundaries и статус этапов.           |
| [Coverage matrix](coverage-matrix.md)                                           | Все in-scope поверхности, outcome, evidence и limitations.   |
| [Candidate ledger](candidate-ledger.md)                                         | 71 canonical disposition с failure path/counterevidence.     |
| [Canonical validation](stages/10-canonical-validation.md)                       | Dedupe, 53 finding receipts и итоговые counts.               |
| [Dynamic validation](stages/09-dynamic-validation.md)                           | Команды, PASS/FAIL/BLOCKED browser/runtime evidence.         |
| [Security review](stages/02-security.md)                                        | Standard report, Deep gate и proof gaps.                     |
| [Existing finding review](stages/08-existing-findings.md)                       | Revalidation и preservation decisions.                       |
| [Modernization opportunities](modernization-opportunities.md)                   | Необязательные обновления и архитектурные hardening choices. |
| [Approved design](../../specs/2026-07-13-full-application-risk-audit-design.md) | Scope, severity и verdict rules.                             |
| [Execution plan](../../plans/2026-07-13-full-application-risk-audit.md)         | Выполненный staged process и completion gates.               |

Все выводы относятся только к frozen commit. Audit branch не merge, не push и
не deploy; выбор и запуск первого fix scope требует отдельного решения
пользователя.
