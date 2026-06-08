# MT-9H: Реальный Предпросмотр Портала В Админке Брендинга

> **Execution rule:** выполнять по task-файлам по порядку. После каждого task:
> implementation -> targeted tests -> локальное review -> fix findings.

## Цель

Заменить текущий ручной mock в `/admin/branding` на read-only предпросмотр,
который действительно похож на клиентский портал.

В первом безопасном проходе показываем только три экрана:

- `Вход`;
- `Чат`;
- `Инфо`.

`Настройки` и `Уведомления` не включаем: они строятся на похожем
full-screen паттерне, и для проверки branding parity достаточно `Инфо`.

## Ключевое Решение

Не открываем iframe с настоящими customer routes и не монтируем route pages,
которые ходят в customer API.

Вместо этого:

- берем unsaved `BrandingDraft`;
- конвертируем его в preview-only `PublicBranding`;
- даем preview-компонентам `BrandingContext` и `TenantIdentityContext`;
- применяем те же CSS variables через `createBrandingCssProperties`;
- используем реальные portal primitives только там, где они безопасны;
- интерактивные элементы внутри phone-frame делаем disabled или
  presentation-only.

## Task Files

1. [task-01-preview-model-and-data.md](./task-01-preview-model-and-data.md)
   - preview model, sample chat data, первый failing unit test.
2. [task-02-preview-frame-and-login.md](./task-02-preview-frame-and-login.md)
   - phone-frame, переключатель экранов, login preview.
3. [task-03-chat-preview-readonly.md](./task-03-chat-preview-readonly.md)
   - chat preview, presentation header, read-only transcript boundary.
4. [task-04-chat-info-preview.md](./task-04-chat-info-preview.md)
   - chat info preview, presentation-only back affordance.
5. [task-05-admin-layout-and-e2e.md](./task-05-admin-layout-and-e2e.md)
   - admin layout, старые admin tests, Playwright coverage.
6. [task-06-verification-review-closure.md](./task-06-verification-review-closure.md)
   - финальные проверки, code review, docs/work-log decision, checkpoint.

## Acceptance Criteria

- Старый двухкарточный mock удален из `/admin/branding`.
- Preview имеет screen selector: `Вход`, `Чат`, `Инфо`.
- `Вход` выглядит как мобильный auth-экран и использует draft title,
  subtitle, logo, auth header/footer/background images.
- `Чат` выглядит как мобильный chat screen: branded header, transcript,
  disabled composer, sample messages.
- `Инфо` использует реальный chat info layout и draft `chatInfoTitle`,
  `supportLabel`, logo/monogram и branding colors.
- Preview обновляется от unsaved draft без сохранения.
- Uploaded/replaced/deleted assets отражаются через draft asset URLs.
- Внутри phone-frame нет send/logout/navigation/message action behavior.
- Переключение preview не дергает `/api/auth/*`, `/api/chat/*`,
  дополнительные `/api/branding`, Chatwoot URLs или object-storage URLs.
- Existing admin branding save/upload flows продолжают проходить.
- Playwright покрывает переключение экранов и layout без horizontal overflow
  на 1024/1280/1440.

## Non-Goals

- Не добавляем `Настройки` и `Уведомления` в этот slice.
- Не добавляем новые branding fields.
- Не делаем интерактивные controls внутри phone-frame.
- Не добавляем profile preview.
- Не меняем backend routes.

## Independent Review Status

Каждый task-файл должен пройти отдельное read-only review до implementation.
Reviewer проверяет:

- scope task не расползся;
- task можно выполнить независимо по указанным файлам;
- нет customer API/Chatwoot authority в browser preview;
- read-only границы не ломают обычный customer runtime;
- тесты task реально защищают риск task.
