# AGENTS.md

Этот файл хранит стабильные правила для `chatwoot-client-portal-v2`.

## Scope

- Работать только внутри `chatwoot-client-portal-v2`.
- `chatwoot-client-portal-v2` является единственным клиентским portal-проектом
  в текущем scope.
- Код, идеи, зависимости, runtime-подходы и данные из внешних клиентских
  portal-проектов не переносить.

## Git Repository Rule

- `chatwoot-client-portal-v2` ведется как отдельный git repository.
- Этот repository самодостаточный и не имеет parent/upstream среди локальных
  клиентских portal-проектов.
- Не коммитить secrets, `.env`, локальные runtime artifacts, `node_modules`,
  `dist`, `playwright-report`, `test-results` и прочие generated outputs.
- Если перед началом задачи `git status` не clean, сначала понять ownership изменений:
  - свои незакрытые изменения можно продолжать;
  - чужие или неясные изменения не переписывать и не откатывать;
  - если они блокируют задачу, остановиться и явно описать конфликт.
- Для каждого нового feature/slice/finding использовать отдельную ветку от актуального `main`:
  - `feature/phase-<n>-<short-slug>` для плановых фаз и slices;
  - `fix/<area>-<short-slug>` для bugfix/finding work;
  - `docs/<short-slug>` только для документационных изменений.
- Одна ветка должна закрывать один понятный scope. Не смешивать feature,
  unrelated cleanup, generated churn и docs-only правки без причины.
- Коммитить только после closure flow и только изменения, относящиеся к текущему scope.

## Commit Advisory Rule

- Агент должен сам подсказывать пользователю хорошие моменты для git-фиксации,
  не ожидая отдельного вопроса.
- Перед началом нового scope агент должен сказать, на какой ветке мы сейчас и нужна ли отдельная ветка.
- Лучший момент для обычного feature/fix commit:
  - scope завершен;
  - code review текущей области выполнен;
  - найденные findings в рамках scope исправлены или явно deferred пользователем;
  - targeted checks пройдены;
  - обязательные auto-tests пройдены или blocker записан;
  - `docs/roadmap/work-log.md` обновлен, если шаг действительно меняет
    устойчивый product/architecture/runtime baseline.
- Лучший момент для docs-only commit:
  - изменены только docs/rules;
  - форматирование проверено;
  - `git diff --check` не показывает whitespace issues;
  - изменение не смешано с feature-code.
- Агент должен явно предупреждать, если commit пока рано делать:
  - есть failing tests без зафиксированного blocker;
  - есть незакрытые review findings внутри текущего scope;
  - есть unrelated или unclear changes в `git status`;
  - изменение находится не на той ветке;
  - в staged files попали secrets, `.env`, generated artifacts или runtime output.
- Агент должен предлагать checkpoint commit после завершения каждой фазы, slice, finding fix или docs-only governance update.
- WIP commit допустим только по явной просьбе пользователя и должен называться как WIP; по умолчанию WIP не коммитить.

## Phase Checkpoint Flow

- Перед переходом к новой phase или крупному feature-slice агент должен
  проверить, достаточно ли текущий baseline защищен тестами.
- Если следующая phase опирается на готовые auth/session/runtime/backend
  boundaries, сначала закрыть недостающую regression safety net.
- Regression safety net подбирается по риску:
  - browser/runtime flows проверять через Playwright e2e;
  - backend authority, session, persistence и security invariants проверять backend unit/integration tests;
  - frontend route/state/error handling проверять frontend unit tests.
- Для phase checkpoint агент должен кратко объяснить пользователю:
  - что именно покрываем;
  - зачем это нужно перед следующей phase;
  - какие проверки будут считаться достаточными.
- Phase checkpoint закрывается тем же closure flow: implementation, review,
  fixes, targeted checks, required auto-tests и, если checkpoint меняет
  устойчивый baseline, `docs/roadmap/work-log.md` update.
