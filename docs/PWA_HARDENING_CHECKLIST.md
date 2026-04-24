# PWA Hardening Checklist

Короткий manual checklist для `Phase 9. PWA App Hardening`.

## Browser Tab

- `manifest.webmanifest` доступен и содержит `display: standalone`.
- `sw.js` отдается с frontend origin.
- production `sw.js` содержит build-specific revision, чтобы installed PWA мог обнаруживать новые deploy-версии.
- `/api/health` проходит через frontend origin и не кэшируется service worker.
- login/session bootstrap работает после обычного reload.
- chat открывается, history грузится, text/file/voice send не ломаются.
- при offline появляется понятное состояние "нет соединения".
- после `online`/возврата во вкладку chat пересинхронизируется без duplicate sends.
- если backend-session истекла во время background/sleep, приложение уводит пользователя обратно в login flow, а не оставляет внутри stale chat shell.
- если появляется waiting service worker, пользователь видит app update banner и сам решает, когда применить update.

## Installed PWA / Android Or Desktop

- приложение устанавливается из Chromium-браузера.
- после установки открывается в standalone, а не в обычной вкладке.
- safe area / header / composer не упираются в системные панели.
- app update banner тоже не залезает под top safe area / системный статус-бар.
- keyboard не перекрывает composer критично.
- file picker открывается и attachment send работает в installed mode.
- app update banner работает и после применения update приложение корректно перезагружается.
- production VM manual validation, 2026-04-24:
  - Windows installed PWA открывается standalone и chat остается доступен.
  - app update banner применяет update, перезагружает приложение и исчезает.
  - text, voice и file send работают в installed mode.
  - offline warning виден рядом с composer, отправка блокируется, после возврата сети chat восстанавливается.
  - background/resume не показывает ложный `Не удалось обновить чат...` error.
  - composer остается видимым и удобным при фокусе в поле сообщения.
  - после scroll-follow fix потребовался service-worker build revision stamp: без изменения `sw.js` установленное PWA могло держать старый JS cache без update banner.
  - chat app shell должен быть ограничен `100dvh`: composer остается внутри viewport, а новые сообщения растят только transcript scroller.
  - window `focus` не должен запускать lifecycle resync: в Windows installed PWA фокус textarea мог раз в 15 секунд дергать refresh и визуально "нырять" лентой под composer.

## iOS Home Screen Web App

- страница добавляется на Home Screen.
- после открытия из Home Screen запускается как отдельное web app окно.
- header/footer/composer не конфликтуют с safe area.
- app update banner не упирается в верхнюю системную зону.
- offline state и reconnect остаются понятными.
- login/session bootstrap, expired-session redirect и chat send не ломаются после повторного открытия приложения.

## Explicit Non-Goal

- offline send queue / outbox в `Phase 9` не добавляется.
- если устройство offline, портал не должен делать вид, что message/file send поставлен в надежную очередь.
