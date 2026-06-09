# Admin Branding Default Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make admin branding reset/no-assets state visually match the current production portal baseline while preserving tenant-owned branding customization and PWA defaults.

**Architecture:** Keep the existing branding API shape and persistence model. Fix the mismatch by adding visual semantic CSS tokens around storage fields that currently serve multiple meanings: PWA theme/background, auth outer frame, auth inner surface, chat outer app background, chat inner surface, chat header, and default outgoing message color. Production-compatible defaults must be explicit and tested, not accidental Tailwind fallback behavior.

**Tech Stack:** React, TypeScript, Tailwind CSS v4 CSS variables, Fastify backend, Drizzle/Postgres, Vitest, Playwright/browser runtime.

---

## Current Baseline And Problem

Production baseline is `main` commit `43f52e9` according to
`docs/roadmap/work-log.md`.

Observed production visual defaults:

- login outer app frame: `bg-slate-200`;
- login inner shell and `AuthShell` section: `white`;
- fallback auth header/footer images: `/default-branding/auth-header.png` and
  `/default-branding/auth-footer.png`;
- chat header background: `rgb(255 255 255 / 0.97)`;
- chat header text: dark slate;
- chat outgoing surface: `--color-chat-outgoing: #465a72`;
- PWA manifest: `theme_color=#112540`, `background_color=#f3f7fc`;
- fallback PWA icons remain `/pwa-icons/*`.

Current reset behavior:

- `AdminBrandingForm.resetColors()` copies `defaultBrandingColors`;
- `createBrandingPatch()` sends the whole `colors` object;
- backend persists the colors as explicit tenant settings;
- therefore old CSS fallbacks no longer apply after reset + save.

Current mismatching defaults:

```ts
{
  authBackground: '#f3f7fc',
  chatBackground: '#ffffff',
  chatHeaderBackground: '#112540',
  chatHeaderText: '#ffffff',
  primary: '#112540',
}
```

The values are not all wrong by themselves. The bug is that the same fields are
used for multiple UI layers:

- `authBackground` is both PWA background intent and auth screen visual
  background;
- `chatBackground` is both outer app runtime background and inner chat surface;
- `primary` is PWA/theme/brand intent and currently also drives outgoing
  message color;
- header controls are currently styled for a dark header, even when the desired
  default header is light.

## Persisted Old-Reset Policy

This fix does not automatically rewrite existing tenant rows that already saved
the old reset values, for example `chat_header_background_color=#112540` and
`chat_header_text_color=#ffffff`.

Reason:

- those values can also be a legitimate custom dark-header choice;
- production has not yet received the branding feature, so no production tenant
  should rely on an automatic repair;
- local QA data can be repaired safely by clicking `Сбросить цвета` and saving
  again after this fix.

If production or shared staging is found to contain old-reset rows before
deploy, do not silently migrate them. First run a read-only query to identify
candidate tenants, then ask for explicit operator approval before any data
change:

```sql
select
  t.slug,
  t.display_name,
  s.chat_header_background_color,
  s.chat_header_text_color,
  s.auth_background_color,
  s.chat_background_color,
  s.logo_asset_id,
  s.auth_header_image_asset_id,
  s.auth_footer_image_asset_id,
  s.auth_background_image_asset_id,
  s.chat_background_image_asset_id,
  s.chat_header_background_image_asset_id,
  s.updated_at
from portal_branding_settings s
join portal_tenants t on t.id = s.tenant_id
where s.chat_header_background_color = '#112540'
  and s.chat_header_text_color = '#ffffff';
```

Do not include an automatic database migration for this repair in the current
fix.

## Files And Responsibilities

- Modify `frontend/src/features/branding/lib/brandingDefaults.ts`
  - Keep public default color contract.
  - Change only visual defaults that are genuinely wrong in the public response,
    especially default chat header background/text.
  - Keep `primary=#112540` and `authBackground=#f3f7fc` because PWA manifest
    production defaults currently depend on those values.