- После зеленого phase checkpoint агент должен предложить обычный checkpoint commit и только затем переходить к следующей feature phase.
- Если дополнительная regression coverage объективно не нужна, агент должен явно сказать почему и предложить переход к следующей phase без тестового pre-step.

## How To Enter A Task

Читать в таком порядке:

1. `AGENTS.md`
2. `docs/roadmap/work-log.md`
3. `docs/architecture/overview.md`
4. `docs/roadmap/implementation-plan.md`
5. `docs/architecture/decisions.md`

## Product And Architecture Rules

- `v2` — это самостоятельный tenant-aware клиентский portal.
- Browser не получает direct Chatwoot authority.
- Portal backend остается единственной authority-зоной для auth, session, send и realtime.
- `v2` использует только свой отдельный isolated `Postgres`; runtime-базу работающего `Chatwoot` использовать нельзя.
- Chatwoot core не трогать.
- Chatwoot считается внешним сервисом; без необходимости его не менять.
- Для email-flow локально доступен `Mailpit`.
- Запуск, остановка и перезапуск локальных portal-сервисов для разработки и
  проверок может выполнять пользователь или агент: frontend/backend dev
  servers, isolated portal Postgres, Mailpit и другие локальные сервисы,
  описанные в этом repository.
- Chatwoot остается внешним сервисом: агент не меняет Chatwoot core и не
  перезапускает Chatwoot без явной необходимости или отдельного разрешения
  пользователя.
- Агент готовит кодовую часть окружения: env examples, bootstrap scripts,
  schema, migrations и init scripts.
- После запуска нужных сервисов пользователем или агентом агент может выполнять
  in-service инициализацию: создать БД, прогнать миграции, наполнить
  минимальные данные, запустить тесты и локальные проверки.

## No Backward Compatibility Rule

- `chatwoot-client-portal-v2` сейчас разрабатывается как новый продукт. Все
  portal users, portal-owned browser caches, local storage, IndexedDB records,
  portal database rows and tenant data считаются тестовыми, пока отдельное
  архитектурное решение явно не объявит их реальными клиентскими данными.
- Проект не поддерживает старые версии portal runtime, старые browser storage
  formats, старые API/contracts, старые env names, старые frontend components,
  старые CSS hooks или старые portal-owned DB rows ради обратной совместимости.
- Если меняется contract или storage/data shape, старое поле, reader, writer,
  fallback, test fixture и документацию нужно удалить в этом же scope. Старый
  cache/data можно отбросить и пересоздать через новый online/bootstrap flow.
- Временный compatibility shim допустим только по явному решению пользователя.
  Он должен быть time-boxed: с documented reason, removal trigger и отдельным
  follow-up/finding, чтобы не остаться постоянным legacy layer.
- Это правило не дает права менять или удалять Chatwoot-owned production data:
  Chatwoot остается внешним system of record и трогается только по отдельному
  явному решению.

## External Source Of Truth

Когда возникают вопросы по Chatwoot:

1. сначала смотреть официальную документацию Chatwoot;
2. если в документации нет ответа — смотреть `../chatwoot-ce-stable`.

- Для portal-specific решений source of truth - текущий код и документы
  `chatwoot-client-portal-v2`.
- Runtime/Postgres/миграции других клиентских portal-проектов не использовать.

## Documentation Preservation Rule

- Перед удалением, переименованием или заменой файлов в `docs/superpowers/`,
  `docs/product/`, `docs/findings/`, `docs/roadmap/` или
  `docs/architecture/` агент обязан выполнить docs-preservation audit:
  - проверить текущую ветку и чистоту worktree через `git status --short --branch`;
  - проверить историю затрагиваемых файлов через `git log --all -- <paths>`;
  - проверить ссылки на удаляемые/заменяемые файлы через `rg`;
  - если пользователь ссылается на спеки/планы/findings из предыдущего чата,
    скриншота или боковой ветки, проверить локальные ветки и историю до
    удаления, а не полагаться только на текущий `main`.
