# Auth Full Background Branding Manual Test Cases

Ручной QA-чеклист для ветки `feature/phase-auth-design-polish`.

Scope:

- default auth layout по
  `docs/design/2026-06-16-provgroup-login-screen-figma-spec.md`;
- Full Background auth branding в `/admin/branding`;
- customer auth runtime;
- public legal pages and registration legal consent.

Out of scope:

- финальная юридическая редактура текстов документов;
- Chatwoot core;
- object-storage internals, кроме проверки portal-owned asset URLs в браузере.

## Preconditions

- Локальные backend/frontend сервисы запущены по обычному local runbook.
- Есть tenant admin с доступом к `/admin/branding`.
- Есть customer account или тестовый auth flow для `/auth/login`.
- Browser cache можно очистить между кейсами или открыть clean profile/incognito.
- Подготовить 2 изображения:
  - светлый auth background;
  - темный/контрастный auth background.

Перед началом зафиксировать:

```text
Branch:
Commit:
Browser:
Viewport/device:
Tenant/domain:
Tester:
Date:
```

## TC-AUTH-001 Default Login Layout At 390px

Steps:

1. Открыть customer `/auth/login`.
2. В DevTools включить viewport `390 x 844`.
3. Проверить визуально порядок блоков:
   logo, title, subtitle, email, password, legal text, submit, secondary links,
   support divider, support question, phone.
4. Сравнить с
   `docs/design/2026-06-16-provgroup-login-screen-figma-spec.md`.

Expected:

- Логотип примерно `63 x 63`, расположен сверху и по центру.
- Контентная колонка примерно `300px`.
- Inputs высотой около `50px`, button около `47px`.
- Нет старых верхней/нижней auth-картинок.
- Нет старой support card/veil.
- Текст не перекрывается и не вылезает за viewport.

Result:

```text
Pass/Fail:
Notes:
Screenshot:
```

## TC-AUTH-002 Default Login Layout At 440px

Steps:

1. Открыть customer `/auth/login`.
2. В DevTools включить viewport `440 x 956`.
3. Проверить, что layout сохраняет ту же иерархию, но получает больше
   вертикального воздуха.

Expected:

- Типографика не увеличивается от ширины viewport.
- Контент остается центрированным.
- Support block видим без горизонтального overflow.
- Ничего не перекрывается.

Result:

```text
Pass/Fail:
Notes:
Screenshot:
```

## TC-AUTH-003 Short Mobile Height

Steps:

1. Открыть `/auth/login`.
2. Проверить viewport `390 x 740` или близкий короткий экран.
3. Прокрутить страницу сверху вниз.

Expected:

- Верхний logo/title/forms остаются доступны.
- Support block доступен через scroll, если не помещается.
- Нет наложения кнопки, legal text и support block.

Result:

```text
Pass/Fail:
Notes:
Screenshot:
```

## TC-AUTH-004 Login Form Interaction States

Steps:

1. Открыть `/auth/login`.
2. Tab-переходом пройти email, password, password eye, submit, links.
3. Ввести некорректные данные и отправить форму.
4. Проверить password visibility toggle.
5. Если возможно, проверить browser autofill.

Expected:

- Focus state видим и не ломает размеры controls.
- Password eye работает и не сдвигает поле.
- Error message использует новый auth message style.
- Autofill не делает поле визуально старым/желтым/нечитаемым.
- Overlay/background не блокирует клики и ввод.

Result:

```text
Pass/Fail:
Notes:
Screenshot:
```

## TC-AUTH-005 Informational Legal Text On Login

Steps:

1. Открыть `/auth/login`.
2. Проверить legal text под формой.
3. Открыть link `Пользовательское соглашение`.
4. Вернуться назад.
5. Открыть link `Политикой обработки персональных данных`.

Expected:

- На login нет checkbox.
- Login button не блокируется legal text.
- Оба legal links реальные и ведут на public pages.
- Legal text не выглядит как fake non-clickable links.

Result:

```text
Pass/Fail:
Notes:
Screenshot:
```

## TC-AUTH-006 Public Legal Pages

Steps:

1. В clean/incognito session открыть `/legal/terms`.
2. В clean/incognito session открыть `/legal/privacy`.
3. Авторизоваться и повторить открытие обоих URL.