- Modify `backend/src/modules/branding/brandingDefaults.ts`
  - Mirror frontend defaults exactly.
  - Keep backend public/admin branding response contract aligned with frontend.
- Modify `frontend/src/features/branding/lib/brandingCss.ts`
  - Add production visual defaults and semantic CSS variables.
  - Preserve exact legacy brand palette when `primary` and `accent` are default.
  - Keep custom brand behavior for non-default colors.
  - Restore default outgoing chat color without adding a separate persisted
    `chatOutgoing` field in this fix.
- Modify `frontend/src/index.css`
  - Use new semantic variables for auth frame, auth surface, chat outer app
    background and chat inner surface.
  - Remove the always-on chat-header gradient overlay so a default light header
    matches production more closely.
- Modify `frontend/src/features/chat/components/ChatHeader.tsx`
  - Replace dark-only white-transparent header control styles with semantic
    control variables.
  - Default light header must look like production; dark custom header must
    remain readable.
- Modify `frontend/src/features/chat/components/ChatFullScreenPanel.tsx`
  - Use the same header control variables for the back button on chat-info and
    related full-screen pages.
- Modify `frontend/src/features/admin-branding/components/portal-preview/ChatHeaderPreview.tsx`
  - Keep preview header styles in sync with runtime header styles.
- Modify tests:
  - `backend/src/modules/branding/service.test.ts`
  - `frontend/src/features/admin-branding/api/adminBrandingClient.test.ts`
  - `frontend/src/features/admin-shell/pages/AdminBrandingPage.test.tsx`
  - `frontend/src/features/branding/lib/BrandingProvider.test.tsx`
  - `frontend/src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx`
  - Any focused chat header/full-screen tests that assert old dark-default
    classes or values.
- Modify e2e fixtures/tests:
  - `tests/e2e/admin-branding-settings.spec.ts`
  - `tests/e2e/admin-branding-assets.spec.ts`
  - `tests/e2e/admin-branding-real-preview.spec.ts`
  - `tests/e2e/admin-login-ui.spec.ts`
  - `tests/e2e/pwa-runtime-smoke.spec.ts`

## Implementation Tasks

### Task 1: Lock The Default Color Contract

**Files:**

- Modify: `frontend/src/features/branding/lib/brandingDefaults.ts`
- Modify: `backend/src/modules/branding/brandingDefaults.ts`
- Test: `backend/src/modules/branding/service.test.ts`
- Test: `frontend/src/features/admin-branding/api/adminBrandingClient.test.ts`
- Test: `frontend/src/features/admin-shell/pages/AdminBrandingPage.test.tsx`

- [ ] **Step 1: Update frontend/backend default header colors**

Change both default files to keep PWA-sensitive defaults but restore the visual
chat header default:

```ts
export const defaultBrandingColors = {
  accent: '#4676b4',
  authBackground: '#f3f7fc',
  authMutedText: '#64748b',
  authText: '#0f172a',
  chatBackground: '#ffffff',
  chatHeaderBackground: '#ffffff',
  chatHeaderText: '#0f172a',
  chatMutedText: '#64748b',
  chatText: '#334155',
  primary: '#112540',
} as const
```

Do not change `primary` or `authBackground` in this task.

- [ ] **Step 2: Update backend default branding test**

In `backend/src/modules/branding/service.test.ts`, update the default public
branding expectation:

```ts
colors: expect.objectContaining({
  authBackground: '#f3f7fc',
  authText: '#0f172a',
  chatHeaderBackground: '#ffffff',
  chatHeaderText: '#0f172a',
  chatText: '#334155',
  primary: '#112540',
}),
```

Also keep the existing readable fallback test for a light saved header
background; it should still expect `chatHeaderText: '#0f172a'`.

- [ ] **Step 3: Update admin client fixture defaults**

In `frontend/src/features/admin-branding/api/adminBrandingClient.test.ts`,
change fixture colors:

```ts
chatHeaderBackground: '#ffffff',
chatHeaderText: '#0f172a',
```

