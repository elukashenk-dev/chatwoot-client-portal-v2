# Auth surface branding research

Status: reviewed research note, not approved implementation plan.

Scope: MT-9H branding follow-up. This document records the UX/architecture
idea for improving auth login background customization. No code change is
approved by this note.

Independent review status: `Ready with fixes`; reviewer findings are
incorporated in this revision. The remaining gate before implementation is user
approval followed by a separate implementation plan.

## Problem

The current auth customization is too coarse for the login screen middle area.
An admin can change `authBackground`, text colors and auth images, but the
visual result is hard to control:

- the middle login area still reads as white or washed out;
- a custom auth background image/color can feel hidden by the current white
  surface and white gradient overlays;
- changing `authBackground` does not give predictable control over the full
  page composition with header image, form area and footer image;
- inputs, icons, links and the support card still use hardcoded white/slate
  surfaces, so they can clash with custom auth backgrounds.

## Current technical shape

Relevant runtime files:

- `frontend/src/app/layouts/AuthFrame.tsx`
- `frontend/src/shared/ui/AuthShell.tsx`
- `frontend/src/features/auth/pages/LoginPage.tsx`
- `frontend/src/features/auth/components/LoginForm.tsx`
- `frontend/src/shared/ui/inputStyles.ts`
- `frontend/src/features/branding/lib/brandingCss.ts`
- `frontend/src/index.css`

Current persisted/API auth fields:

- `auth_background_color`
- `auth_text_color`
- `auth_muted_text_color`
- `auth_header_image_asset_id`
- `auth_footer_image_asset_id`
- `auth_background_image_asset_id`

There is no separate persisted field for "middle/form surface background".
`authBackground` currently feeds semantic CSS variables for both auth frame and
auth surface. Default parity logic maps the default value to a production-like
outer frame and white inner surface, but any non-default value affects both
layers.

Important CSS details:

- `.auth-frame-background` applies `--portal-auth-frame-background-color` and
  `--portal-auth-background-image`.
- `.auth-shell-background` applies `--portal-auth-surface-background-color`,
  then overlays a fixed white gradient over `--portal-auth-background-image`.
- `.auth-shell-background` is applied twice in the current auth route: once by
  `AuthFrame` on the scrollable mobile shell and once by `AuthShell` on the
  auth content section. Any implementation must split those responsibilities
  before adding a new middle surface.
- `.auth-header-fade` and `.auth-footer-art::before` fade to hardcoded white.
- auth inputs/support card use `bg-white`, `bg-slate-*`, `border-slate-*` and
  similar hardcoded surfaces.

This explains the user-visible issue: the custom background is not absent, but
it is either reused in the wrong layer, covered by white fades/surfaces, or
muted by fixed white overlays.

## Design goal

The admin should be able to build a harmonious auth login screen without
knowing CSS:

- one background should define the overall auth page mood;
- header and footer images should blend into that page mood;
- the login form area should remain readable;
- default/reset state should remain visually identical to the production-like
  baseline;
- the preview should show exactly the same layers as the runtime screen.

## Recommended model: Auth canvas + content veil

Introduce a clear mental model in the product and code:

1. **Auth canvas**
   The full login screen background inside the mobile portal surface. This is
   where the auth background color/image belongs. It should sit behind the
   header image, middle content and footer image.

2. **Auth header/footer art**
   Existing top and bottom decorative images. Their fade masks should blend to
   the auth canvas or the content veil color, not to hardcoded white.

3. **Auth content veil**
   A controlled middle readability layer behind the title, form, links and
   support card. Default is solid white to preserve current production-like
   baseline. For branded screens it can be a tinted or semi-transparent surface
   so the page background remains visible without sacrificing readability.

4. **Auth controls**
   Inputs, password toggle, links and support card should derive their
   background, border, icon and focus colors from the content veil/text
   palette, not hardcoded `slate`/`white` values.

This model avoids the current overloaded `authBackground` behavior.

## UI controls to consider

Recommended first implementation slice:

- Rename the existing `authBackground` control in admin UI to
  `Фон auth-страницы`.
- Add one new color control: `Фон области входа`.
- Add one small density control for the content veil:
  `Плотность области входа`, stored as `authContentSurfaceOpacity`,
  integer `0..100`, default `100`.
- Keep existing `Цвет текста auth-экрана` and
  `Цвет вторичного текста auth-экрана`.
- Keep existing auth image slots, but describe them as:
  - `Auth: верхнее изображение`;
  - `Auth: нижнее изображение`;
  - `Auth: общий фон страницы`.

Possible defaults:

- auth page background: existing `#f3f7fc`;
- auth content veil color: `#ffffff`;
- auth content veil opacity: `100%`;
- auth text: `#0f172a`;
- auth muted text: `#64748b`.

With these defaults, reset/no-assets visual parity should not change.

## Options considered

### Option A: frontend-only remap of existing authBackground

Use the existing `authBackground` as page/canvas background only and keep the
middle content surface white.

Pros:

- no migration;
- low implementation risk;
- keeps production defaults stable.

Cons:

- does not solve the user's core request: the middle form area is still not
  customizable;
- on mobile, the outer frame can be invisible because the auth shell fills the
  available width;
- custom background image can still feel hidden behind a white content area.

Verdict: too small.

### Option B: add auth content veil controls

Keep existing auth background as the full page/canvas background and add a
separate content veil color/density for the login area. Derive input/support
card surfaces from this veil.

