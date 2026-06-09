# F-BRANDING-001 Branding Reset Does Not Restore Production Visual Baseline

- `status`: `open`
- `found_in`: admin branding local QA against production baseline
- `risk`: `high`
- `urgency`: fix before branding production push
- `area`: frontend branding runtime, admin branding reset, backend branding defaults, PWA branding defaults
- `evidence`:
  - Current production source is `main` commit `43f52e9`, recorded in
    `docs/roadmap/work-log.md`.
  - Production CSS currently uses a light chat header:
    `.chat-header-background { background: rgb(255 255 255 / 0.97) }`.
  - Current branding defaults in
    `frontend/src/features/branding/lib/brandingDefaults.ts` and
    `backend/src/modules/branding/brandingDefaults.ts` set
    `chatHeaderBackground` to `#112540` and `chatHeaderText` to `#ffffff`.
  - Admin `Сбросить цвета` copies `defaultBrandingColors`, and
    `createBrandingPatch()` sends the full `colors` object to the backend.
  - Backend saves those colors as explicit tenant settings, so the old CSS
    fallbacks no longer apply after reset + save.
  - Local `buhfirma` after reset has empty assets but explicit saved colors:
    `chat_header_background_color=#112540`,
    `chat_header_text_color=#ffffff`, `chat_background_color=#ffffff`,
    `auth_background_color=#f3f7fc`.
  - Browser computed-style check showed production login uses:
    outer auth frame `slate-200`, inner shell `white`, auth section `white`.
    Local reset uses `#f3f7fc` for all three levels.
  - `brandingCss.ts` maps `primary` directly to `--color-chat-outgoing`.
    Production outgoing chat color is `#465a72`; reset currently makes it
    `#112540`.
- `fix_short`: Preserve PWA defaults, but make visual reset defaults match the
  pre-branding production UI through explicit semantic visual tokens for auth
  frame/surface, chat app background/surface, chat header controls and default
  outgoing bubble color. Update frontend/backend tests and browser QA against
  the production-like light-header/default visual contract.
- `acceptance`:
  - Admin `Сбросить цвета` + save + no uploaded assets restores login, chat and
    info screens to the current production visual baseline.
  - Default chat header is light with dark text and light-header controls.
  - Custom dark chat header still remains readable after changing header colors.
  - Default auth screen keeps production fallback header/footer images and uses
    production-like outer frame and inner white shell.
  - Default chat outgoing bubble color remains `#465a72`.
  - PWA manifest defaults remain production-compatible:
    `theme_color=#112540`, `background_color=#f3f7fc`, fallback icons unless a
    PWA icon is uploaded.
  - Existing tenant-scoped branding API, asset upload/delete and preview
    isolation remain unchanged.
  - Frontend/backend targeted tests and browser checks cover the reset/default
    contract.
