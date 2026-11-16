# Актуальный профиль и исторические подписи сообщений

Дата: 2026-11-16. Подтвержденный пользователем follow-up к profile/chat baseline.
Ветка: `fix/profile-current-contact-identity`.

## Требования и границы

- При замене сотрудника сохраняются portal user, связанный Chatwoot contact и
  корпоративный email для входа (подтверждено пользователем).
- Имя, телефон и аватар в профиле берутся из текущего связанного контакта
  Chatwoot; имя в списке участников группы использует тот же источник.
- Обновление видно при следующем открытии/перезагрузке соответствующей страницы.
  Постоянный polling и синхронизация через запись в portal DB не нужны.
- Старые групповые сообщения сохраняют author snapshot и текстовый префикс;
  новые сообщения и вложения используют текущее имя контакта. Собственные
  сообщения по-прежнему обозначаются «Вы». История не переписывается.
- Пустое/недоступное имя не подменяется именем прежнего сотрудника из auth
  snapshot. UI корректно показывает отсутствие имени.
- Backend сохраняет tenant/session/contact authority; frontend сохраняет
  существующие маршруты и read-only поля. API уже допускает nullable fullName.
- Миграций, новых зависимостей, изменения email/auth/session, Chatwoot core и
  production data нет. Визуальный выбор не нужен: это исправление источника
  данных существующих полей, а не новый UI.

## Риск и нагрузка

Средний runtime-риск: меняется источник display name, но не identity/access.
Profile использует существующие 1 link lookup + 1 Chatwoot contact request на
открытие. Group info использует уже полученные контакты, без дополнительных
reads, writes, внешних calls, fan-out или фоновых задач. Нулевая добавочная
нагрузка при 10x/100x; существующий tenant-wide обход в group info остается
отдельным открытым `F-SEC-007`.

Передача доступа не равна переименованию: password reset удаляет customer
sessions, доступ к общей почте должен принадлежать новому сотруднику. Открытый
`F-SEC-008` описывает сохранение push-подписок старых устройств после отзыва
сессий; этот slice не объявляет полную безопасную передачу устройств решенной.

## Последовательность и проверка

1. Regression tests: профиль до/после смены имени/телефона, пустой/недоступный
   контакт, свежие имена участников без дополнительных calls.
2. Исправить profile/group info reads и nullable имя во frontend.
3. Проверить старые/новые групповые сообщения, вложения, retry и историю после
   удаления ledger rows (fallback к сохраненному префиксу), не меняя send flow.
4. Targeted backend/frontend tests и Playwright профиль до/после обновления.
5. Review полного diff, исправления и повторная проверка findings; затем
   project tests, lint, build, formatting и diff-check на итоговом дереве.
6. Обновить устойчивые docs после closure. Подготовить release handoff с
   точным diff, проверками и ограничениями. Commit/merge/push и staged production
   prepare/activate выполняются после явного разрешения пользователя согласно
   AGENTS.md и production deployment runbook.

## Progress

- Entry audit выполнен; origin/main проверен через fetch, ветка создана от
  актуального main. Существующий untracked `.playwright-mcp/` не изменяется.
- Реализация завершена: current contact name в profile/group info; nullable
  имя безопасно отображается во frontend; auth snapshot не служит fallback.
- Independent focused review полного diff: замечаний нет. Targeted backend:
  105 tests passed; targeted frontend: 22 tests passed; Playwright profile:
  2 passed (real local auth/Postgres/Mailpit, mocked chat/profile HTTP responses).
  Backend regression использует real PGlite persistence/services и Chatwoot double.
- Lint/code-health и frontend/backend builds прошли; TypeScript annotations
  новых test doubles исправлены. Общий frontend suite: 846 passed. Первый общий
  backend прогон выявил одно старое ожидание registration name в app.profile.test;
  оно исправлено на null, targeted 2/2 passed. Повторный полный backend suite:
  927 passed, 3 штатно skipped (отдельный Postgres push-concurrency suite без
  PORTAL_POSTGRES_TEST_URL, вне затронутой области). Полный ops gate пройден:
  env upgrade, release records, все 99 staged deployment cases и deploy contracts.
  После 66 serial cases оставшиеся 33 выполнены параллельно в изолированных
  fixtures без исключения сценариев. Documentation contracts также прошли.
  Проверки на Node 24.22.1; неизменный frontend suite не дублируется.