Expected:

- Оба URL открываются без redirect на login.
- Оба URL открываются и для authenticated user.
- Есть понятный title документа и версия.
- Link `Вернуться ко входу` ведет на `/auth/login`.

Result:

```text
Pass/Fail:
Notes:
Screenshot:
```

## TC-AUTH-007 Registration Consent UI

Steps:

1. Открыть `/auth/register`.
2. Заполнить имя и email.
3. Не отмечать legal checkboxes.
4. Отметить только `Я принимаю условия Пользовательского соглашения`.
5. Отметить только/затем оба consent checkboxes.
6. Снять один checkbox.

Expected:

- Submit disabled, пока не отмечены оба required controls.
- Controls отдельные:
  - user agreement acceptance;
  - personal data processing consent plus privacy-policy awareness.
- Links внутри labels открывают legal pages.
- Если снять любой required checkbox, submit снова disabled.

Result:

```text
Pass/Fail:
Notes:
Screenshot:
```

## TC-AUTH-008 Registration Consent Submit

Steps:

1. Открыть `/auth/register`.
2. Заполнить валидные имя и email.
3. Отметить оба legal checkboxes.
4. Отправить форму.
5. Проверить переход на `/auth/register/verify`.

Expected:

- Request проходит только после явного consent.
- Пользователь видит verify-code step.
- При повторной отправке кода consent state сохраняется для registration flow.

Optional API check:

```bash
curl -i \
  -H 'Content-Type: application/json' \
  -d '{"fullName":"Test User","email":"test@example.com"}' \
  http://localhost:<backend-port>/api/auth/register/request
```

Expected API check:

- backend rejects request without consent flags.

Result:

```text
Pass/Fail:
Notes:
Screenshot:
```

## TC-AUTH-009 Shared Auth Shell Pages

Steps:

1. Открыть `/auth/register`.
2. Открыть `/auth/password-reset/request`.
3. Пройти до OTP verify page.
4. Пройти до set-password page.
5. Открыть `/admin/login`.

Expected:

- Заголовки используют тот же visual hierarchy, что login.
- Instruction/note text использует новый auth helper/message style.
- Form controls выглядят как часть нового auth design.
- Нет смешения со старым header/footer art или old support card.
- `/admin/login` использует тот же shell baseline.

Result:

```text
Pass/Fail:
Notes:
Screenshot:
```

## TC-BRANDING-001 Admin Uploads Full Auth Background

Steps:

1. Войти как tenant admin.
2. Открыть `/admin/branding`.
3. Перейти в `Изображения`.
4. Загрузить `auth_background_image`.
5. Проверить preview.
6. Сохранить настройки.
7. Reload страницы.

Expected:

- В UI есть только `Вход: общий фон` / общий фон экрана входа для auth artwork.
- Нет controls для старых `auth_header_image` и `auth_footer_image`.
- После upload появляется replace/delete state.
- После reload изображение остается привязанным.
- Preview показывает auth background через portal-owned URL `/api/branding/assets/...`.

Result:

```text
Pass/Fail:
Notes:
Screenshot:
```

## TC-BRANDING-002 Admin Appearance Presets Persist

Steps:

1. Открыть `/admin/branding`.
2. Перейти в `Экран входа`.
3. Выбрать:
   - `Темная`;
   - `Темная дымка`;
   - `Контур`;
   - `Градиент`.
4. Сохранить.
5. Reload страницы.

Expected:

- Все выбранные segmented controls остаются выбранными после reload.
- Preview сразу отражает выбранную схему, overlay, field style and button style.
- Во время save controls заблокированы и не принимают повторный ввод.

Result:

```text
Pass/Fail:
Notes:
Screenshot:
```

## TC-BRANDING-003 Light Background Readability

Steps:

1. Загрузить светлый auth background.
2. Выбрать light scheme.
3. Проверить `Без защиты`, затем `Светлая дымка`, затем `Темная дымка`.
4. Проверить login preview и real `/auth/login`.

Expected:

- Text, input borders, icons, links and phone readable.
- Overlay does not hide the image completely.
- Button remains visually primary.

Result:

```text
Pass/Fail:
Notes:
Screenshot:
```

## TC-BRANDING-004 Dark Background Readability

