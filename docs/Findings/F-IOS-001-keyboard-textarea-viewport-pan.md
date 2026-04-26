# F-IOS-001 Keyboard Textarea Viewport Pan

- `status`: `deferred`
- `found_in`: iPhone 16 production testing after iOS viewport/composer fixes
- `risk`: `medium`
- `urgency`: deferred; fix only after a focused iOS touch/keyboard experiment, because one attempted viewport-level mitigation caused a worse empty-screen regression
- `area`: frontend chat composer, iOS visual viewport, app shell viewport lock
- `evidence`:
  - On iPhone 16, with the keyboard open and the composer `textarea` focused, dragging vertically from the text field causes the chat layout to twitch and shows the system scroll indicator on the right.
  - Android and Windows do not show the same behavior.
  - `frontend/src/app/layouts/useAppViewportLock.ts` must follow `window.visualViewport.offsetTop`; freezing it while the keyboard is open was tried in commit `ac8cab0` and then reverted in `9f0ac58` because dragging the textarea moved the visual viewport while the shell stayed behind, leaving an empty screen.
  - `frontend/src/features/chat/components/message-composer/useVisualViewportKeyboardOpen.ts` now detects the open keyboard from `visualViewport.height` baseline rather than `window.innerHeight`, which reduced the bottom gap but does not stop iOS from panning the visual viewport.
  - WebKit has known keyboard/visual-viewport scroll issues even when page scroll is locked, including `overflow: hidden` not fully preventing body/viewport movement with virtual keyboard open.
- `fix_short`: Do not freeze shell `offsetTop`. If this is reopened, try a narrow non-passive `touchmove` guard on the composer textarea while the iOS keyboard is open, blocking only vertical drag when the textarea itself cannot scroll, so the gesture does not chain into document/visual viewport pan.
- `acceptance`:
  - On iPhone 16, dragging vertically on the focused composer textarea with the keyboard open no longer twitches the whole chat layout or exposes a growing/shrinking system scroll indicator.
  - Shell still follows legitimate `visualViewport.offsetTop` movement and does not regress into the empty-screen behavior seen with the reverted `ac8cab0` freeze attempt.
  - Text entry, caret placement, selection, send, attachment, voice controls, quick actions, and multi-line textarea internal scrolling still work on iOS.
  - Android and desktop composer behavior remain unchanged.