Leave `primary`, `authBackground`, `chatBackground`, `chatText` and muted colors
unchanged unless a test explicitly proves a mismatch with production.

- [ ] **Step 4: Update admin reset test**

In `frontend/src/features/admin-shell/pages/AdminBrandingPage.test.tsx`, update
the reset expectations:

```ts
expect(screen.getByLabelText('Основной цвет')).toHaveValue('#112540')
expect(screen.getByLabelText('Фон шапки чата')).toHaveValue('#ffffff')
expect(screen.getByLabelText('Цвет текста шапки чата')).toHaveValue('#0f172a')
expect(screen.getByLabelText('Цвет текста чата')).toHaveValue('#334155')
```

And update the submitted patch expectation:

```ts
colors: expect.objectContaining({
  chatHeaderBackground: '#ffffff',
  chatHeaderText: '#0f172a',
  chatText: '#334155',
  primary: '#112540',
}),
```

- [ ] **Step 5: Run focused tests and verify failures/pass**

Run after the code/test edit:

```bash
pnpm --dir backend exec vitest run src/modules/branding/service.test.ts --reporter verbose
pnpm --dir frontend exec vitest run src/features/admin-branding/api/adminBrandingClient.test.ts src/features/admin-shell/pages/AdminBrandingPage.test.tsx --reporter verbose
```

Expected result: both commands pass after default contract updates.

### Task 2: Add Production Visual Semantic Tokens

**Files:**

- Modify: `frontend/src/features/branding/lib/brandingCss.ts`
- Modify: `frontend/src/index.css`
- Test: `frontend/src/features/branding/lib/BrandingProvider.test.tsx`

This task restores default outgoing-message parity. It does not add a separate
admin-facing `chatOutgoing` field; if product wants outgoing bubbles
customizable independently from `primary`, open that as a later branding-control
slice.

- [ ] **Step 1: Add explicit production visual defaults**

In `brandingCss.ts`, add constants near the color helpers:

```ts
const productionVisualDefaults = {
  authFrameBackground: '#e2e8f0',
  authSurfaceBackground: '#ffffff',
  chatAppBackground: '#e2e8f0',
  chatOutgoing: '#465a72',
  chatSurfaceBackground: '#ffffff',
  lightHeaderBorder: 'rgb(226 232 240 / 0.9)',
  lightHeaderControlBorder: 'rgb(226 232 240 / 0.6)',
  lightHeaderControlSurface: 'rgb(248 250 252 / 0.6)',
  lightHeaderControlText: '#475569',
  lightHeaderControlHoverBackground: 'rgb(241 245 249 / 0.8)',
  lightHeaderControlHoverText: '#112540',
  darkHeaderBorder: 'rgb(226 232 240 / 0.4)',
  darkHeaderControlBorder: 'rgb(255 255 255 / 0.2)',
  darkHeaderControlSurface: 'rgb(255 255 255 / 0.1)',
  darkHeaderControlText: 'rgb(255 255 255 / 0.74)',
  darkHeaderControlHoverBackground: 'rgb(255 255 255 / 0.15)',
  darkHeaderControlHoverText: '#ffffff',
} as const
```

Add exact legacy palette constants:

```ts
const legacyBrandColorVariables = {
  '--color-brand-50': '#f3f7fc',
  '--color-brand-100': '#e7eef8',
  '--color-brand-200': '#c4d5ed',
  '--color-brand-300': '#9cb9df',
  '--color-brand-400': '#6d96cb',
  '--color-brand-500': '#4676b4',
  '--color-brand-600': '#315d97',
  '--color-brand-700': '#234776',
  '--color-brand-800': '#173258',
  '--color-brand-900': '#112540',
  '--color-chat-outgoing': '#465a72',
} as const
```

- [ ] **Step 2: Preserve legacy palette only for exact default brand colors**

Update `createBrandColorVariables(primaryColor, accentColor)`:

```ts
if (
  primaryColor.toLowerCase() === defaultBrandingColors.primary &&
  accentColor.toLowerCase() === defaultBrandingColors.accent
) {
  return legacyBrandColorVariables
}
```

Keep the existing generated palette for all custom primary/accent values.

- [ ] **Step 3: Emit semantic layer variables**

In `createBrandingCssProperties`, compute default detection:

```ts
const isDefaultAuthBackground =
  authBackgroundColor.toLowerCase() === defaultBrandingColors.authBackground
const isDefaultChatBackground =
  chatBackgroundColor.toLowerCase() === defaultBrandingColors.chatBackground
const isDarkHeader = parseHexColor(chatHeaderBackgroundColor)
  ? (0.2126 * parseHexColor(chatHeaderBackgroundColor)!.r +
      0.7152 * parseHexColor(chatHeaderBackgroundColor)!.g +
      0.0722 * parseHexColor(chatHeaderBackgroundColor)!.b) /
      255 <
    0.55
  : false
```

If this inline luminance is too awkward, extract a small `isDarkColor(value,
fallback)` helper and reuse it with `getReadableForeground`.

Return these variables:

```ts
'--portal-auth-frame-background-color': isDefaultAuthBackground
  ? productionVisualDefaults.authFrameBackground
  : authBackgroundColor,
'--portal-auth-surface-background-color': isDefaultAuthBackground
  ? productionVisualDefaults.authSurfaceBackground
  : authBackgroundColor,
'--portal-chat-app-background-color': isDefaultChatBackground
  ? productionVisualDefaults.chatAppBackground
  : chatBackgroundColor,
'--portal-chat-surface-background-color': isDefaultChatBackground
  ? productionVisualDefaults.chatSurfaceBackground
  : chatBackgroundColor,
'--portal-chat-header-border-color': isDarkHeader
  ? productionVisualDefaults.darkHeaderBorder
  : productionVisualDefaults.lightHeaderBorder,
'--portal-chat-header-control-border': isDarkHeader
  ? productionVisualDefaults.darkHeaderControlBorder
  : productionVisualDefaults.lightHeaderControlBorder,
'--portal-chat-header-control-surface': isDarkHeader
  ? productionVisualDefaults.darkHeaderControlSurface
  : productionVisualDefaults.lightHeaderControlSurface,
'--portal-chat-header-control-text': isDarkHeader
  ? productionVisualDefaults.darkHeaderControlText
  : productionVisualDefaults.lightHeaderControlText,
'--portal-chat-header-control-hover-background': isDarkHeader
  ? productionVisualDefaults.darkHeaderControlHoverBackground
  : productionVisualDefaults.lightHeaderControlHoverBackground,
'--portal-chat-header-control-hover-text': isDarkHeader
  ? productionVisualDefaults.darkHeaderControlHoverText
  : productionVisualDefaults.lightHeaderControlHoverText,
```

Keep old variables (`--portal-auth-background-color`,
`--portal-chat-background-color`) for compatibility with existing CSS/tests, but
new runtime CSS must consume the semantic variables.

- [ ] **Step 4: Update CSS layer usage**

In `frontend/src/index.css`, change:

```css
.auth-frame-background,
.portal-frame-background {
  background-color: var(--portal-auth-frame-background-color, #e2e8f0);
  background-image: var(--portal-auth-background-image, none);
  ...
}

.auth-shell-background {
  background-color: var(--portal-auth-surface-background-color, #ffffff);
  ...
}

.app-runtime-background {
  background-color: var(--portal-chat-app-background-color, #e2e8f0);
  ...
}

.portal-shell,
.chat-runtime-surface {
  background-color: var(--portal-chat-surface-background-color, #ffffff);
  ...
}
```

For `.chat-header-background`, remove the unconditional decorative gradient and
use:

```css
.chat-header-background {
  background-color: var(
    --portal-chat-header-background-color,
    rgb(255 255 255 / 0.97)
  );
  background-image: var(--portal-chat-header-background-image, none);
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
  backdrop-filter: blur(18px);
}
```