Steps:

1. Загрузить темный/контрастный auth background.
2. Выбрать dark scheme.
3. Проверить `Темная дымка`, `Контур`, `Градиент`.
4. Открыть real `/auth/login`.

Expected:

- Title/subtitle/legal/support text readable.
- Outline fields readable and clickable.
- Gradient button readable.
- Phone icon and phone text use main/accent color consistently.

Result:

```text
Pass/Fail:
Notes:
Screenshot:
```

## TC-BRANDING-005 Runtime Preview Parity

Steps:

1. Настроить background, colors and appearance в admin.
2. Сравнить `/admin/branding` preview tab `Вход` с real `/auth/login`.
3. Проверить viewport около mobile preview width.

Expected:

- Preview and real login use the same block order.
- Same logo placement, title/subtitle, fields, legal text, button and support
  block.
- Preview не делает customer runtime API calls for real auth/chat data.

Result:

```text
Pass/Fail:
Notes:
Screenshot:
```

## TC-BRANDING-006 Auth Background Does Not Leak Into Chat

Steps:

1. Настроить `auth_background_image`.
2. Настроить другой `chat_background_image`.
3. Открыть `/auth/login`.
4. Авторизоваться и открыть customer chat.
5. Открыть chat info screen.

Expected:

- `/auth/login` uses auth background.
- Chat surfaces use chat background, not auth background.
- Chat header background remains from chat header settings.
- No browser-visible object-storage URLs, only portal `/api/branding/assets/...`.

Result:

```text
Pass/Fail:
Notes:
Screenshot:
```

## TC-BRANDING-007 Replace And Delete Auth Background

Steps:

1. Загрузить first auth background.
2. Сохранить и открыть `/auth/login`.
3. Заменить background на второй.
4. Сохранить и reload.
5. Удалить auth background.
6. Сохранить и reload.

Expected:

- После replace real login показывает новый background.
- После delete real login возвращается к default auth background color.
- Старый image URL не остается в inline style.

Result:

```text
Pass/Fail:
Notes:
Screenshot:
```

## TC-BRANDING-008 Old Auth Artwork Contract Removed

Steps:

1. Открыть admin branding assets section.
2. Открыть real `/auth/login`.
3. В DevTools Elements поискать:
   - `auth-header-art`;
   - `auth-footer-art`;
   - `auth-header-shell`;
   - `auth-support-card`.

Expected:

- В admin нет upload slots для old auth header/footer artwork.
- В runtime DOM старые auth classes не рендерятся.
- Auth artwork представлен только full-screen background layer.
- В admin colors нет отдельного поля `Фон формы входа`.

Result:

```text
Pass/Fail:
Notes:
Screenshot:
```

## TC-BRANDING-009 Admin Save Error Handling

Steps:

1. Открыть `/admin/branding`.
2. Изменить appearance presets.
3. Спровоцировать save error, например временно выключить backend или
   использовать DevTools network blocking.
4. Вернуть backend/network и сохранить снова.

Expected:

- UI показывает controlled error.
- Draft values не теряются после failed save.
- После успешного retry status становится saved.

Result:

```text
Pass/Fail:
Notes:
Screenshot:
```

## TC-ACCESS-001 Keyboard And Screen Reader Basics

Steps:

1. На `/auth/login` пройти page только клавиатурой.
2. На `/auth/register` пройти legal checkboxes только клавиатурой.
3. Проверить visible focus на links, checkboxes, fields, buttons.
4. Проверить accessible names через browser accessibility tree или screen
   reader smoke.

Expected:

- Все интерактивные элементы доступны с keyboard.
- Checkboxes имеют понятные names.
- Links не теряют focus outline.
- Disabled buttons announced as disabled.

Result:

```text
Pass/Fail:
Notes:
Screenshot:
```

## TC-RELEASE-001 Production Release Gate

Steps:

1. Проверить `/legal/terms`.
2. Проверить `/legal/privacy`.
3. Сверить тексты с operator-approved legal documents.

Expected:

- Before production rollout, first-run placeholder legal copy replaced by
  operator-approved legal texts.
- Если тексты еще не утверждены, production release remains blocked.

Result:

```text
Pass/Fail:
Notes:
Owner:
```
