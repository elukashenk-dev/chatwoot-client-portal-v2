# AGENTS.md

Этот файл хранит стабильные правила для `chatwoot-client-portal-v2`.
Сразу перейти в этот проект.

## Scope

- Работать только внутри `chatwoot-client-portal-v2`.
- Старый `../chatwoot-client-portal` использовать только как read-only reference.
- Старый `../chatwoot-client-portal` никогда не редактировать и ничего в нем не менять.
- В runtime- и infra-задачах не трогать backend, env, migrations и Postgres старого портала.
- Код из старой версии не копировать.

## Git Repository Rule

- `chatwoot-client-portal-v2` ведется как отдельный git repository.
- Старый `../chatwoot-client-portal` остается отдельным read-only reference repository и не является parent/upstream для `v2`.
- Не коммитить secrets, `.env`, локальные runtime artifacts, `node_modules`, `dist`, `playwright-report`, `test-results` и прочие generated outputs.
- Если перед началом задачи `git status` не clean, сначала понять ownership изменений:
  - свои незакрытые изменения можно продолжать;
  - чужие или неясные изменения не переписывать и не откатывать;
  - если они блокируют задачу, остановиться и явно описать конфликт.
- Для каждого нового feature/slice/finding использовать отдельную ветку от актуального `main`:
  - `feature/phase-<n>-<short-slug>` для плановых фаз и slices;
  - `fix/<area>-<short-slug>` для bugfix/finding work;
  - `docs/<short-slug>` только для документационных изменений.
- Одна ветка должна закрывать один понятный scope. Не смешивать новую feature, unrelated cleanup, generated churn и docs-only правки без причины.
- Коммитить только после closure flow и только изменения, относящиеся к текущему scope.

## Commit Advisory Rule

- Агент должен сам подсказывать пользователю хорошие моменты для git-фиксации, не ожидая отдельного вопроса.
- Перед началом нового scope агент должен сказать, на какой ветке мы сейчас и нужна ли отдельная ветка.
- Лучший момент для обычного feature/fix commit:
  - scope завершен;
  - code review текущей области выполнен;
  - найденные findings в рамках scope исправлены или явно deferred пользователем;
  - targeted checks пройдены;
  - обязательные auto-tests пройдены или blocker записан;
  - `docs/WORK_LOG.md` обновлен, если шаг действительно завершен.
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

## How To Enter A Task

Читать в таком порядке:

1. `AGENTS.md`
2. `docs/WORK_LOG.md`
3. `docs/ARCHITECTURE.md`
4. `docs/IMPLEMENTATION_PLAN.md`
5. `docs/DECISIONS.md`
6. `docs/steps/remaining-screen-map-and-ui-slices.md`

Этот файл в `docs/steps/` пока обязателен к чтению.

Причина:

- в нем временно хранится еще не удаленный контекст по remaining UI-slices;
- по мере переноса этого контекста в основные документы и по мере реализации шагов этот файл нужно сокращать;
- когда в нем не останется важного активного контекста, его нужно удалить.

Остальные файлы в `docs/steps/` открывать только когда нужен исторический контекст по ранним согласованиям.

## Product And Architecture Rules

- `v2` — это новый отдельный проект, а не рефакторинг `v1`.
- Browser не получает direct Chatwoot authority.
- Portal backend остается единственной authority-зоной для auth, session, send и realtime.
- `v2` использует только свой отдельный isolated `Postgres`; runtime-базу работающего `Chatwoot` использовать нельзя.
- Chatwoot core не трогать.
- Сам Chatwoot уже локально поднят; без необходимости его не менять.
- Для email-flow локально доступен `Mailpit`.
- Запуск и остановка локального окружения выполняются только пользователем.
- Агент не должен сам поднимать, перезапускать или останавливать сервисы `v2`.
- Первичную техническую подготовку `v2` со стороны кода делает агент: `env.example`, bootstrap-скрипты, schema, migrations, SQL/init-файлы и прочие артефакты, нужные для первого запуска.
- Если для завершения шага нужен уже запущенный сервис, агент сначала готовит все для первого запуска и дает пользователю точную команду на старт окружения.
- После того как пользователь поднял нужный сервис, агент может выполнять in-service инициализацию в рамках задачи: создать БД, прогнать миграции, создать таблицы, наполнить минимальные данные, запустить тесты и локальные проверки.

## External Source Of Truth

Когда возникают вопросы по Chatwoot:

1. сначала смотреть официальную документацию Chatwoot;
2. если в документации нет ответа — смотреть `../chatwoot-ce-stable`.

## Before Each Significant Step

- Перед каждым значимым шагом реализации обязательно сверяться с официальной документацией по затронутой технологии или интеграции.
- Для Chatwoot сначала смотреть официальную документацию, и только если ответа недостаточно — смотреть `../chatwoot-ce-stable`.
- Перед каждым значимым шагом также смотреть старый `../chatwoot-client-portal` как reference по продукту и уже найденным решениям.
- Старый проект использовать только как источник знаний о продукте, удачных решениях, неудачных решениях и пограничных сценариях.
- Из старого проекта брать идеи, наблюдения и принципы реализации, но не код и не runtime-зависимости.
- Запрещено редактировать старый проект, запускать его миграции, делать against него `psql`/readiness checks или иным образом использовать его Postgres как часть работы над `v2`.
- Код из старого проекта не копировать.
- Из старого проекта переносить не код, а выводы и принципы реализации.

## Workflow Rule

- Каждый внедренный шаг закрывать только через полный closure flow:
  1. implementation;
  2. code review затронутой области;
  3. фиксы найденных bugs/findings;
  4. повторная targeted-проверка после фиксов;
  5. обязательные автоматические тесты для сложных сценариев, которые трудно или ненадежно проверять руками.
- Если review нашел bugs/findings в рамках текущего шага, не переходить к следующей feature-фазе, пока они не исправлены и не проверены, если пользователь явно не отложил их отдельным решением.
- Для browser/runtime flows предпочитать Playwright e2e; для backend-инвариантов — backend unit/integration tests; для frontend state/validation — frontend unit tests.
- Если обязательный auto-test пока невозможно добавить из-за readiness/blocker, зафиксировать blocker и точный следующий шаг вместо молчаливого пропуска.
- После каждого завершенного шага обязательно обновлять `docs/WORK_LOG.md`.
- `docs/WORK_LOG.md` вести коротким списком, без длинных объяснений.
- В лог писать только реально выполненное, а не планы.
- Обновлять `docs/WORK_LOG.md` только после того, как по завершенному шагу закончены реализация, тесты, проверки и review.
- В конце `docs/WORK_LOG.md` всегда держать один актуальный блок `Recommended Next Step`.
- Перед записью нового рекомендуемого следующего шага удалять предыдущий, чтобы в конце файла всегда оставался только один актуальный следующий шаг.

## New Feature Intake Rule

- Новый функционал должен явно соответствовать одной из фаз `docs/IMPLEMENTATION_PLAN.md`, confirmed follow-up slice или отдельному finding из `docs/Findings/`.
- Если запрос не мапится на текущую фазу или утвержденный slice, сначала предложить точный scope и получить подтверждение, не расширяя roadmap молча.
- Перед implementation зафиксировать минимальный target:
  - backend authority boundary;
  - frontend route/state boundary;
  - persistence/migration impact;
  - required tests and runtime validation.
- Не начинать следующий feature-slice, пока текущий slice не прошел implementation, review, fixes, targeted checks, required tests и `docs/WORK_LOG.md` update.
- Если во время feature work найден adjacent риск, который не входит в текущий scope, оформить его в `docs/Findings/` и предложить следующим шагом. Не чинить скрыто, если пользователь явно не расширил scope.
- Browser/runtime feature считается готовой только если есть либо Playwright e2e, либо documented readiness/blocker, почему e2e сейчас невозможно.
- Backend invariant считается готовым только если покрыт backend unit/integration test или зафиксирован blocker.

## Findings Workflow

- `docs/Findings/` - registry для активных рисков, найденных во время code review.
- После review не оставлять findings только в чате: создать отдельный markdown-файл на каждый finding.
- Один файл = один finding.
- Перед работой над feature/module читать open findings из `docs/Findings/`, которые относятся к этой области.
- После фикса и проверки finding файл с ним нужно удалить из `docs/Findings/`.
- Факт закрытия finding фиксировать в `docs/WORK_LOG.md` вместе с выполненным шагом и проверками.
- Формат и обязательные поля описаны в `docs/Findings/README.md`.

## Source Of Truth Inside v2

- Реальное состояние проекта определяется кодом.
- `docs/WORK_LOG.md` — это короткая карта того, что уже сделано.
- `docs/ARCHITECTURE.md`, `docs/DECISIONS.md` и `docs/IMPLEMENTATION_PLAN.md` хранят устойчивые решения и порядок движения.