Pros:

- gives admins the missing control over the middle area;
- preserves the current defaults exactly;
- keeps the product model understandable;
- does not require a large theme builder;
- works with header/footer/background images.

Cons:

- requires a small DB/API contract extension;
- requires careful CSS variable work for input/support-card states;
- needs browser visual regression coverage for default, light custom and dark
  custom auth themes.

Verdict: recommended.

Recommended narrower form: **Option B-narrow**.

Only add:

- `authContentSurfaceColor`;
- `authContentSurfaceOpacity`.

Do not expose separate manual controls for input background, input border,
support-card background, link color or fade color in the first slice. Derive
those runtime values from content surface, auth text, auth muted text, primary
and accent colors. This keeps the admin UI understandable and avoids a full
theme-builder surface.

### Option C: full auth theme builder

Expose independent controls for page background, form panel, input background,
input border, button color, link color, overlay opacity, header fade and footer
fade.

Pros:

- maximum flexibility.

Cons:

- too many controls for tenant admins;
- high risk of unreadable combinations;
- larger API and test surface;
- not needed for the first stable branding release.

Verdict: defer.

## Implementation notes if approved later

Backend/data:

- Add nullable fields to `portal_branding_settings`:
  - `auth_content_surface_color` text, validated as `#RRGGBB`;
  - `auth_content_surface_opacity` integer, validated as `0..100`.
- Extend admin/public branding API types:
  - `colors.authContentSurface` maps to `auth_content_surface_color`;
  - `colors.authContentSurfaceOpacity` maps to
    `auth_content_surface_opacity`.
- Response defaults:
  - `authContentSurface: '#ffffff'`;
  - `authContentSurfaceOpacity: 100`.
- PATCH validation must reject unknown fields and invalid opacity values.
- Keep `authBackground` as the page/canvas background and PWA background source
  unless a separate PWA background decision is made later.

Compatibility:

- Default/reset state must still return the production-like visuals:
  auth page background `#f3f7fc`, content surface `#ffffff`, content opacity
  `100`.
- Existing rows with default `auth_background_color` and no new content-surface
  values should receive default response values, not a visible change.
- Existing rows with non-default `auth_background_color` need an explicit
  compatibility decision before implementation:
  - safer migration: initialize `auth_content_surface_color` to the existing
    `auth_background_color` and `auth_content_surface_opacity` to `100`, so the
    old tinted middle surface remains close to the current behavior;
  - cleaner new-model migration: leave the new fields null and accept that the
    middle surface becomes white until the admin changes it.
- For the current production rollout, choose the safer migration unless we
  verify there are no production tenants with saved non-default auth background
  values.

Frontend CSS/runtime:

- Add semantic variables:
  - `--portal-auth-canvas-background-color`;
  - `--portal-auth-canvas-background-image`;
  - `--portal-auth-content-surface-color`;
  - `--portal-auth-content-surface-opacity`;
  - derived input/support-card background and border variables.
- Separate DOM/CSS responsibilities:
  - `AuthFrame` owns only the app viewport and outer frame;
  - the scrollable auth shell owns the auth canvas background/image;
  - `AuthShell` owns header/footer art and the middle auth content;
  - the content veil must be a dedicated middle layer or pseudo-element under
    title/form/links/support content, not a reuse of `.auth-shell-background`.
- The content veil should cover the middle readable area, blend with header and
  footer fades, and never block input interaction.
- Remove hardcoded white fade targets from auth header/footer and generate fade
  colors from the content/canvas variables.
- Replace hardcoded auth input/support card `white/slate` surfaces with auth
  semantic variables.
- Keep default variables equivalent to current production-like visuals.

Admin preview:

- Preview parity is mandatory in the first implementation slice. The current
  fake login form in `AuthLoginPreview` uses its own `bg-white`/`border-slate`
  classes; that must be replaced or aligned so it uses the same auth control
  classes/CSS variables as runtime.
- Preview must use the same `TenantAuthShell`, CSS variables and form-control
  classes as runtime for all visible auth surface layers.
- Add preview cases for:
  - default reset;
  - light branded canvas with white veil;
  - image canvas with semi-transparent veil;
  - dark canvas with readable veil/text.

Testing:

- backend tests for defaults, patch validation and public/admin response shape;
- frontend unit tests for CSS variables and input/support-card class usage;
- Playwright checks for admin preview and customer auth runtime computed
  styles;
- regression check that reset returns the current production-like default.
- Because `AuthShell` and shared auth controls are reused beyond login, include
  at least smoke coverage for:
  - login;
  - register request;
  - password reset request;
  - OTP/verification form;
  - password setup form.

## Blast radius

This is not a login-only visual change. Any implementation that touches
`AuthShell`, `inputStyles`, `TextField`, `PasswordField`, `OtpInputGroup` or
shared auth cards affects registration, password reset, verification and
password setup screens. The first slice should keep the model shared and
consistent across those screens instead of special-casing login.

## Open decision

Before implementation, decide whether `auth_background_image` should be treated
strictly as the full auth canvas image. That is the recommended interpretation,
because header/footer already have dedicated image slots and the user's concern
is whole-page composition.

If approved, the next implementation slice should be:

`fix/mt-9h-auth-surface-branding`

Goal: implement Option B with a narrow DB/API/CSS/admin-preview change set and
preserve default visual parity.
