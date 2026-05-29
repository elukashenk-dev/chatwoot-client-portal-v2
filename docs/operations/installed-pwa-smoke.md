# Installed PWA Smoke

Короткий smoke для проверки Offline-first PWA MVP именно как установленного
приложения на телефоне. Chromium E2E доказывает runtime-логику, но Android
Chrome installed PWA и iOS/iPadOS Home Screen PWA имеют отдельные platform
поведения: install identity, standalone запуск, IndexedDB retention, service
worker lifecycle и offline reopen.

## Когда Запускать

- после изменения service worker, manifest, icons, tenant metadata, offline
  IndexedDB schema, auth cache, chat cache или durable outbox;
- перед production rollout Offline-first PWA;
- после production/staging deploy, если нужно подтвердить реальное устройство.

## Требования К Окружению

- HTTPS origin с production-like backend. Local HTTP по LAN для телефона не
  подходит: service worker и installability на реальном устройстве должны
  проверяться на trusted origin.
- Tenant должен быть доступен по своему host, например `lk.provgroup.ru`.
- Нужен portal user, который уже может войти в `private:me`.
- Для проверки доставки offline message нужен доступ к Chatwoot/agent view или
  другой надежный способ увидеть, что сообщение доставлено ровно один раз.
- Перед прогоном удалить старую установленную PWA-копию этого origin и очистить
  site data для чистого install smoke. Для отдельной проверки обновления можно
  оставить старую копию, но это должен быть отдельный прогон.
- Storage-loss шаг проверяет удаление только IndexedDB database
  `portal-offline` при сохраненном service worker/app shell. Если на устройстве
  доступна только полная очистка site data, этот шаг записывать как `BLOCKED`
  или как отдельную platform note: полная очистка может удалить app shell и
  проверить уже browser-level eviction, а не controlled app state.

## Что Записать Перед Прогоном

```md
| Field              | Value |
| ------------------ | ----- |
| Date/time          |       |
| Commit/deploy      |       |
| Tenant URL         |       |
| Portal user        |       |
| Android device/OS  |       |
| Chrome version     |       |
| iOS/iPadOS device  |       |
| iOS/iPadOS version |       |
| Safari version     |       |
```

Не записывать passwords, session cookies, Chatwoot tokens, message text из
реальных клиентов или другие secrets.

## Android Chrome Installed PWA

| Step | Check                                                                                                                                      | Expected                                                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| A1   | Открыть tenant URL в Android Chrome.                                                                                                       | Страница открылась, tenant name правильный.                                                            |
| A2   | Установить PWA через browser install prompt или `Add to Home screen`.                                                                      | На home screen появился правильный app name/icon.                                                      |
| A3   | Запустить PWA с home screen.                                                                                                               | Открывается standalone UI без browser address bar.                                                     |
| A4   | Войти online и открыть `private:me`.                                                                                                       | Чат загружен, indefinite splash нет.                                                                   |
| A5   | Отправить online text smoke message.                                                                                                       | Сообщение доставлено и видно в чате/Chatwoot.                                                          |
| A6   | Полностью закрыть PWA, включить airplane mode или отключить сеть.                                                                          | Устройство реально offline.                                                                            |
| A7   | Запустить PWA с home screen offline.                                                                                                       | После предыдущего online входа открываются сохраненные tenant/auth/chat данные, вместо вечного splash. |
| A8   | Написать text message offline.                                                                                                             | Сообщение видно в чате со статусом queued.                                                             |
| A9   | Полностью закрыть и снова открыть PWA offline.                                                                                             | Queued message сохранилось и не исчезло.                                                               |
| A10  | Вернуть сеть.                                                                                                                              | Queued message отправилось ровно один раз, статус queued исчез.                                        |
| A11  | Обновить/перезапустить PWA online.                                                                                                         | Чат показывает canonical backend state без дублей.                                                     |
| A12  | Через remote/browser tooling удалить только IndexedDB `portal-offline`, оставить установленную PWA и app shell, затем открыть PWA offline. | Появляется controlled online-required/session-check UI, старый чат не открывается.                     |

## iOS/iPadOS Home Screen PWA

| Step | Check                                                                                                                                                                       | Expected                                                                                               |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| I1   | Открыть tenant URL в Safari.                                                                                                                                                | Страница открылась, tenant name правильный.                                                            |
| I2   | `Share` -> `Add to Home Screen`.                                                                                                                                            | На Home Screen появился правильный app name/icon.                                                      |
| I3   | Запустить PWA с Home Screen.                                                                                                                                                | Открывается standalone UI без Safari address bar.                                                      |
| I4   | Войти online и открыть `private:me`.                                                                                                                                        | Чат загружен, indefinite splash нет.                                                                   |
| I5   | Отправить online text smoke message.                                                                                                                                        | Сообщение доставлено и видно в чате/Chatwoot.                                                          |
| I6   | Полностью закрыть PWA, включить airplane mode или отключить сеть.                                                                                                           | Устройство реально offline.                                                                            |
| I7   | Запустить PWA с Home Screen offline.                                                                                                                                        | После предыдущего online входа открываются сохраненные tenant/auth/chat данные, вместо вечного splash. |
| I8   | Написать text message offline.                                                                                                                                              | Сообщение видно в чате со статусом queued.                                                             |
| I9   | Полностью закрыть и снова открыть PWA offline.                                                                                                                              | Queued message сохранилось и не исчезло.                                                               |
| I10  | Вернуть сеть.                                                                                                                                                               | Queued message отправилось ровно один раз, статус queued исчез.                                        |
| I11  | Перезапустить PWA online.                                                                                                                                                   | Чат показывает canonical backend state без дублей.                                                     |
| I12  | Если доступно iOS/iPadOS tooling для selective storage removal: удалить только IndexedDB `portal-offline`, оставить Home Screen PWA и app shell, затем открыть PWA offline. | Появляется controlled online-required/session-check UI, старый чат не открывается.                     |

## Result Template

```md
| Platform                     | Result                | Notes |
| ---------------------------- | --------------------- | ----- |
| Android Chrome installed PWA | PASS / FAIL / BLOCKED |       |
| iOS/iPadOS Home Screen PWA   | PASS / FAIL / BLOCKED |       |
```

`FAIL` использовать, если приложение открыло неверные данные, зависло на splash,
потеряло queued text, отправило дубль или показало browser-only UI вместо
standalone PWA.

`BLOCKED` использовать только с точной причиной, например:

- нет физического Android/iOS устройства;
- нет HTTPS staging/production deploy с нужным commit;
- нет тестового portal user;
- нет доступа проверить delivered message в Chatwoot.

## Если Найден FAIL

Создать отдельный finding в `docs/findings/`:

- один файл на одну проблему;
- указать platform, device, OS/browser version, tenant URL, commit/deploy;
- описать минимальные steps to reproduce;
- приложить ожидаемое и фактическое поведение;
- указать targeted checks, которые должны пройти после фикса.

Не чинить найденный platform bug скрыто внутри другого feature slice.