- `F-CHAT-014` принят как adjacent existing finding: старый send key после
  rename получает conflict; новый send и обычный same-name retry работают,
  история не переписывается. Fix send contract не входит в этот slice.
- Production не изменен. По указанному пользователем инфраструктурному repo
  и read-only SSH подтвержден Timeweb `lancora@5.129.253.99`, здоровый backend
  и current release `4cf719e41b07a009214ea51504265c10648dafda` (база этой ветки).
  Старый Yandex остановлен; адреса в portal runbook актуализированы.
- Independent review release readiness выявил Important `F-OPS-008`, статус
  `accepted`: staged release требует отключенный на Timeweb Telegram bridge;
  текущему release также недостает полного rollback evidence после переноса.
  Пользователь согласовал отдельный следующий scope: выпуск/откат backend и web
  без запуска bridge. Prepare/activate заблокированы до реализации и review
  этого contract, восстановления проверяемого baseline и отдельного разрешения
  production операций. Удаление bridge из продукта остается будущей задачей.
- Незакоммиченные изменения принадлежат этому slice, кроме pre-existing
  `.playwright-mcp/`. Пользователь разрешил checkpoint commit, merge в main и
  push завершенного profile slice. Production recovery/prepare/activate еще
  не разрешены; git operations следующего release-contract scope также требуют
  отдельного разрешения после его closure.

## Handoff: согласованный следующий scope F-OPS-008

Пользователь подтвердил отказ от использования Telegram bridge сейчас; отдельная
ветка должна адаптировать выпуск backend/web, не удаляя bridge из продукта.
Independent design review подтвердил следующие обязательные границы:

- Новый явный portal-only release protocol связывает service set
  `portal-backend,portal-web` с manifest, build, image checks, readiness,
  diagnostics, cleanup и rollback. Compose запускает только эти сервисы и их
  зависимости; bridge не запускается, не останавливается и не удаляется.
- Обычный prepare не чинит поврежденное состояние. Отдельная операция
  восстановления baseline требует отдельного production approval, deploy lock,
  durable journal и exact-file resume; она не выполняет build/pull, миграции или
  запуск/перезапуск контейнеров. Источник — проверенный git archive точного SHA,
  образы — проверенные фактически работающие backend/web image IDs.
- Root source mirror восстанавливается из exact archive с сохранением runtime
  paths и проверкой существующего root-source invariant. Partial/conflicting
  recovery блокирует prepare. Source archive, manifest, marker и audit evidence
  публикуются только после полной проверки; произвольные файлы не перезаписываются.
- Timeweb runtime overlay `app.lancora.ru:host-gateway` для backend сохраняется
  как ограниченная каноническая release-owned конфигурация с digest. Проверяются
  live Docker ExtraHosts и rendered Compose при recovery/prepare/activate/rollback;
  произвольное копирование live Compose настроек не допускается.
- Read-only evidence на 2026-11-16: root содержит только `.release-state`,
  `.install`, `.releases`, `.env.production`; root marker/source mirror отсутствуют.
  Все 1061 tracked source files current release совпали по SHA-256 с Git,
  но полнота source tree должна быть заново проверена восстановлением, включая
  отсутствие неожиданных файлов. Current `compose.release.yaml` имеет два image
  tag и указанный extra_hosts; Docker подтвердил то же значение ExtraHosts.
- `previous=73a69da2589edabce1925689e4d00917e974c25c` указывает на отсутствующий
  release. Его нельзя считать rollback evidence: значение сохраняется в истории,
  а вывод из active state требует отдельного exact-SHA acknowledgement.
- Required gates: negative/fault/resume/rollback tests, отсутствие любых bridge
  lifecycle операций, сохранение host-gateway, exact image/source checks,
  bounded readiness/tenant smoke, rendered-Compose и локальная интеграционная
  проверка; независимое review всего final diff.
- После реализации отдельно согласуются git operations, recovery baseline,
  prepare и activate. Согласие на код не является согласием на production writes.
