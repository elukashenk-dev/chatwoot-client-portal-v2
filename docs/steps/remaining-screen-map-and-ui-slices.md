# Remaining Screen Map And UI Slices

Этот файл больше не хранит полную карту экранов с нуля.

Он временно держит только тот screen-map и slice-context, который еще нужен до полной реализации и после удаления уже выполненных шагов.

Из файла сознательно убрано уже реализованное:

- auth base shell and shared auth UI foundation;
- route `/auth/login`;
- route `/auth/register` как request-screen;
- route `/auth/register/verify`;
- route `/auth/password-reset/request`;
- route `/auth/password-reset/verify`;
- route `/auth/password-reset/set-password`;
- `OtpInputGroup` и `ResendCodeRow` для verify-screens;
- `PasswordRulesCard` и финальный submit-success UX для set-password screens;
- рекомендации начинать implementation c login screen.

## Remaining Route Map

- `/app/chat`
  Защищенный chat route с внутренними состояниями `loading`, `ready` и дальнейшими chat slices.

## Remaining Route Rules

- `chat loading` остается состоянием route `/app/chat`, а не отдельным route.

## Remaining UI Slices

- `ChatShell`, transcript rendering, `LoadOlderMessagesButton`, `AttachmentCard`, `MessageComposer`, `SendButton`.
- `ReplyPreview` и `QuickEmojiBar`.
- `MessageCalendarPopover`.
- `VoiceRecordButton` и связанный recording/send flow.

## Delete Condition

Удалить этот файл, когда оставшиеся screens и slices либо:

- реализованы;
- либо полностью и без потерь перенесены в устойчивые документы.