This intentionally restores light-header parity, not byte-for-byte production
alpha parity. The production page currently computes the header as a nearly
white translucent surface; the reset/default branding contract should be a
white/light header with dark readable content, while custom header colors still
remain tenant-controlled.

- [ ] **Step 5: Add default CSS variable test**

In `BrandingProvider.test.tsx`, add or update a test with
`createDefaultPublicBranding('PROVGROUP')` so the `.portal-branding-scope`
inline style includes:

```ts
expect(scope).toHaveStyle({
  '--color-chat-outgoing': '#465a72',
  '--portal-auth-frame-background-color': '#e2e8f0',
  '--portal-auth-surface-background-color': '#ffffff',
  '--portal-chat-app-background-color': '#e2e8f0',
  '--portal-chat-header-background-color': '#ffffff',
  '--portal-chat-header-foreground': '#0f172a',
  '--portal-chat-surface-background-color': '#ffffff',
})
```

Also assert legacy palette preservation:

```ts
expect(scope).toHaveStyle({
  '--color-brand-700': '#234776',
  '--color-brand-800': '#173258',
  '--color-brand-900': '#112540',
})
```

- [ ] **Step 6: Run focused branding CSS tests**

```bash
pnpm --dir frontend exec vitest run src/features/branding/lib/BrandingProvider.test.tsx --reporter verbose
```

Expected result: test passes and proves default visual semantic variables.

### Task 3: Make Runtime Header Controls Work On Light And Dark Headers

**Files:**

- Modify: `frontend/src/features/chat/components/ChatHeader.tsx`
- Modify: `frontend/src/features/chat/components/ChatFullScreenPanel.tsx`
- Modify: `frontend/src/features/admin-branding/components/portal-preview/ChatHeaderPreview.tsx`
- Test: `frontend/src/features/chat/components/ChatHeader.test.tsx`
- Test: `frontend/src/features/chat/components/ChatFullScreenPanel.test.tsx`
- Test: `frontend/src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx`

- [ ] **Step 1: Update chat header class names**

In `ChatHeader.tsx`, replace the nav button base style with semantic variables:

```tsx
className =
  'inline-flex h-10 w-10 items-center justify-center rounded-chat-control text-[color:var(--portal-chat-header-control-text,#475569)] transition hover:bg-[color:var(--portal-chat-header-control-hover-background,rgb(241_245_249_/_0.8))] hover:text-[color:var(--portal-chat-header-control-hover-text,#112540)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100'
```

Replace the chat menu button style with:

```tsx
className =
  'inline-flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--portal-chat-header-control-border,rgb(226_232_240_/_0.6))] bg-[color:var(--portal-chat-header-control-surface,rgb(248_250_252_/_0.6))] text-[color:var(--portal-chat-header-control-text,#64748b)] transition hover:border-[color:var(--portal-chat-header-control-border,rgb(226_232_240_/_0.6))] hover:bg-[color:var(--portal-chat-header-control-hover-background,rgb(241_245_249_/_0.8))] hover:text-[color:var(--portal-chat-header-control-hover-text,#112540)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100'
```

If Tailwind arbitrary class escaping becomes brittle, define small CSS utility
classes in `index.css`, for example `.chat-header-icon-button` and
`.chat-header-menu-button`, and use those class names instead. Prefer the CSS
utility if tests or `pnpm code-health` show class strings are too noisy.

- [ ] **Step 2: Use semantic border color on header containers**

For `ChatHeader.tsx`, `ChatFullScreenPanel.tsx`, and preview header, replace
`border-slate-200/40` with:

```tsx
border-[color:var(--portal-chat-header-border-color,rgb(226_232_240_/_0.9))]
```

If Tailwind arbitrary color classes are not emitted reliably, move this to
`index.css`:

```css
.chat-header-border {
  border-color: var(--portal-chat-header-border-color, rgb(226 232 240 / 0.9));
}
```

Then use `border-b chat-header-border`.