- Удалять docs-файл можно только если явно выполнено одно из условий:
  - файл заменен другим committed/staged документом в этом же scope, и новый
    путь указан в diff/final response;
  - finding реально закрыт по Findings Workflow и удаляется как закрытый;
  - документ полностью superseded, а replacement или причина удаления явно
    записаны в соседнем актуальном документе или final response.
- Если важная спека, план или таблица сценариев были созданы на отдельной
  ветке, но не попали в `main`, сначала восстановить или влить этот docs-source
  в отдельном docs-scope. Нельзя продолжать cleanup так, будто этих документов
  не существовало.
- При чистке уже реализованных планов нельзя удалять весь план, если в нем
  остались активные future/follow-up пункты. Нужно либо удалить только закрытые
  части, либо добавить явный блок current implementation status.
- В финальном ответе после docs cleanup агент должен перечислить, какие docs
  удалены, какие восстановлены, и какой файл теперь является source of truth.

## Workflow Rule

- Каждый внедренный шаг закрывать только через полный closure flow:
  1. implementation;
  2. code review затронутой области;
  3. фиксы найденных bugs/findings;
  4. повторная targeted-проверка после фиксов;
  5. обязательные автоматические тесты для сложных сценариев, которые трудно или ненадежно проверять руками.
- Если review нашел bugs/findings в рамках текущего шага, не переходить к
  следующей feature-фазе, пока они не исправлены и не проверены, если
  пользователь явно не отложил их отдельным решением.
- Для browser/runtime flows предпочитать Playwright e2e; для backend-инвариантов — backend unit/integration tests; для frontend state/validation — frontend unit tests.
- Если обязательный auto-test пока невозможно добавить из-за readiness/blocker, зафиксировать blocker и точный следующий шаг вместо молчаливого пропуска.
- `docs/roadmap/work-log.md` обновлять только для крупных завершенных
  feature/phase/runtime/docs-governance шагов, которые меняют устойчивый
  product/architecture/runtime baseline.
- `docs/roadmap/work-log.md` вести короткой картой baseline, без длинных
  объяснений.
- В лог писать только реально выполненные крупные изменения, а не планы.
- Не добавлять в `docs/roadmap/work-log.md` отдельные пункты про мелкие fixes,
  transient regressions, временные findings, refactoring slices, test runs,
  команды, счетчики тестов, списки проверок, smoke details и review minutiae.
  Эти детали остаются в финальном ответе, commit/PR description или finding
  файлах, пока finding открыт.
- Обновлять `docs/roadmap/work-log.md` только после того, как по завершенному
  крупному шагу закончены реализация, тесты, проверки и review; сами проверки
  в work-log не перечислять.
- В конце `docs/roadmap/work-log.md` всегда держать один актуальный блок `Recommended Next Step`.
- Перед записью нового рекомендуемого следующего шага удалять предыдущий, чтобы в конце файла всегда оставался только один актуальный следующий шаг.

## Execution Efficiency Rule

- Надежность важнее экономии токенов, но агент не должен выполнять пустую,
  дублирующую или непропорционально дорогую работу.
- Перед subagent-driven work агент должен выбирать минимальный достаточный
  execution/review уровень по риску задачи:
  - high-risk: auth, session, security, database migrations, persistence,
    tenant isolation, production deploy, public API contracts - полный review
    flow обязателен;
  - medium-risk: обычные feature slices - focused implementer/reviewer и
    targeted checks достаточны, если нет архитектурных изменений;
  - low-risk: docs-only, copy, локальные UI polish fixes - локальная проверка и
    targeted checks обычно достаточны.
