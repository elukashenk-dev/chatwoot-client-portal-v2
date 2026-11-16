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

## Production handoff — 2026-11-16

- Repair commit `48d226064f991616519a8f7a6108e9443b435f11` merged/pushed.
- `recover-baseline` завершен с `status=baseline_recovered`. Journal совпадает
  с completed; восемь старых outcomes сохранены в recovery archive; отсутствующий
  previous pointer снят. Current/source marker остаются `4cf719e`; точные image IDs
  прежние, оба контейнера работают с прежним StartedAt, public health HTTP 200.
- `prepare` для `48d2260` отказал: `Candidate portal image build failed`.
  На сервере отсутствует Docker Buildx (`docker: unknown command: docker buildx`).
  Candidate удален штатным cleanup; prepared pointer отсутствует, active runtime
  не переключался. Build и image evidence нового релиза пока не готовы.
- `apt-get --simulate --no-install-recommends install docker-buildx` предлагает
  только `docker-buildx=0.30.1-0ubuntu1~24.04.1`, zero upgrades/removals.
  Пользователь разрешил установку и повтор prepare, отдельно попросил не
  повторять полный test suite. Buildx 0.30.1 установлен с `--no-upgrade`,
  `--no-remove`, `--no-install-recommends`, `NEEDRESTART_MODE=l`; установлен
  один пакет, upgrades/removals отсутствуют. CLI version подтверждена, image IDs
  и StartedAt контейнеров прежние. Повторный prepare `48d2260` завершился
  с `status=prepared`; прежний green gate применен без повторного запуска. Activate требует отдельного
  согласования exact prepared SHA.
- Дополнительная read-only проверка: `lk.provgroup.ru/api/health` отвечает 200,
  `lk.pronalogi.pro` не разрешается через DNS ни локально, ни с Timeweb (curl
  exit 6). В portal DB оба tenant имеют status=active и эти public_base_url.
  До activate нужно выяснить и устранить DNS/readiness blocker; нельзя исключать
  активного tenant из обязательного smoke или менять его статус без решения
  владельца. Это обнаружено до переключения; DNS и tenant data не менялись.
  Google public DNS также возвращает NXDOMAIN для `lk.pronalogi.pro` A и
  `pronalogi.pro` NS; `lk.provgroup.ru` A указывает на Timeweb. Пользователю
  отправлен вопрос об актуальности кабинета и домена.

- Успешная подготовка `48d2260`: migration classification `none`, expiry
  `2026-11-17T13:00:14Z`, backend image
  `sha256:c3a4811e57f0aafa3ccec1ca31f83b1c564cbd01818d4dc4a6fc692b979847c6`,
  web image
  `sha256:c6189f0999d6d9bec7329ad4da2909d01c81d4d45938de03324917f1f9f9d2ec`.
  Manifest успел зафиксировать оба active tenants до ответа пользователя.
- Пользователь подтвердил, что `pronalogi` больше не используется, и разрешил
  убрать кабинет. Выбран archive-only через существующий deprovision service:
  без удаления portal rows, Chatwoot account, миграций или перезапуска сервисов.
  После изменения статуса нужен новый prepare: immutable tenant matrix старого
  candidate нельзя редактировать или обходить при activation. CLI не имеет
  cancel unexpired candidate; разовая безопасная отмена требует конкретного
  operational review и согласования вместо подмены expiry/rollback evidence.

- Archive-only `pronalogi` выполнен под существующим deploy lock через reviewed
  `/tmp/portal-archive-pronalogi-20261116.mjs`: tenant id 3, active → archived,
  `chatwootDeleteRequested=false`; `provgroup` остался active. Никаких миграций,
  удаления строк или Chatwoot calls. Проверка HTTPS с explicit DNS resolution
  на Timeweb: `/api/tenant` возвращает 503 `TENANT_RUNTIME_DISABLED`;
  `https://lk.provgroup.ru/api/health` — 200. Независимый review wrapper не нашел
  Critical/Important; reviewer permissions unrestricted, voluntary read-only.
- Operational blocker: prepared manifest остается неизменным с двумя tenants.
  Activate не запускался. Existing CLI может убрать candidate только после
  настоящего expiry либо доказанного rollback; rollback не происходил.
  Independent review отклонил ad-hoc relocation/удаление pointer как неполную
  замену cancellation protocol (включая image tag conflicts при same-SHA prepare).
  Existing safe path: после `2026-11-17T13:00:14Z` повторить уже согласованный
  обычный prepare, который очистит expired candidate и снимет новую matrix.
  Для ускорения требуется отдельно согласованный bounded cancellation slice:
  exact-SHA acknowledgement, deploy lock, revalidation current/runtime/manifest,
  durable audit evidence до retirement, доказательство отсутствия live users
  candidate images, exact tag cleanup, interruption/resume и fault tests.
  Нельзя подменять expiry, activation validators или rollback outcomes.
  Полные tests повторно не запускались; runtime остается `4cf719e`.

- Пользователь согласовал доработку безопасной отмены подготовленного выпуска.
  Реализация и review закрыты на ветке `fix/ops-cancel-prepared`; окончательные
  проверки механизма выпуска прошли. Дальнейший handoff, точные inputs отмены и
  её verification evidence перенесены в
  [cancel-prepared-release-plan.md](./cancel-prepared-release-plan.md). Этот
  документ сохраняет исходные recovery и production handoff records. Отмена
  старой подготовки и переключение runtime пока не выполнялись.