- [ ] **Step 3: Update full-screen back button**

In `ChatFullScreenPanel.tsx`, update `backControlClassName` to the same
semantic light/dark control variables used by `ChatHeader.tsx`.

- [ ] **Step 4: Update preview header**

In `ChatHeaderPreview.tsx`, use the same header container/control classes as
runtime where possible. Preview must not drift back to dark-only controls.

- [ ] **Step 5: Update/extend tests**

Add assertions that runtime and preview headers include the semantic control
variable class or utility class. Example if using utility classes:

```ts
expect(screen.getByRole('banner')).toHaveClass('chat-header-background')
expect(screen.getByRole('button', { name: /меню/i })).toHaveClass(
  'chat-header-icon-button',
)
```

For `PortalPreviewFrame.test.tsx`, keep existing custom dark header coverage and
add default reset-like preview coverage for:

```ts
expect(container.querySelector('.portal-branding-scope')).toHaveStyle({
  '--portal-chat-header-background-color': '#ffffff',
  '--portal-chat-header-foreground': '#0f172a',
  '--portal-chat-header-control-hover-text': '#112540',
})
```

- [ ] **Step 6: Run header/preview tests**

```bash
pnpm --dir frontend exec vitest run src/features/chat/components/ChatHeader.test.tsx src/features/chat/components/ChatFullScreenPanel.test.tsx src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx --reporter verbose
```

Expected result: tests pass and cover semantic header controls.

### Task 4: Browser QA Against Production-Like Defaults

**Files:**

- Modify: `tests/e2e/admin-branding-settings.spec.ts`
- Modify: `tests/e2e/admin-branding-assets.spec.ts`
- Modify: `tests/e2e/admin-branding-real-preview.spec.ts`
- Modify: `tests/e2e/admin-login-ui.spec.ts`
- Modify: `tests/e2e/pwa-runtime-smoke.spec.ts`
- Optional docs update only if QA discovers a real blocker.

- [ ] **Step 1: Update Playwright branding fixture defaults**

In each e2e spec that seeds or mocks default branding colors, update the fixture
to the complete default color shape:

```ts
colors: {
  accent: '#4676b4',
  authBackground: '#f3f7fc',
  authMutedText: '#64748b',
  authText: '#0f172a',
  chatBackground: '#ffffff',
  chatHeaderBackground: '#ffffff',
  chatHeaderText: '#0f172a',
  chatMutedText: '#64748b',
  chatText: '#334155',
  primary: '#112540',
},
```

Apply this to:

- `tests/e2e/admin-branding-settings.spec.ts`
- `tests/e2e/admin-branding-assets.spec.ts`
- `tests/e2e/admin-branding-real-preview.spec.ts`
- `tests/e2e/admin-login-ui.spec.ts`

Do not change e2e fixtures that intentionally test a custom dark header.

- [ ] **Step 2: Add reset/default e2e assertions**

In `tests/e2e/admin-branding-settings.spec.ts`, extend the reset flow so
clicking `Сбросить цвета` asserts:

```ts
await expect(page.getByLabel('Фон шапки чата')).toHaveValue('#ffffff')
await expect(page.getByLabel('Цвет текста шапки чата')).toHaveValue('#0f172a')
await expect(page.getByLabel('Цвет текста чата')).toHaveValue('#334155')
await expect(page.getByLabel('Основной цвет')).toHaveValue('#112540')
```

In `tests/e2e/admin-branding-real-preview.spec.ts`, add a preview assertion
after default branding loads:

```ts
const previewScope = page.locator(
  '.portal-preview-device .portal-branding-scope',
)
await expect(previewScope).toHaveCSS(
  '--portal-chat-header-background-color',
  '#ffffff',
)
await expect(previewScope).toHaveCSS(
  '--portal-chat-header-foreground',
  '#0f172a',
)
await expect(previewScope).toHaveCSS('--color-chat-outgoing', '#465a72')
```

If Playwright cannot assert custom CSS properties through `toHaveCSS`, use
`evaluate`:

```ts
await expect
  .poll(async () =>
    previewScope.evaluate((node) =>
      getComputedStyle(node).getPropertyValue('--color-chat-outgoing').trim(),
    ),
  )
  .toBe('#465a72')
```

In `tests/e2e/pwa-runtime-smoke.spec.ts`, keep the current `theme_color`
assertion and add:

```ts
expect(manifest.background_color).toBe('#f3f7fc')
```

- [ ] **Step 3: Run focused Playwright specs**

Run:

```bash
pnpm test:e2e -- tests/e2e/admin-branding-settings.spec.ts tests/e2e/admin-branding-real-preview.spec.ts tests/e2e/admin-branding-assets.spec.ts tests/e2e/admin-login-ui.spec.ts tests/e2e/pwa-runtime-smoke.spec.ts
```

Expected result: all listed specs pass. If a local runtime dependency is down,
document the exact blocker and run the specs again after the dependency is
available.

- [ ] **Step 4: Start or verify local services for manual QA**

Use the current local stack. If services are not running, start the long-running
dev processes in separate terminal sessions:

```bash
pnpm db:up
pnpm storage:up
pnpm dev:backend
pnpm --dir frontend dev --host 0.0.0.0
```

If dev servers are already running, do not restart unless the browser shows
stale code.

- [ ] **Step 5: Reset local tenant values through admin UI**

Open:

```text
http://buhfirma.127.0.0.1.nip.io:5173/admin/branding
```

Manual path:

1. Log in as tenant admin if needed.
2. Click `Сбросить цвета`.
3. Ensure all asset slots are empty or delete uploaded assets.
4. Save settings.

If admin login is unavailable in the current local session, use the API/DB only
for diagnostics and document the blocker. Do not silently skip browser QA; the
mocked Playwright specs from Step 3 still must run.

- [ ] **Step 6: Compare login computed styles**

Check local login:

```text
http://buhfirma.127.0.0.1.nip.io:5173/auth/login
```

Expected computed values:

- `main` background is `slate-200`/`#e2e8f0` equivalent;
- inner auth shell background is white;
- `section` background is white;
- fallback auth header/footer images are present;
- page title/copy follows current saved copy unless copy is reset separately.

Do not require copy to match production unless a copy reset feature is included
in this fix. This fix is primarily color/default visual parity.

- [ ] **Step 7: Compare chat/info computed styles**

Open the protected chat locally and verify:

- default chat header background is white/light;
- header text is dark;
- header controls are readable and have light hover/surface styling;
- outer app background remains `slate-200` when no custom chat background is
  chosen;
- inner chat surface remains white;
- outgoing message bubble color is `#465a72`;
- chat info full-screen header matches chat header defaults.

- [ ] **Step 8: Verify dark custom header still works**

In admin branding, set:

```text
Фон шапки чата: #112540
Цвет текста шапки чата: #ffffff
```

Save and verify:

- chat header is dark;
- header title and menu controls remain readable;
- chat-info back button remains readable;
- preview `Чат` and `Инфо` reflect the same dark header.

- [ ] **Step 9: Verify PWA manifest remains production-compatible**

Fetch:

```bash
curl -fsS http://buhfirma.127.0.0.1.nip.io:5173/api/tenant/manifest.webmanifest
```

Expected without custom PWA icon:

```json
{
  "background_color": "#f3f7fc",
  "theme_color": "#112540"
}
```

Icons should still use `/api/tenant/icons/...fallback-v1` unless a PWA icon is
uploaded.

### Task 5: Final Verification And Documentation

**Files:**

- Modify: `docs/findings/F-BRANDING-001-default-reset-parity.md`
- Optional modify: `docs/roadmap/work-log.md` only after the fix is complete
  and if this becomes a stable MT-9H baseline correction.

- [ ] **Step 1: Run targeted automated checks**

