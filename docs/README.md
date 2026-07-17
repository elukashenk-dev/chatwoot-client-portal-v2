# Documentation

Короткая карта актуальных документов.

## Core

- [product/b2b-product-goal.md](product/b2b-product-goal.md) - продуктовая рамка.
- [architecture/overview.md](architecture/overview.md) - текущая архитектура.
- [architecture/decisions.md](architecture/decisions.md) - устойчивые решения.
- [roadmap/implementation-plan.md](roadmap/implementation-plan.md) - roadmap.
- [roadmap/work-log.md](roadmap/work-log.md) - короткий журнал выполненного.

## Reference

- [architecture/multi-tenant-reference.md](architecture/multi-tenant-reference.md) - подробный multi-tenant reference.
- [operations/local-testing.md](operations/local-testing.md) - локальный запуск.
- [operations/local-cross-tenant-test-data.md](operations/local-cross-tenant-test-data.md) - подготовка локальных Chatwoot contacts/users/groups для cross-tenant mutating тестов.
- [operations/mt-10-deployment-runbooks.md](operations/mt-10-deployment-runbooks.md) - карта текущих production-операций.
- [operations/production-deployment.md](operations/production-deployment.md) - production guardrails.
- [operations/production-clean-reinstall.md](operations/production-clean-reinstall.md) - clean reinstall runbook.
- [operations/production-server-notes.md](operations/production-server-notes.md) - факты о production VM.
- [operations/mt-10a-tenant-lifecycle-rehearsal.md](operations/mt-10a-tenant-lifecycle-rehearsal.md) - обязательная rehearsal перед broad shared SaaS rollout.
- [operations/telegram-bridge.md](operations/telegram-bridge.md) - эксплуатация Telegram bridge.
- [findings/](findings/) - открытые review findings.

## Execution Artifacts

`docs/superpowers/` используется для временных specs/plans во время активной
feature work и для сохраненных нереализованных или частично реализованных
follow-up artifacts. После полной реализации source of truth переносится в
stable docs выше, а завершенные execution artifacts удаляются.