- Для small UI/CSS/copy fixes агент должен использовать lightweight closure
  flow, если изменение не затрагивает auth/session/runtime boundaries,
  shared providers, routing contracts или persistence:
  - сначала локально определить точный impacted surface и не расширять scope;
  - покрыть измененный компонент/поведение targeted unit test, если есть
    логика или branching;
  - запускать targeted Playwright только когда проверяется browser-only
    поведение: computed CSS, history navigation, layout, focus/autofill или
    responsive state;
  - перед commit/closure выполнить targeted checks, `pnpm lint`,
    `pnpm build` и `git diff --check`;
  - полный frontend test suite запускать только для shared
    provider/router/auth/session/runtime changes, широких UI slices,
    final merge/checkpoint или если targeted checks выявили неожиданный риск.
- Subagent prompt должен быть коротким и точным: ссылка на plan/task section,
  write scope, acceptance criteria и hard boundaries. Не копировать весь
  большой plan в prompt, если subagent может прочитать нужный файл сам.
- Generated файлы не ревьюить целиком построчно без причины. Проверять
  targeted: presence, journal/snapshot consistency, schema diff, migration SQL
  и тесты.
- Повторное независимое ревью делать обязательно для Critical/Important
  findings. Minor findings можно закрывать локальной правкой и targeted checks,
  если они не затрагивают runtime/security/data behavior.
- Выводы команд в чат держать краткими: команда, pass/fail, ключевые числа и
  failures. Не вставлять verbose output без необходимости.
- Нельзя сокращать обязательные проверки: tests/build/lint/diff-check и
  acceptance criteria остаются gate перед commit/closure.
- Если экономия процесса создает риск ухудшения качества, выбирать качество и
  явно объяснять пользователю, почему нужен полный flow.

## New Feature Intake Rule

- Новый функционал должен явно соответствовать одной из фаз `docs/roadmap/implementation-plan.md`, confirmed follow-up slice или отдельному finding из `docs/findings/`.
- Если запрос не мапится на текущую фазу или утвержденный slice, сначала предложить точный scope и получить подтверждение, не расширяя roadmap молча.
- Перед проектированием новой пользовательской feature или нового UI-slice
  начинать обсуждение с визуального сравнения вариантов: browser companion,
  локальная страница, wireframe или иной быстрый visual preview. Пользователь
  подтвердил, что такой формат помогает принимать решения; пропускать этот
  шаг только если feature backend-only, визуальное сравнение объективно не
  нужно или пользователь явно просит идти без визуализации.
- Перед implementation зафиксировать минимальный target:
  - backend authority boundary;
  - frontend route/state boundary;
  - persistence/migration impact;
  - required tests and runtime validation.
- Не начинать следующий feature-slice, пока текущий slice не прошел
  implementation, review, fixes, targeted checks, required tests и, если slice
  меняет устойчивый baseline, `docs/roadmap/work-log.md` update.
- Если во время feature work найден adjacent риск, который не входит в текущий scope, оформить его в `docs/findings/` и предложить следующим шагом. Не чинить скрыто, если пользователь явно не расширил scope.
- Browser/runtime feature считается готовой только если есть либо Playwright e2e, либо documented readiness/blocker, почему e2e сейчас невозможно.
- Backend invariant считается готовым только если покрыт backend unit/integration test или зафиксирован blocker.

## Findings Workflow

- `docs/findings/` - registry для активных рисков, найденных во время code review.
- После review не оставлять findings только в чате: создать отдельный markdown-файл на каждый finding.
- Один файл = один finding.
- Перед работой над feature/module читать open findings из `docs/findings/`, которые относятся к этой области.
- После фикса и проверки finding файл с ним нужно удалить из `docs/findings/`.
- Факт закрытия finding фиксировать в `docs/roadmap/work-log.md` только если он
  меняет устойчивый baseline; проверки и технические детали закрытия в
  work-log не перечислять.
- Формат и обязательные поля описаны в `docs/findings/README.md`.

## Source Of Truth Inside v2

- Реальное состояние проекта определяется кодом.
- `docs/roadmap/work-log.md` — это короткая карта того, что уже сделано.
- `docs/architecture/overview.md`, `docs/architecture/decisions.md` и `docs/roadmap/implementation-plan.md` хранят устойчивые решения и порядок движения.
