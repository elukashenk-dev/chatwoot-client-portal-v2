# F-CHAT-014: Переименование контакта меняет fingerprint повторной отправки

- status: open
- found_in: Contact profile refresh follow-up, 2026-11-16
- risk: medium
- urgency: Отдельный send-reliability slice перед использованием переименования при незавершенных отправках.
- area: group chat send ledger / retry
- evidence: `backend/src/modules/chat-messages/service.ts` передает outboundContent с текущим Markdown author prefix в createTextPayloadSha256/createAttachmentPayloadSha256; `repository.ts` сравнивает fingerprint до replay confirmed записи. Regression: `service.contact-rename.test.ts` воспроизводит `client_message_key_conflict` при повторе старого ключа после смены имени для текста и вложений.
- failure_path: Сообщение принято или попытка записана в ledger под старым именем; имя контакта меняют; retry того же browser key и пользовательского содержимого получает 409 из-за нового префикса. Подтвержденное сообщение и прежнее авторство не меняются, дубль не создается.
- counterevidence: Новые ключи используют актуальное имя; retry без переименования работает. Сохраненная история и fallback после ledger retention сохраняют прежние подписи.
- fix_short: Определить стабильный fingerprint пользовательского payload и зафиксированного автора попытки без ослабления tenant/user/thread scope, защиты от key reuse и recovery semantics. Изменение persistence/send contract требует отдельного review; не вводить случайный новый ключ при автоматическом retry.
- acceptance: Текст и вложения с тем же key после rename возвращают исходное сообщение; changed payload по-прежнему получает conflict; failed/in-progress/recovery и конкурентное переименование не меняют исходного автора и не создают дубли; bounded reads/writes и tenant isolation покрыты integration tests.

Этот существующий риск обнаружен при проверке, а не внесен profile fix.
В текущем slice исправляется display profile/participants; send contract не меняется.
