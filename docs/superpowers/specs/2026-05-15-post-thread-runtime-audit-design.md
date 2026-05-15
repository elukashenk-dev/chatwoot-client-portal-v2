# Дизайн MT-8.6 Post-Thread Runtime Audit And Cleanup

Дата: 2026-05-15

## Статус

Дизайн принят для планирования. Реализация audit/refactoring/dead-code cleanup
в этой spec еще не начата.

## Цель

После большого перехода на portal-owned chat threads провести повторный
архитектурный review, code audit, refactoring assessment и controlled dead code
removal перед началом `MT-9 Tenant Admin And Branding Rebuild`.

Главная цель - не "почистить все", а убедиться, что новый baseline достаточно
понятен, защищен тестами и не несет скрытых security/regression рисков перед
следующим большим product slice.

## Почему Это Нужно

Chat runtime был сильно перестроен:

- browser contract перешел с Chatwoot conversation authority на `threadId`;
- backend получил `portal_chat_threads`, company access validation,
  author-prefix formatting, thread-scoped send ledger и thread-scoped realtime;
- frontend теперь выбирает доступный thread и отправляет history/send/realtime
  через selected `threadId`;
- stable docs уже обновлены, но codebase после такого изменения требует
  повторной проверки формы, границ и устаревших частей.

Если сразу идти в `MT-9`, есть риск строить admin/branding поверх кода, где
остались неочевидные legacy paths, раздутые файлы, слабые tests или
неверифицированные assumptions.

## Production Quality Bar

`MT-8.6` не является косметическим cleanup.

Запрещено:

- делать широкий рефакторинг одним commit;
- удалять код без evidence;
- менять runtime behavior под видом cleanup;
- ослаблять tenant/auth/session/chat/realtime/webhook boundaries;
- начинать `MT-9`, если audit нашел `must-fix-before-MT-9` findings;
- оставлять finding только в чате без файла в `docs/Findings/`;
- переписывать рабочий код ради вкуса, если нет конкретного риска,
  дублирования, тестового пробела или сложности сопровождения.

Разрешено:

- создавать findings;
- добавлять regression tests;
- выполнять маленькие refactoring slices без behavior change;
- удалять доказанный dead code;
- обновлять docs, если они отстают от фактического runtime.

## Scope

### 1. Production Smoke Перед Audit

Перед read-only audit нужно проверить текущий chat-thread runtime на production
preview, если production deploy уже выполнен.

Из-за открытого `F-PROD-002` smoke не считается валидным без release
provenance. Перед functional smoke нужно зафиксировать:

- какой commit/branch/source сейчас развернут на production preview;
- clean или dirty state у deployed source;
- что deployed commit содержит post-thread runtime changes;
- где recorded deploy provenance хранится, например `DEPLOY_SOURCE.txt`,
  release tag или другой выбранный source of truth;
- есть ли intentional drift между local `main`, remote `origin/main` и
  production source.

Минимальный smoke:

- открыть `lk.provgroup.ru`;
- login тестовым пользователем;
- проверить личный чат;
- проверить company thread, если тестовые Chatwoot contacts уже настроены;
- отправить сообщение;
- проверить Chatwoot admin view: правильный contact, author prefix для company
  message;
- проверить realtime или явно записать blocker, если окружение не позволяет.

Если production smoke еще невозможен, blocker фиксируется отдельно, но audit
можно начинать по local baseline.

### 2. Read-Only Code Audit

Audit сначала выполняется без правок в коде.

Зоны:

- backend tenant/auth/session boundary;
- registration/password reset flows;
- chat-context legacy compatibility;
- chat-threads listing/runtime/persistence;
- chat-messages history/send/attachments/send ledger/rate limit;
- chat-realtime SSE hub and admission;
- chatwoot-webhooks routing/fanout/recovery;
- Chatwoot client and contact attribute parsing;
- frontend chat state/thread selection/realtime/composer;
- frontend auth route/session/error states;
- Playwright e2e harness and local testing docs;
- migrations/schema and legacy compatibility tables;
- production/deployment/runbook docs.

Audit должен отвечать на вопросы:

- где теперь authority boundary;
- какие legacy paths еще нужны;
- какие legacy paths уже можно удалить;
- где behavior покрыт tests;
- где browser/runtime flow покрыт Playwright;
- где файл или модуль делает слишком много;
- где есть cross-tenant или cross-thread risk;
- где docs расходятся с кодом.

### 3. Findings Registry

Все реальные риски фиксируются в `docs/Findings/`.

Категории:

- `must-fix-before-MT-9` - нельзя начинать `MT-9`, пока не закрыто;
- `safe-pre-MT-9-cleanup` - можно закрыть до `MT-9`, но не является
  security/blocker;
- `dead-code-candidate` - можно удалить только после evidence;
- `defer` - известно, но не мешает `MT-9`;
- `do-not-touch` - кажется странным, но намеренно оставлено как compatibility
  или production safety.

Один finding = один markdown-файл.

Finding должен соответствовать schema из `docs/Findings/README.md`.
Обязательные поля:

- `status`: `open` или `deferred`;
- `found_in`: шаг или review, где найдено;
- `risk`: `high`, `medium` или `low`;
- `urgency`: как срочно фиксить;
- `area`: affected feature/module;
- `evidence`: ссылки на код и короткое объяснение;
- `fix_short`: короткое предложение фикса;
- `acceptance`: как понять, что finding закрыт.

