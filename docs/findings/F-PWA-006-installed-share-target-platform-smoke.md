# F-PWA-006: Installed Share Target Platform Smoke

- status: open
- found_in: Attachment UX Slice 3 closure on 2026-07-29
- risk: medium
- urgency: Complete before advertising or rolling out installed-PWA system
  sharing in production.
- area: Installed PWA Web Share Target registration and platform integration
- evidence:
  `docs/operations/pwa-share-target-smoke.md` records that Android Chromium,
  Windows Edge/Chrome and iPhone/iPad fallback checks could not run because no
  suitable real installed-PWA device was available. Automated Playwright
  coverage proves the manifest and foreground handoff, but cannot prove
  operating-system share-sheet registration.
- fix_short:
  Run the documented smoke on real Android and Windows installed PWAs and the
  iPhone/iPad fallback, recording only versions and pass/fail without client
  file names.
- acceptance:
  Every row in `docs/operations/pwa-share-target-smoke.md` names the tested
  device/OS and browser versions and records `pass`; Android and Windows prove
  explicit destination plus no automatic send, and iPhone/iPad proves the
  picker/camera fallback without an advertised Web Share Target.
