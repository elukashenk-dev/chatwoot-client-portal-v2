# Portal-only release и восстановление Timeweb baseline

Дата: 2026-11-16. Пользователь согласовал F-OPS-008 и переход к обновлению портала.
Ветка: `fix/ops-portal-only-staged-release`, база `b4e2147` из main/origin/main.
Profile slice завершен, reviewed, merged и pushed отдельно.

## Contract

- Высокий риск: deployment, immutable release evidence, rollback и runtime
  networking. Browser/auth/session/database contracts не меняются; визуальный
  выбор не нужен. Telegram bridge остается в продукте, но не участвует в выпуске.
- Версия staged protocol 2, фиксированный service set
  `portal-backend,portal-web`. Этот набор проверяется в manifests, build,
  readiness, diagnostics, cleanup и rollback; неизвестные наборы отклоняются.
- Только explicit backend/web compose lifecycle operations и существующие
  зависимости. Ни запуск, ни остановка, ни удаление bridge не разрешены.
- Каноническая host-gateway настройка backend сохраняется и проверяется по
  live Docker и rendered Compose; checksum связывает runtime configuration с
  release evidence. Нельзя автоматически принимать произвольный live override.
- Отдельный `recover-baseline` восстанавливает exact archive, root source mirror,
  manifest и marker из проверенного current SHA без build/pull/migrations и без
  запуска сервисов. Обычный prepare никогда не исправляет неполное состояние.
- Recovery выполняется под deploy lock с durable journal и проверяемым resume.
  Существующие файлы допускаются только при точном совпадении; runtime paths
  защищены. Неполное/конфликтное восстановление блокирует prepare/activate.
- Отсутствующий previous release можно исключить из active state только по
  явному exact-SHA acknowledgement, сохранив исходный указатель в audit evidence.
- Production recovery, prepare и activate остаются отдельными операциями с
  конкретным проверенным результатом перед переключением; никаких ручных
  обходов staged authority или скрытого изменения production environment.

## Проверенный исходный runtime

Timeweb `lancora@5.129.253.99`; источник operational truth — соседний
`lancora-production-infrastructure`. Current
`4cf719e41b07a009214ea51504265c10648dafda`, previous
`73a69da2589edabce1925689e4d00917e974c25c` (его release directory отсутствует).
Root содержит `.release-state`, `.install`, `.releases`, `.env.production`;
root marker/source mirror и current manifest/archive отсутствуют. 1061 tracked
source files совпали с Git; recovery повторно проверяет весь tree, включая extras.
Current override и Docker ExtraHosts содержат `app.lancora.ru:host-gateway` только
для backend. Backend/web работают, bridge images/containers отсутствуют.

## Load model

Изменения выполняются только по команде оператора, вне request/message hot path.
Один deploy lock; два app services; прежние bounded readiness deadlines,
максимум 100 tenants, пять smoke workers и три attempts сохраняются. Recovery
делает ограниченный source-tree обход и два image/container inspect; не вводит
polling, фоновых jobs или запросов в Chatwoot DB. Runtime нагрузка не растет.

## Verification и порядок

1. RED tests для двухсервисного prepare/activation/rollback и отсутствия bridge
   effects. Обновить весь protocol contract одновременно, без compatibility shim.
2. Recovery tests: missing/conflicting evidence, source/archive/image/overlay
   drift, symlinks/extras, previous acknowledgement, interruption/resume,
   отсутствие runtime mutation и сохранение protected paths.
3. Rendered-Compose проверка, fault/rollback cases и независимый review полного
   diff. Critical/Important findings исправляются одной волной с re-review.
4. Полный ops gate (изолированные case selections можно запускать параллельно),
   docs/lint/build/diff checks; unchanged backend/frontend coverage из b4e2147
   сохраняется, новые runtime изменения требуют соответствующего расширения.
5. Отдельный checkpoint commit/merge/push после closure; затем конкретный
   recovery handoff с exact SHA/image IDs/previous retirement, prepare и activate.

## Progress

- Read-only investigation и independent design review завершены; согласован
  explicit root mirror вместо ослабления root-source invariant.
- Реализация protocol 2 и explicit recovery завершена. Independent review и
  re-review закрыли Important F-OPS-009 (единые protected root paths). Targeted
  recovery/drift/resume/network/rollback tests и реальный Compose render прошли.
  Все 104 staged cases прошли на неизменном final implementation; пять старых
  ожиданий harness (protocol version, explicit services, ранний отказ при duplicate
  active service) адаптированы и соответствующие selections повторены успешно.
  Env-upgrade, records, deploy/docs contracts, Node 24.22.1 lint/build,
  formatting и diff checks прошли. Frontend/backend/package inputs неизменны
  относительно полностью проверенного profile commit b4e2147.
- F-OPS-008 закрыт реализацией и проверками; F-OPS-009 закрыт фиксом и independent
  full-diff re-review. Их активные finding files удалены; этот план и canonical
  production runbook сохраняют исходные требования и дальнейшие rollout steps.
- Свежий read-only audit: все 1195 файлов/каталогов source совпадают с Git,
  включая отсутствие extras/symlinks и executable modes. Docker Compose
  `2.40.3+ds1-0ubuntu1~24.04.1`; root mode750, releases/current mode755
  (recovery сужает release-evidence directories до700 после journal).
- Текущие image IDs: backend
  `sha256:e1312dde56eccadd8e4ba279367c1a1a4004c780b33b56400ebc968a7f04896c`, web
  `sha256:36c25d7b0d6ec770d0878468060994763c3921ad4b913cfceb5953c3b9ceda8f`.
- Пользователь согласовал git → восстановление → prepare. Ops commit `18a07a8`
  merged/pushed. Recovery отказал до создания journal: мигрированный сервер
  сохранил восемь protocol-1 outcome records, а первая реализация требовала
  пустой history. Current/previous, контейнеры и runtime остались прежними.
- Bounded repair сохраняет закрытые старые outcomes в `recovery/history/` с
  checksum inventory в journal; активные protocol-2 readers их не используют.
  Decisions остаются пустыми; поврежденные/critical records блокируют recovery.
  Запись архива create-only, durable до удаления исходника; checksum повторно
  проверяется перед удалением. Частичное архивирование возобновляется точно.
  Independent review R1 принят и исправлен; full-diff re-review не оставил
  Critical/Important findings. Targeted preservation/resume/tamper/race/lock
  checks прошли; реальная read-only проверка приняла все восемь server records,
  root source subset, canonical override и текущие container image IDs.
  Полный gate: 107 staged scenarios на frozen final scripts, env-upgrade,
  records, deploy/docs contracts, real Compose render, Node 24.22.1 lint/build,
  formatting и diff checks завершены успешно. F-OPS-010 закрыт; требования
  сохранены в этом плане и canonical production runbook.
- Следующий operational шаг использует те же exact current/previous SHA,
  image IDs и `app.lancora.ru` gateway. Согласование восстановления и prepare
  действует; activate требует отдельного согласования подготовленного релиза.