Дополнительно для `MT-8.6` finding может содержать `decision`, если audit
явно классифицирует риск как `fix now`, `defer` или `do-not-touch`.

### 4. Regression Safety Net

Если audit находит слабое покрытие вокруг critical boundary, сначала добавляются
tests, и только потом refactoring.

Critical boundaries:

- tenant resolution by host;
- session tenant binding;
- tenant PWA metadata and cache isolation;
- branding asset storage boundary planned for `MT-9`;
- runtime Chatwoot token vs admin-verification token separation;
- registration eligibility via Chatwoot person contact;
- `GET /api/chat/threads` fail-closed behavior;
- company thread history/send access removal;
- send ledger idempotency scope;
- attachment send authority;
- realtime fanout with revoked access;
- webhook conversation-to-thread routing;
- Chatwoot webhook signature and tenant matching;
- frontend selected thread state and no unsafe fallback.

### 5. Refactoring Assessment

Refactoring выполняется только после audit classification.

Кандидат на refactoring допустим, если он:

- уменьшает реальную сложность;
- закрывает concrete finding;
- уменьшает meaningful duplication;
- изолирует authority boundary;
- облегчает testing;
- готовит понятный путь к `MT-9`.

Кандидат отклоняется, если он:

- меняет поведение без необходимости;
- широкий и плохо откатываемый;
- существует только ради стиля;
- смешивает backend/frontend/docs/deploy в один scope;
- не имеет проверяемого exit criterion.

### 6. Dead Code Removal

Удаление выполняется отдельными slices.

Evidence для удаления:

- `rg` не находит runtime/test imports/usages;
- typecheck/build/tests проходят после удаления;
- route registration, package scripts, deploy scripts, Docker/compose files and
  production runbooks do not reference the candidate;
- env names, webhook URLs, callback paths and operational commands do not depend
  on the candidate;
- migrations/schema/DB compatibility are unaffected or explicitly covered by a
  compatibility decision;
- route/script/file не является public/runtime entrypoint;
- docs не описывают его как supported compatibility;
- если это legacy compatibility, есть explicit decision, что compatibility
  больше не нужна.

Нельзя удалять:

- migrations;
- production runbook history, если она нужна для operations;
- public API routes без отдельного compatibility decision;
- legacy DB columns, если send ledger/recovery еще реально их использует;
- tests, которые проверяют запрет старого unsafe public contract.

## Non-Goals

- Не реализовывать `MT-9` admin/branding.
- Не менять product UI/UX baseline.
- Не переносить логику из внешних portal-проектов.
- Не трогать Chatwoot core.
- Не делать глобальную перепись backend или frontend structure.
- Не удалять legacy DB таблицы/колонки только потому, что они выглядят старыми.

## Deliverables

1. `docs/MT_8_6_POST_THREAD_RUNTIME_AUDIT.md`:
   - audit map;
   - findings index;
   - technical debt map;
   - dead-code candidates;
   - recommended slices, if audit evidence supports them;
   - MT-9 gate matrix;
   - final decision before `MT-9`.
2. Finding files in `docs/Findings/` for actionable risks.
3. One or more small follow-up plans for approved slices, only after audit.
4. Checkpoint commits:
   - docs-only audit report;
   - each regression test/refactoring/dead-code slice separately.

## Required Checks

Baseline checks before refactoring:

```bash
pnpm --dir backend test
pnpm --dir frontend test
pnpm --dir backend build
pnpm --dir frontend typecheck
pnpm --dir frontend build
pnpm lint
git diff --check
```

Browser/runtime checks:

```bash
pnpm test:e2e
```

If Playwright is blocked, the blocker must be recorded with:

- what service/browser failed;
- exact command;
- exact error;
- what targeted tests still passed;
- what next action unblocks it.

For each refactoring/dead-code slice:

- targeted tests for affected area;
- build/typecheck/lint as relevant;
- `git diff --check`;
- Playwright if browser/runtime behavior can change.

## Exit Criteria

`MT-8.6` is complete only when:

- production smoke is passed or blocker is explicitly recorded;
- read-only audit report is written;
- all real risks are represented as findings or consciously marked
  `do-not-touch`;
- no `must-fix-before-MT-9` finding remains open;
- approved cleanup/refactoring/dead-code slices are either completed or
  explicitly deferred;
- MT-9 gate matrix is explicit:
  - no chat/runtime `must-fix-before-MT-9` blocker remains open;
  - `F-MT-004` is allowed to remain deferred only as the first `MT-9`
    permissions-spike/admin-token-boundary task;
  - `MT-8.6` did not implement tenant admin or branding behavior;
- final checks are green or blocker is documented;
- `docs/WORK_LOG.md` points to the next real step.

## Recommended Next Step After This Spec

Write the first implementation plan for `MT-8.6` with phases and gates only:

1. production smoke or blocker;
2. read-only audit report;
3. finding classification;
4. regression safety net gaps;
5. decision whether any bounded cleanup/refactoring/dead-code slice is approved.
6. final verification and `MT-9` readiness decision.

Do not preselect concrete cleanup/refactoring/dead-code slices in the first
plan. Exact slice plans are written only after the read-only audit report and
finding classification exist.

If audit approves follow-up slices, write separate implementation plans for:

- regression safety net gaps;
- bounded refactoring;
- dead-code removal;