```bash
pnpm --dir backend exec vitest run src/modules/branding/service.test.ts src/modules/tenants/routes.test.ts --reporter verbose
pnpm --dir frontend exec vitest run src/features/branding/lib/BrandingProvider.test.tsx src/features/admin-branding/api/adminBrandingClient.test.ts src/features/admin-shell/pages/AdminBrandingPage.test.tsx src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx src/features/chat/components/ChatHeader.test.tsx src/features/chat/components/ChatFullScreenPanel.test.tsx --reporter verbose
pnpm test:e2e -- tests/e2e/admin-branding-settings.spec.ts tests/e2e/admin-branding-real-preview.spec.ts tests/e2e/admin-branding-assets.spec.ts tests/e2e/admin-login-ui.spec.ts tests/e2e/pwa-runtime-smoke.spec.ts
pnpm --dir frontend typecheck
pnpm format:check
pnpm lint
pnpm code-health
git diff --check
```

Expected result: all commands pass.

- [ ] **Step 2: Re-review touched area**

Request independent review with this context:

```text
Review the admin branding default parity fix. It must make reset/no-assets
state match production visual defaults without changing browser Chatwoot
authority, tenant scoping, object-storage authority, or PWA default manifest
colors. Pay special attention to overloaded authBackground/chatBackground/
primary mappings and light/dark chat header readability.
```

Fix any Critical or Important findings before closing the task.

- [ ] **Step 3: Close finding after verification**

Before deleting the finding, run the docs-preservation audit required by
`AGENTS.md`:

```bash
git status --short --branch
git log --all -- docs/findings/F-BRANDING-001-default-reset-parity.md
rg -n "F-BRANDING-001|default-reset-parity|Branding Reset Does Not Restore" docs frontend backend tests || true
```

After implementation, tests, browser QA, review and the preservation audit are
complete, delete:

```text
docs/findings/F-BRANDING-001-default-reset-parity.md
```

Only delete it when the acceptance criteria in that finding are satisfied.

- [ ] **Step 4: Update work-log only if baseline changed**

If the fix is accepted as a stable MT-9H correction, add one short bullet under
`Current Baseline` in `docs/roadmap/work-log.md` similar to:

```markdown
- Branding reset/default visual parity is corrected: no-assets reset restores
  production-like auth/chat/info defaults while preserving tenant-owned custom
  branding and PWA manifest defaults.
```

Keep the existing single `Recommended Next Step` block at the end.

- [ ] **Step 5: Checkpoint commit**

After review and verification:

```bash
git add \
  backend/src/modules/branding/brandingDefaults.ts \
  backend/src/modules/branding/service.test.ts \
  frontend/src/features/branding/lib/brandingDefaults.ts \
  frontend/src/features/branding/lib/brandingCss.ts \
  frontend/src/index.css \
  frontend/src/features/chat/components/ChatHeader.tsx \
  frontend/src/features/chat/components/ChatHeader.test.tsx \
  frontend/src/features/chat/components/ChatFullScreenPanel.tsx \
  frontend/src/features/chat/components/ChatFullScreenPanel.test.tsx \
  frontend/src/features/admin-branding/api/adminBrandingClient.test.ts \
  frontend/src/features/admin-shell/pages/AdminBrandingPage.test.tsx \
  frontend/src/features/branding/lib/BrandingProvider.test.tsx \
  frontend/src/features/admin-branding/components/portal-preview/ChatHeaderPreview.tsx \
  frontend/src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx \
  tests/e2e/admin-branding-settings.spec.ts \
  tests/e2e/admin-branding-assets.spec.ts \
  tests/e2e/admin-branding-real-preview.spec.ts \
  tests/e2e/admin-login-ui.spec.ts \
  tests/e2e/pwa-runtime-smoke.spec.ts \
  docs/superpowers/plans/2026-06-09-admin-branding-default-parity.md \
  docs/findings/F-BRANDING-001-default-reset-parity.md \
  docs/roadmap/work-log.md
git status --short
git commit -m "fix: restore branding default visual parity"
```

Do not push remote until the full branding work is accepted for production.
