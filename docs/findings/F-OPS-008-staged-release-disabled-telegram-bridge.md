# F-OPS-008: Staged release требует отключенный Telegram bridge

- status: open
- review_disposition: accepted — пользователь согласовал отдельный release-contract scope без Telegram bridge; production prepare/activate по-прежнему требуют отдельного согласия.
- found_in: Contact profile refresh release readiness, independent review, 2026-11-16
- risk: high
- urgency: Блокирует следующую production выкладку портала, включая profile refresh.
- area: staged production prepare / activate / rollback
- evidence: `../lancora-production-infrastructure/docs/runbooks/timeweb-pre-dns-cutover.md` фиксирует, что Telegram bridge не перенесен и не запускается; `inventory/servers.yaml` фиксирует Timeweb и portal release `4cf719e41b07a009214ea51504265c10648dafda`. Read-only SSH подтвердил текущий release и работающие portal-backend/portal-web. `scripts/production-staged-release-remote.sh` в remote_import_or_validate_current_release требует Telegram image ID либо работающий контейнер, prepare собирает все три сервиса, remote_start_and_wait_for_services запускает Compose без ограничения списка и требует три image ID.
- failure_path: Подготовка упирается в отсутствующий Telegram rollback image/container. Обход этой проверки не решает проблему: последующая активация запускает отключенный сервис и требует его health, что не входит в разрешение на обновление профиля.
- additional_evidence: Read-only SSH также выявил неполный staged baseline после переноса: `.release-state/current` существует, но в каталоге текущего release отсутствуют `manifest.txt` и `source.tar.gz`; есть `compose.release.yaml` и `source/`. Обычный import/validate откажет до проверки образов. Следующий scope должен явно восстановить проверяемый rollback baseline, не ослабляя проверку существующих записей и не принимая один SHA за достаточное доказательство исходников/образов.
- fix_short: Отдельно согласовать explicit service set для prepare/activate/rollback, соответствующий установленному runtime без Telegram bridge. Сохранить exact image/source evidence, fail-closed drift checks, bounded readiness и rollback. Не запускать bridge и не подменять manifest ради прохождения проверки.
- acceptance: Реальный двухсервисный baseline проходит подготовку без запуска сервисов; activation и rollback управляют только согласованным набором, сохраняют exact image identities и tenant health smoke; неизвестный/изменившийся service set отклоняется; negative/fault/rollback tests и independent review проходят. Production prepare/activate остаются раздельно разрешаемыми операциями.

Это существующее расхождение после переноса VM, не изменение profile fix.
Пользователь подтвердил, что bridge сейчас не используется и его удаление из
продукта планируется отдельно. До закрытия finding команды prepare/activate не
выполнять; скрытое восстановление production metadata не разрешено.
