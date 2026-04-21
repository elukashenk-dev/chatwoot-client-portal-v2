# Findings

`docs/Findings/` - реестр активных рисков, найденных во время code review.

## Правило

- После review создавать отдельный markdown-файл на каждый finding.
- Один файл = один риск, без смешивания нескольких проблем.
- Перед работой над областью кода читать open findings, которые относятся к этой области.
- После фикса и проверки finding удалить markdown-файл, в котором он был заведен.
- Закрытие finding фиксировать в `docs/WORK_LOG.md`: какой finding закрыт, каким шагом и какие проверки прошли.

## Формат имени

`F-<AREA>-<NNN>-short-slug.md`

Пример:

`F-REG-001-verify-attempts-race.md`

## Обязательные поля

- `status`: `open`, `deferred`
- `found_in`: шаг или review, где найдено
- `risk`: `high`, `medium`, `low`
- `urgency`: как срочно фиксить
- `area`: affected feature/module
- `evidence`: ссылки на код и короткое объяснение
- `fix_short`: короткое предложение фикса
- `acceptance`: как понять, что finding закрыт
