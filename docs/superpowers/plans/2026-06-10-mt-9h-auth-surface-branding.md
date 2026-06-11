# MT-9H Auth Surface Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe auth middle-surface customization so tenant admins can harmonize login/auth backgrounds, header/footer art, and form readability without changing chat layout.

**Architecture:** Implement the reviewed Option B-narrow model from `docs/superpowers/specs/2026-06-09-auth-surface-branding-research.md`: keep `authBackground` as the auth page/canvas background and add only `authContentSurface` plus `authContentSurfaceOpacity` for the readable middle layer. Persist the new fields in tenant-owned `portal_branding_settings`, expose them through the existing admin/public branding API, derive auth control surfaces from semantic CSS variables, and keep default/reset visual parity unchanged. Chat runtime and chat preview components are out of scope except regression checks.

**Tech Stack:** TypeScript, Fastify, Drizzle ORM/Postgres, Zod, React 19, Tailwind CSS utilities, Vitest, Playwright.

---

## Source Design

- Research note: `docs/superpowers/specs/2026-06-09-auth-surface-branding-research.md`
- Branch: `fix/mt-9h-auth-surface-branding`
- Baseline commit: `ebc3561 fix: restore branding default visual parity`

## Guardrails

- Do not change Chatwoot core.
- Do not expose Chatwoot or object-storage authority to the browser.
- Do not change chat transcript, composer, chat header, chat info runtime or chat preview implementation.
- Do not add a full auth theme builder in this slice.
- Do not add separate admin controls for input background, input border, link color, support-card background or fade colors.
- Reset/default visuals must remain production-like:
  - auth frame background `#e2e8f0`;
  - auth page/canvas background `#f3f7fc`;
  - auth content surface `#ffffff`;
  - auth content surface opacity `100`;
  - auth text `#0f172a`;
  - auth muted text `#64748b`;
  - chat header background `#ffffff`;
  - chat header text `#0f172a`.
- Existing tenants with non-default `auth_background_color` must keep a close visual match after migration by backfilling the new content surface to the old auth background color at opacity `100`, unless a pre-deploy DB audit proves no such rows exist.

## File Map

Backend contract:

- Modify: `backend/src/db/brandingSchema.ts`
- Generate: `backend/drizzle/0013_*.sql`
- Generate: `backend/drizzle/meta/0013_snapshot.json`
- Modify: `backend/drizzle/meta/_journal.json`
- Modify: `backend/src/modules/branding/brandingDefaults.ts`
- Modify: `backend/src/modules/branding/brandingValidation.ts`
- Modify: `backend/src/modules/branding/repository.ts`
- Modify: `backend/src/modules/branding/service.ts`
- Test: `backend/src/modules/branding/service.test.ts`
- Test: `backend/src/modules/branding/repository.test.ts`
- Test: `backend/src/modules/branding/migration-auth-surface.test.ts`
- Test: `backend/src/modules/branding/migration-auth-surface.test.ts`

Frontend contract and runtime:

- Modify: `frontend/src/features/branding/api/publicBrandingClient.ts`
- Modify: `frontend/src/features/admin-branding/api/adminBrandingClient.ts`
- Modify: `frontend/src/features/branding/lib/brandingDefaults.ts`
- Modify: `frontend/src/features/branding/lib/brandingCss.ts`
- Test: `frontend/src/features/branding/lib/BrandingProvider.test.tsx`
- Test: `frontend/src/features/branding/api/publicBrandingClient.test.ts`
- Test: `frontend/src/features/admin-branding/api/adminBrandingClient.test.ts`

Auth UI and admin UI:

- Modify: `frontend/src/app/layouts/AuthFrame.tsx`
- Modify: `frontend/src/shared/ui/AuthShell.tsx`
- Modify: `frontend/src/shared/ui/inputStyles.ts`
- Modify: `frontend/src/features/auth/pages/LoginPage.tsx`
- Modify: `frontend/src/features/admin-branding/components/AdminBrandingForm.tsx`
- Modify: `frontend/src/features/admin-branding/lib/brandingState.ts`
- Modify: `frontend/src/features/admin-branding/lib/previewBranding.ts`
- Modify: `frontend/src/features/admin-branding/components/portal-preview/AuthLoginPreview.tsx`
- Modify: `frontend/src/index.css`
- Test: `frontend/src/features/admin-shell/pages/AdminBrandingPage.test.tsx`
- Test: `frontend/src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx`
- Test: `frontend/src/features/auth/pages/LoginPage.test.tsx`
- Test: `frontend/src/features/auth/pages/RequestPages.test.tsx`

Browser checks:

- Modify: `tests/e2e/admin-branding-settings.spec.ts`
- Modify: `tests/e2e/admin-branding-real-preview.spec.ts`
- Modify: `tests/e2e/customer-branding-runtime.spec.ts`

## Task 1: Backend Branding Contract

**Files:**

- Modify: `backend/src/db/brandingSchema.ts`
- Generate: `backend/drizzle/0013_*.sql`
- Generate: `backend/drizzle/meta/0013_snapshot.json`
- Modify: `backend/drizzle/meta/_journal.json`
- Modify: `backend/src/modules/branding/brandingDefaults.ts`
- Modify: `backend/src/modules/branding/brandingValidation.ts`
- Modify: `backend/src/modules/branding/repository.ts`
- Modify: `backend/src/modules/branding/service.ts`
- Test: `backend/src/modules/branding/service.test.ts`
- Test: `backend/src/modules/branding/repository.test.ts`

- [ ] **Step 1: Write backend service tests for defaults and patch mapping**

  In `backend/src/modules/branding/service.test.ts`, update `createRepository()` so every returned settings shape includes:

  ```ts
  authContentSurfaceColor: null,
  authContentSurfaceOpacity: null,
  ```

  Extend the default public branding assertion:

  ```ts
  colors: expect.objectContaining({
    authBackground: '#f3f7fc',
    authContentSurface: '#ffffff',
    authContentSurfaceOpacity: 100,
    authText: '#0f172a',
    chatHeaderBackground: '#ffffff',
    chatHeaderText: '#0f172a',
    chatText: '#334155',
    primary: '#112540',
  }),
  ```

  Add to the existing admin update test input:

  ```ts
  colors: {
    authContentSurface: '#f8fafc',
    authContentSurfaceOpacity: 84,
    authText: '#223344',
    chatHeaderText: '#f8fafc',
    primary: '#123456',
  },
  ```

  Assert repository mapping:

  ```ts
  expect(repository.upsertSettings).toHaveBeenCalledWith(
    expect.objectContaining({
      authContentSurfaceColor: '#f8fafc',
      authContentSurfaceOpacity: 84,
      authTextColor: '#223344',
      chatHeaderTextColor: '#f8fafc',
      primaryColor: '#123456',
    }),
  )
  ```

- [ ] **Step 2: Add validation tests for opacity**

  In `backend/src/modules/branding/service.test.ts`, add invalid opacity cases:

  ```ts
  it.each([-1, 101, 42.5, '80'])(
    'rejects invalid auth content surface opacity %#',
    async (authContentSurfaceOpacity) => {
      const repository = createRepository()
      const service = createBrandingService({
        audit: vi.fn(),
        repository,
        tenant,
      })

      await expect(
        service.updateAdminBranding({
          admin,
          input: {
            colors: {
              authContentSurfaceOpacity,
            },
          },
          requestIp: null,
          userAgent: null,
        }),
      ).rejects.toMatchObject({
        code: 'BRANDING_SETTINGS_INVALID',
        statusCode: 400,
      })
      expect(repository.upsertSettings).not.toHaveBeenCalled()
    },
  )
  ```

  Expected failure before implementation: `BRANDING_SETTINGS_INVALID` is not thrown for all new cases because the field is not in the schema.

- [ ] **Step 3: Add repository tests for storage and readback**

  In `backend/src/modules/branding/repository.test.ts`, extend the existing settings insert/update expectations with:

  ```ts
  authContentSurfaceColor: '#f8fafc',
  authContentSurfaceOpacity: 84,
  ```

  Add a focused assertion after `findSettings()`:

  ```ts
  expect(settings).toEqual(
    expect.objectContaining({
      authContentSurfaceColor: '#f8fafc',
      authContentSurfaceOpacity: 84,
    }),
  )
  ```

  Expected failure before schema implementation: unknown fields on patch/selection.

- [ ] **Step 4: Add migration backfill regression test**

  Add `backend/src/modules/branding/migration-auth-surface.test.ts`.

  This test must validate the generated migration itself, not only the clean
  fully migrated schema:
  1. Create a `PGlite` database.
  2. Create a temporary migrations folder copied from `backend/drizzle` but
     truncated to journal entries and SQL files through `0012`.
  3. Run `migrate(db, { migrationsFolder: legacyMigrationsFolder })`.
  4. Insert minimal `portal_tenants` rows and legacy
     `portal_branding_settings` rows using raw SQL:
     - one row with non-default `auth_background_color = '#ddeeff'`;
     - one row with default `auth_background_color = '#f3f7fc'`.
  5. Run the full migrations folder, or execute the generated `0013_*.sql`
     after `0012`, so only the new migration is applied to these legacy rows.
  6. Assert the non-default legacy row now has:

     ```ts
     auth_content_surface_color: '#ddeeff',
     auth_content_surface_opacity: 100,
     ```

  7. Assert the default-color legacy row still has `null` content surface fields
     so defaults continue to come from service coalescing.

  Do not use `createTestDatabase()` for this test because it starts from the
  fully migrated schema and cannot prove compatibility backfill.

- [ ] **Step 5: Run backend tests and verify they fail**

  Run:

  ```bash
  pnpm --dir backend exec vitest run src/modules/branding/service.test.ts src/modules/branding/repository.test.ts src/modules/branding/migration-auth-surface.test.ts --reporter verbose
  ```

  Expected: FAIL on missing `authContentSurface*` contract.

- [ ] **Step 6: Update backend defaults**

  In `backend/src/modules/branding/brandingDefaults.ts`, add:

  ```ts
  authContentSurface: '#ffffff',
  authContentSurfaceOpacity: 100,
  ```

  Keep existing defaults unchanged.

- [ ] **Step 7: Update schema and generate migration**

  In `backend/src/db/brandingSchema.ts`, add:

  ```ts
  authContentSurfaceColor: text('auth_content_surface_color'),
  authContentSurfaceOpacity: integer('auth_content_surface_opacity'),
  ```

  Add a table check:

  ```ts
  check(
    'portal_branding_settings_auth_content_surface_opacity_check',
    sql`${table.authContentSurfaceOpacity} is null or (${table.authContentSurfaceOpacity} >= 0 and ${table.authContentSurfaceOpacity} <= 100)`,
  ),
  ```

  Generate migration:

  ```bash
  pnpm --dir backend db:generate
  ```

  Expected: a new `backend/drizzle/0013_*.sql`, `backend/drizzle/meta/0013_snapshot.json`, and `_journal.json` entry.

- [ ] **Step 8: Add compatibility backfill to the generated migration**

  In the generated `backend/drizzle/0013_*.sql`, keep Drizzle's `ALTER TABLE` statements and add this data backfill before the opacity check if Drizzle creates the check separately, otherwise before the final statement:

  ```sql
  UPDATE "portal_branding_settings"
  SET
    "auth_content_surface_color" = "auth_background_color",
    "auth_content_surface_opacity" = 100
  WHERE "auth_background_color" IS NOT NULL
    AND lower("auth_background_color") <> '#f3f7fc'
    AND "auth_content_surface_color" IS NULL
    AND "auth_content_surface_opacity" IS NULL;
  ```

  This preserves close visual compatibility for tenants that already customized `auth_background_color`.

- [ ] **Step 9: Update validation**

  In `backend/src/modules/branding/brandingValidation.ts`, add:

  ```ts
  const opacitySchema = z.number().int().min(0).max(100)
  ```

  Add fields under `colors`:

  ```ts
  authContentSurface: colorSchema.optional(),
  authContentSurfaceOpacity: opacitySchema.optional(),
  ```

- [ ] **Step 10: Update repository selection and patch normalization**

  In `backend/src/modules/branding/repository.ts`:

  Add to `BrandingSettingsPatch`:

  ```ts
  authContentSurfaceColor: string | null
  authContentSurfaceOpacity: number | null
  ```

  Add to `settingsSelection`:

  ```ts
  authContentSurfaceColor: portalBrandingSettings.authContentSurfaceColor,
  authContentSurfaceOpacity: portalBrandingSettings.authContentSurfaceOpacity,
  ```

  Add to `normalizeSettingsPatch()`:

  ```ts
  authContentSurfaceColor: normalizeNullableText(
    input.authContentSurfaceColor,
  ),
  authContentSurfaceOpacity: input.authContentSurfaceOpacity,
  ```

  Do not trim/coerce opacity. Validation is responsible for `0..100`.

- [ ] **Step 11: Update service response and patch mapping**

  In `backend/src/modules/branding/service.ts`, resolve:

  ```ts
  const authContentSurfaceColor = coalesce(
    resolvedSettings?.authContentSurfaceColor,
    defaultBrandingColors.authContentSurface,
  )
  const authContentSurfaceOpacity = coalesce(
    resolvedSettings?.authContentSurfaceOpacity,
    defaultBrandingColors.authContentSurfaceOpacity,
  )
  ```

  Add to `colors` response:

  ```ts
  authContentSurface: authContentSurfaceColor,
  authContentSurfaceOpacity,
  ```

  Add to `toSettingsPatch()`:

  ```ts
  if (parsedInput.colors?.authContentSurface !== undefined) {
    patch.authContentSurfaceColor = parsedInput.colors.authContentSurface
  }

  if (parsedInput.colors?.authContentSurfaceOpacity !== undefined) {
    patch.authContentSurfaceOpacity =
      parsedInput.colors.authContentSurfaceOpacity
  }
  ```

- [ ] **Step 12: Run focused backend tests**

  Run:

  ```bash
  pnpm --dir backend exec vitest run src/modules/branding/service.test.ts src/modules/branding/repository.test.ts src/modules/branding/migration-auth-surface.test.ts --reporter verbose
  ```

  Expected: PASS.

- [ ] **Step 13: Backend task review checkpoint**

  Review:

  ```bash
  git diff -- backend/src/db/brandingSchema.ts backend/src/modules/branding backend/drizzle
  ```

  Check:
  - migration includes both schema change and compatibility backfill;
  - response defaults match the research note;
  - validation rejects unknown fields and invalid opacity;
  - no object-storage or Chatwoot authority changes.

  Stop for review before Task 2 if any backend contract issue remains.

## Task 2: Frontend Branding Types And CSS Variables

**Files:**

- Modify: `frontend/src/features/branding/api/publicBrandingClient.ts`
- Modify: `frontend/src/features/admin-branding/api/adminBrandingClient.ts`
- Modify: `frontend/src/features/branding/lib/brandingDefaults.ts`
- Modify: `frontend/src/features/branding/lib/brandingCss.ts`
- Test: `frontend/src/features/branding/lib/BrandingProvider.test.tsx`
- Test: `frontend/src/features/branding/api/publicBrandingClient.test.ts`
- Test: `frontend/src/features/admin-branding/api/adminBrandingClient.test.ts`

- [ ] **Step 1: Update frontend API type tests first**

  In `frontend/src/features/admin-branding/api/adminBrandingClient.test.ts` and `frontend/src/features/branding/api/publicBrandingClient.test.ts`, add the new response fields to all fixture color objects:

  ```ts
  authContentSurface: '#ffffff',
  authContentSurfaceOpacity: 100,
  ```

  Add an admin patch expectation that accepts:

  ```ts
  colors: expect.objectContaining({
    authContentSurface: '#f8fafc',
    authContentSurfaceOpacity: 84,
  })
  ```

- [ ] **Step 2: Update CSS variable tests**

  In `frontend/src/features/branding/lib/BrandingProvider.test.tsx`, extend the custom branding fixture:

  ```ts
  authContentSurface: '#f8fafc',
  authContentSurfaceOpacity: 84,
  ```

  Extend the style assertions:

  ```ts
  expect(scope).toHaveStyle({
    '--portal-auth-background-color': '#ecfeff',
    '--portal-auth-canvas-background-color': '#ecfeff',
    '--portal-auth-content-surface-background': 'rgb(248 250 252 / 0.84)',
    '--portal-auth-content-surface-color': '#f8fafc',
    '--portal-auth-content-surface-opacity': '0.84',
    '--portal-auth-muted-text-color': '#456179',
    '--portal-auth-text-color': '#0f172a',
  })
  ```

  Extend default assertions:

  ```ts
  '--portal-auth-canvas-background-color': '#f3f7fc',
  '--portal-auth-content-surface-background': 'rgb(255 255 255 / 1)',
  '--portal-auth-content-surface-color': '#ffffff',
  '--portal-auth-content-surface-opacity': '1',
  ```

- [ ] **Step 3: Run frontend type/CSS tests and verify they fail**

  Run:

  ```bash
  pnpm --dir frontend exec vitest run src/features/branding/api/publicBrandingClient.test.ts src/features/admin-branding/api/adminBrandingClient.test.ts src/features/branding/lib/BrandingProvider.test.tsx --reporter verbose
  ```

  Expected: FAIL on missing type/default/CSS variable fields.

- [ ] **Step 4: Update API types**

  In both `frontend/src/features/branding/api/publicBrandingClient.ts` and `frontend/src/features/admin-branding/api/adminBrandingClient.ts`, change `BrandingColors`:

  ```ts
  export type BrandingColors = {
    accent: string
    authBackground: string
    authContentSurface: string
    authContentSurfaceOpacity: number
    authMutedText: string
    authText: string
    chatBackground: string
    chatHeaderBackground: string
    chatHeaderText: string
    chatMutedText: string
    chatText: string
    primary: string
  }
  ```

- [ ] **Step 5: Update frontend defaults**

  In `frontend/src/features/branding/lib/brandingDefaults.ts`, add:

  ```ts
  authContentSurface: '#ffffff',
  authContentSurfaceOpacity: 100,
  ```

- [ ] **Step 6: Add auth surface CSS helpers**

  In `frontend/src/features/branding/lib/brandingCss.ts`, add helpers near the existing color helpers:

  ```ts
  function clampPercentage(value: number, fallback: number) {
    if (!Number.isFinite(value)) {
      return fallback
    }

    return Math.min(100, Math.max(0, Math.round(value)))
  }

  function toCssRgb({ b, g, r }: RgbColor) {
    return `${Math.round(r)} ${Math.round(g)} ${Math.round(b)}`
  }

  function toCssRgbAlpha(color: string, opacityPercent: number) {
    const parsed = parseHexColor(color) ?? parseHexColor('#ffffff')!
    const alpha = clampPercentage(opacityPercent, 100) / 100

    return `rgb(${toCssRgb(parsed)} / ${alpha})`
  }
  ```

  Resolve values inside `createBrandingCssProperties()`:

  ```ts
  const authContentSurfaceColor = normalizeHexColor(
    branding.colors.authContentSurface,
    defaultBrandingColors.authContentSurface,
  )
  const authContentSurfaceOpacity = clampPercentage(
    branding.colors.authContentSurfaceOpacity,
    defaultBrandingColors.authContentSurfaceOpacity,
  )
  const authContentSurfaceAlpha = String(authContentSurfaceOpacity / 100)
  ```

  Add CSS variables:

  ```ts
  '--portal-auth-canvas-background-color': authBackgroundColor,
  '--portal-auth-content-surface-background': toCssRgbAlpha(
    authContentSurfaceColor,
    authContentSurfaceOpacity,
  ),
  '--portal-auth-content-surface-color': authContentSurfaceColor,
  '--portal-auth-content-surface-opacity': authContentSurfaceAlpha,
  '--portal-auth-control-background': toCssRgbAlpha(
    authContentSurfaceColor,
    Math.max(82, authContentSurfaceOpacity),
  ),
  '--portal-auth-control-border-color': createMutedTextColor(
    authMutedTextColor,
    authContentSurfaceColor,
    '#cbd5e1',
  ),
  ```

  Keep existing compatibility variables:

  ```ts
  '--portal-auth-background-color': authBackgroundColor,
  '--portal-auth-frame-background-color': isDefaultAuthBackground
    ? productionVisualDefaults.authFrameBackground
    : authBackgroundColor,
  ```

- [ ] **Step 7: Run focused frontend contract tests**

  Run:

  ```bash
  pnpm --dir frontend exec vitest run src/features/branding/api/publicBrandingClient.test.ts src/features/admin-branding/api/adminBrandingClient.test.ts src/features/branding/lib/BrandingProvider.test.tsx --reporter verbose
  ```

  Expected: PASS.

## Task 3: Auth Runtime Layering And Shared Controls

**Files:**

- Modify: `frontend/src/app/layouts/AuthFrame.tsx`
- Modify: `frontend/src/shared/ui/AuthShell.tsx`
- Modify: `frontend/src/shared/ui/inputStyles.ts`
- Modify: `frontend/src/features/auth/pages/LoginPage.tsx`
- Modify: `frontend/src/index.css`
- Test: `frontend/src/features/auth/pages/LoginPage.test.tsx`
- Test: `frontend/src/features/auth/pages/RequestPages.test.tsx`
- Test: `frontend/src/shared/ui/authInputCss.test.ts`

- [ ] **Step 1: Add runtime tests for auth semantic classes**

  In `frontend/src/features/auth/pages/LoginPage.test.tsx`, add assertions to the existing login render test:

  ```ts
  expect(document.querySelector('.auth-canvas-background')).toBeInTheDocument()
  expect(document.querySelector('.auth-content-layer')).toBeInTheDocument()
  expect(document.querySelector('.auth-content-veil')).toBeInTheDocument()
  expect(document.querySelector('.auth-support-card')).toBeInTheDocument()
  expect(document.querySelector('.auth-input')).toBeInTheDocument()
  ```

  Add `frontend/src/shared/ui/authInputCss.test.ts` as a CSS contract test for
  filled/autofill auth input states. Read `frontend/src/index.css`, extract the
  `.auth-input[data-filled='true']` and `.auth-input:-webkit-autofill` rules,
  and assert they use:

  ```ts
  expect(filledRule).toContain('--portal-auth-control-background')
  expect(filledRule).toContain('--portal-auth-control-border-color')
  expect(autofillRule).toContain('--portal-auth-control-background')
  expect(autofillRule).toContain('--portal-auth-text-color')
  ```

  Also assert those rules do not contain the old hardcoded filled/autofill
  surface and border values:

  ```ts
  expect(filledRule).not.toContain('rgb(243 247 252 / 0.86)')
  expect(filledRule).not.toContain('#9cb9df')
  expect(autofillRule).not.toContain('rgb(243 247 252 / 0.86)')
  ```

  In `frontend/src/features/auth/pages/RequestPages.test.tsx`, add smoke
  assertions for every auth request/verification/setup surface that uses
  `AuthShell`:
  - `/auth/register`;
  - `/auth/register/verify` with valid registration request state so the real
    OTP form renders;
  - `/auth/register/set-password` with valid registration verification state so
    the real password setup form renders;
  - `/auth/password-reset/request`;
  - `/auth/password-reset/verify` with valid reset request state so the real OTP
    form renders;
  - `/auth/password-reset/set-password` with valid reset verification state so
    the real password setup form renders.

  For each rendered route, assert `.auth-content-veil` exists. On OTP and
  password setup routes, also assert the expected real form marker exists
  (`otp-verification-form` or the existing password form test id/submit control)
  so the smoke does not pass on a guard/redirect page.

- [ ] **Step 2: Run auth tests and verify they fail**

  Run:

  ```bash
  pnpm --dir frontend exec vitest run src/features/auth/pages/LoginPage.test.tsx src/features/auth/pages/RequestPages.test.tsx src/shared/ui/authInputCss.test.ts --reporter verbose
  ```

  Expected: FAIL because the new semantic layer classes do not exist yet.

- [ ] **Step 3: Split AuthFrame/AuthShell responsibilities**

  In `frontend/src/app/layouts/AuthFrame.tsx`, keep the outer frame branded:

  ```tsx
  <main className="auth-frame-background app-shell-viewport bg-slate-200 text-slate-900 antialiased">
    <div className="mx-auto flex h-full min-h-0 w-full justify-center">
      <div className="relative flex h-full min-h-0 w-full max-w-[500px] flex-col overflow-x-hidden overflow-y-auto overscroll-none bg-white">
        {children}
      </div>
    </div>
  </main>
  ```

  In `frontend/src/shared/ui/AuthShell.tsx`, change the root section to own the canvas:

  ```tsx
  <section className="auth-canvas-background relative flex min-h-full w-full flex-col">
  ```

  Wrap the middle content with a dedicated layer:

  ```tsx
  <div className="auth-content-layer relative z-10 flex flex-1 flex-col px-7 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-10 sm:pb-6">
    <div aria-hidden="true" className="auth-content-veil" />
    <div className="auth-content-body relative z-10 flex min-h-full flex-1 flex-col">
      <div className="text-center">
        <PageIntro description={description} title={title} />
      </div>

      <div className="mt-7 flex flex-1 flex-col">{children}</div>
    </div>
  </div>
  ```

  Ensure the veil has `pointer-events: none` in CSS.

- [ ] **Step 4: Update auth CSS layers**

  In `frontend/src/index.css`, replace the duplicated `.auth-shell-background` role with:

  ```css
  .auth-canvas-background {
    background-color: var(--portal-auth-canvas-background-color, #f3f7fc);
    background-image: var(--portal-auth-background-image, none);
    background-position: center;
    background-repeat: no-repeat;
    background-size: cover;
    color: var(--portal-auth-text-color, #0f172a);
  }

  .auth-content-layer {
    isolation: isolate;
  }

  .auth-content-veil {
    position: absolute;
    inset: -1rem 0 0;
    z-index: 0;
    background: var(
      --portal-auth-content-surface-background,
      rgb(255 255 255 / 1)
    );
    pointer-events: none;
  }
  ```

  Keep `.auth-shell-background` only if needed as a short-lived compatibility alias with the old default white behavior; do not use it in `AuthFrame`/`AuthShell`.

  Update fade targets:

  ```css
  .auth-header-fade {
    background: linear-gradient(
      180deg,
      rgb(255 255 255 / 0) 0%,
      rgb(255 255 255 / 0.18) 28%,
      var(--portal-auth-content-surface-background, rgb(255 255 255 / 0.72)) 68%,
      var(--portal-auth-content-surface-color, #ffffff) 100%
    );
  }
  ```

  For `.auth-footer-art::before`, use `--portal-auth-content-surface-color` and `--portal-auth-content-surface-background` instead of hardcoded white.

- [ ] **Step 5: Update auth control variables**

  In `frontend/src/shared/ui/inputStyles.ts`, keep `auth-input` but replace hardcoded surfaces:

  ```ts
  export const authFieldClassName =
    'h-[52px] rounded-auth-control bg-[color:var(--portal-auth-control-background,rgb(248_250_252_/_0.86))] text-[17px] placeholder:text-[color:var(--portal-auth-muted-text-color,#64748b)]'
  ```

  In `inputClassName()`, replace the base `bg-white` and default border classes with semantic variables:

  ```ts
  'auth-input auth-text block h-16 w-full appearance-none rounded-auth-control border bg-[color:var(--portal-auth-control-background,rgb(255_255_255_/_0.92))] px-5 text-[17px] placeholder:text-[color:var(--portal-auth-muted-text-color,#64748b)] transition focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:border-[color:var(--portal-auth-control-border-color,#cbd5e1)] disabled:bg-[color:var(--portal-auth-control-background,rgb(248_250_252_/_0.86))] disabled:text-[color:var(--portal-auth-muted-text-color,#64748b)]'
  ```

  In `frontend/src/index.css`, replace the existing hardcoded filled/autofill
  states with semantic auth variables so typed/autofilled controls stay aligned
  with the selected content surface:

  ```css
  .auth-input[data-filled='true']:not([aria-invalid='true']),
  .auth-input[placeholder]:not(:placeholder-shown):not([aria-invalid='true']),
  .auth-input:-webkit-autofill:not([aria-invalid='true']) {
    background-color: var(
      --portal-auth-control-background,
      rgb(248 250 252 / 0.86)
    );
    border-color: var(--portal-auth-control-border-color, #cbd5e1);
    box-shadow: 0 6px 14px rgb(15 45 87 / 0.06);
  }

  .auth-input:-webkit-autofill {
    -webkit-text-fill-color: var(--portal-auth-text-color, #0f172a);
    -webkit-box-shadow:
      0 0 0 1000px
        var(--portal-auth-control-background, rgb(248 250 252 / 0.86)) inset,
      0 6px 14px rgb(15 45 87 / 0.06);
    transition: background-color 9999s ease-in-out 0s;
  }
  ```

  Keep error styles rose-colored as a deliberate validation exception so errors
  remain visible independent of tenant branding.

- [ ] **Step 6: Update login support card**

  In `frontend/src/features/auth/pages/LoginPage.tsx`, replace the support aside hardcoded surface with:

  ```tsx
  <aside className="auth-support-card auth-muted-text flex items-center gap-3 rounded-[0.6rem] px-3.5 py-3 text-[13px] leading-5 shadow-sm">
  ```

  In `frontend/src/index.css`, add:

  ```css
  .auth-support-card {
    border: 1px solid var(--portal-auth-control-border-color, #e2e8f0);
    background: var(--portal-auth-control-background, rgb(248 250 252 / 0.86));
  }
  ```

- [ ] **Step 7: Run auth runtime tests**

  Run:

  ```bash
  pnpm --dir frontend exec vitest run src/features/auth/pages/LoginPage.test.tsx src/features/auth/pages/RequestPages.test.tsx src/shared/ui/authInputCss.test.ts --reporter verbose
  ```

  Expected: PASS.

## Task 4: Admin Branding Controls

**Files:**

- Modify: `frontend/src/features/admin-branding/components/AdminBrandingForm.tsx`
- Modify: `frontend/src/features/admin-branding/lib/brandingState.ts`
- Test: `frontend/src/features/admin-shell/pages/AdminBrandingPage.test.tsx`

- [ ] **Step 1: Add admin UI tests for new controls**

  In `frontend/src/features/admin-shell/pages/AdminBrandingPage.test.tsx`, extend `savedBrandingResponse.branding.colors`:

  ```ts
  authContentSurface: '#ffffff',
  authContentSurfaceOpacity: 100,
  ```

  In `resets only color fields to default branding colors`, add:

  ```ts
  fireEvent.input(screen.getByLabelText('Выбрать фон области входа'), {
    target: { value: '#eef2ff' },
  })
  fireEvent.change(screen.getByLabelText('Плотность области входа, значение'), {
    target: { value: '72' },
  })
  expect(screen.getByLabelText('Фон области входа')).toHaveValue('#eef2ff')
  expect(
    screen.getByLabelText('Плотность области входа, значение'),
  ).toHaveValue('72')
  ```

  After reset:

  ```ts
  expect(screen.getByLabelText('Фон auth-страницы')).toHaveValue('#f3f7fc')
  expect(screen.getByLabelText('Фон области входа')).toHaveValue('#ffffff')
  expect(
    screen.getByLabelText('Плотность области входа, значение'),
  ).toHaveValue('100')
  ```

  Save expectation:

  ```ts
  colors: expect.objectContaining({
    authBackground: '#f3f7fc',
    authContentSurface: '#ffffff',
    authContentSurfaceOpacity: 100,
  }),
  ```

- [ ] **Step 2: Run admin page tests and verify they fail**

  Run:

  ```bash
  pnpm --dir frontend exec vitest run src/features/admin-shell/pages/AdminBrandingPage.test.tsx --reporter verbose
  ```

  Expected: FAIL because labels/controls do not exist.

- [ ] **Step 3: Split color string keys from numeric opacity key**

  In `frontend/src/features/admin-branding/components/AdminBrandingForm.tsx`, add:

  ```ts
  type ColorValueKey = {
    [Key in keyof BrandingColors]: BrandingColors[Key] extends string
      ? Key
      : never
  }[keyof BrandingColors]

  type ColorFieldConfig = {
    key: ColorValueKey
    label: string
  }
  ```

  Update `ColorFieldConfig.key` to use `ColorValueKey` so numeric opacity is not passed to `ColorField`.

- [ ] **Step 4: Update color groups and labels**

  In the Auth group:

  ```ts
  {
    fields: [
      { key: 'authBackground', label: 'Фон auth-страницы' },
      { key: 'authContentSurface', label: 'Фон области входа' },
      { key: 'authText', label: 'Цвет текста auth-экрана' },
      {
        key: 'authMutedText',
        label: 'Цвет вторичного текста auth-экрана',
      },
    ],
    title: 'Auth-экран',
  },
  ```

- [ ] **Step 5: Add opacity field**

  Add a small numeric slider/input component:

  ```tsx
  function OpacityField({
    disabled,
    label,
    name,
    onChange,
    value,
  }: {
    disabled: boolean
    label: string
    name: string
    onChange: (value: number) => void
    value: number
  }) {
    return (
      <label className="block">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <span className="mt-2 grid grid-cols-[minmax(0,1fr)_4.5rem] items-center gap-3">
          <input
            aria-label={label}
            className="h-2 w-full accent-brand-800 disabled:cursor-not-allowed"
            disabled={disabled}
            max={100}
            min={0}
            name={name}
            onChange={(event) => {
              onChange(Number(event.currentTarget.value))
            }}
            type="range"
            value={value}
          />
          <input
            aria-label={`${label}, значение`}
            className="h-10 rounded-[0.55rem] border border-slate-200 bg-white px-2 text-sm text-slate-950 shadow-sm focus:border-brand-300 focus:outline-none focus:ring-4 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
            disabled={disabled}
            max={100}
            min={0}
            onChange={(event) => {
              onChange(Number(event.currentTarget.value))
            }}
            type="number"
            value={value}
          />
        </span>
      </label>
    )
  }
  ```

  Keep the range input label as the visible control label and the numeric input
  aria-label as `${label}, значение`. E2E tests must fill the numeric input via
  `getByLabel('Плотность области входа, значение', { exact: true })` so they do
  not depend on browser-specific range input behavior.

  Render it under the Auth fieldset:

  ```tsx
  <OpacityField
    disabled={isSaving}
    label="Плотность области входа"
    name="colors.authContentSurfaceOpacity"
    onChange={(value) => {
      updateColor('authContentSurfaceOpacity', value)
    }}
    value={draft.colors.authContentSurfaceOpacity}
  />
  ```

  If TypeScript objects to `updateColor`, split it into:

  ```ts
  function updateColor<Key extends keyof BrandingColors>(
    key: Key,
    value: BrandingColors[Key],
  ) {
    onChange({
      ...draft,
      colors: {
        ...draft.colors,
        [key]: value,
      },
    })
  }
  ```

  Keep existing chat header auto-sync logic inside this generic function for `key === 'chatHeaderBackground'`.

- [ ] **Step 6: Run admin UI tests**

  Run:

  ```bash
  pnpm --dir frontend exec vitest run src/features/admin-shell/pages/AdminBrandingPage.test.tsx --reporter verbose
  ```

  Expected: PASS.

## Task 5: Admin Preview Auth Parity

**Files:**

- Modify: `frontend/src/features/admin-branding/components/portal-preview/AuthLoginPreview.tsx`
- Modify: `frontend/src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx`
- Modify: `frontend/src/features/admin-branding/lib/previewBranding.ts`

- [ ] **Step 1: Update preview draft fixtures**

  In `frontend/src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx`, add new color fields to `draft` and `defaultDraft`:

  ```ts
  authContentSurface: '#f8fafc',
  authContentSurfaceOpacity: 84,
  ```

  For `defaultDraft`:

  ```ts
  authContentSurface: '#ffffff',
  authContentSurfaceOpacity: 100,
  ```

- [ ] **Step 2: Add preview parity assertions**

  In `renders the login preview as read-only from the draft branding`, assert:

  ```ts
  expect(document.querySelector('.auth-canvas-background')).toBeInTheDocument()
  expect(document.querySelector('.auth-content-veil')).toBeInTheDocument()
  expect(document.querySelector('.auth-input')).toBeInTheDocument()
  expect(document.querySelector('.auth-support-card')).toBeInTheDocument()
  ```

  In `updates the preview when the unsaved draft changes`, extend CSS assertions:

  ```ts
  expect(container.querySelector('.portal-branding-scope')).toHaveStyle({
    '--portal-auth-content-surface-background': 'rgb(248 250 252 / 0.84)',
    '--portal-auth-content-surface-color': '#f8fafc',
    '--portal-auth-content-surface-opacity': '0.84',
  })
  ```

- [ ] **Step 3: Run preview tests and verify they fail**

  Run:

  ```bash
  pnpm --dir frontend exec vitest run src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx --reporter verbose
  ```

  Expected: FAIL until preview uses auth semantic classes.

- [ ] **Step 4: Align AuthLoginPreview with runtime classes**

  In `frontend/src/features/admin-branding/components/portal-preview/AuthLoginPreview.tsx`, import shared auth class helpers:

  ```ts
  import {
    authFieldIconClassName,
    inputClassName,
  } from '../../../../shared/ui/inputStyles'
  ```

  Change preview field labels to use the same auth input classes:

  ```tsx
  <label className="relative block">
    <span className="auth-muted-text pointer-events-none absolute left-5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center">
      <MailIcon className={authFieldIconClassName} />
    </span>
    <input
      aria-label="Email"
      className={`${inputClassName(false, false)} pl-16`}
      disabled
      placeholder="name@company.ru"
      type="email"
    />
  </label>
  ```

  Apply the same pattern to the password preview input. Keep the preview read-only and do not add runtime form submission.

  Change support preview aside to:

  ```tsx
  <aside className="auth-support-card auth-muted-text flex items-center gap-3 rounded-[0.6rem] px-3.5 py-3 text-[13px] leading-5 shadow-sm">
  ```

- [ ] **Step 5: Run preview tests**

  Run:

  ```bash
  pnpm --dir frontend exec vitest run src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx --reporter verbose
  ```

  Expected: PASS.

## Task 6: Browser Coverage, Regression Checks And Closure

**Files:**

- Modify: `tests/e2e/admin-branding-settings.spec.ts`
- Modify: `tests/e2e/admin-branding-real-preview.spec.ts`
- Modify: `tests/e2e/customer-branding-runtime.spec.ts`
- Optionally modify: `docs/roadmap/work-log.md` only after the full feature is implemented, reviewed and tested.

- [ ] **Step 1: Update e2e fixtures**

  In every branding fixture touched by this slice, add:

  ```ts
  authContentSurface: '#ffffff',
  authContentSurfaceOpacity: 100,
  ```

  For custom auth tests, use:

  ```ts
  authBackground: '#ecfeff',
  authContentSurface: '#f8fafc',
  authContentSurfaceOpacity: 84,
  ```

  When touching `tests/e2e/customer-branding-runtime.spec.ts`, make the mocked
  `colors` object match the complete current public `BrandingColors` shape, not
  just the fields used by the specific assertion. This avoids runtime failures
  in CSS helpers that expect string color fields before calling `trim()`.

- [ ] **Step 2: Add admin e2e for new controls**

  In `tests/e2e/admin-branding-settings.spec.ts`, extend `admin can edit all branding setting groups and see preview update`:

  ```ts
  const updatedBranding = {
    colors: {
      authBackground: '#eefcf8',
      authContentSurface: '#f8fafc',
      authContentSurfaceOpacity: 84,
      chatBackground: '#f8fafc',
      chatHeaderBackground: '#164e63',
      chatHeaderText: '#ffffff',
      primary: '#0f766e',
    },
    // existing copy/portalName/supportLabel
  }
  ```

  Fill controls:

  ```ts
  await page
    .getByLabel('Фон auth-страницы', { exact: true })
    .fill(updatedBranding.colors.authBackground)
  await page
    .getByLabel('Фон области входа', { exact: true })
    .fill(updatedBranding.colors.authContentSurface)
  await page
    .getByLabel('Плотность области входа, значение', { exact: true })
    .fill(String(updatedBranding.colors.authContentSurfaceOpacity))
  ```

  Assert preview computed style:

  ```ts
  const previewScope = page.locator(
    '[data-admin-branding-preview] .portal-branding-scope',
  )
  await expect(previewScope).toHaveCSS(
    '--portal-auth-content-surface-color',
    '#f8fafc',
  )
  ```

  If Playwright cannot read custom properties via `toHaveCSS`, use:

  ```ts
  await expect
    .poll(() =>
      previewScope.evaluate((element) =>
        getComputedStyle(element).getPropertyValue(
          '--portal-auth-content-surface-color',
        ),
      ),
    )
    .toBe('#f8fafc')
  ```

- [ ] **Step 3: Add reset e2e assertions**

  In `admin reset colors restores production-like default color contract`, assert reset payload includes:

  ```ts
  authContentSurface: '#ffffff',
  authContentSurfaceOpacity: 100,
  ```

  Assert controls after reset:

  ```ts
  await expect(
    page.getByLabel('Фон auth-страницы', { exact: true }),
  ).toHaveValue('#f3f7fc')
  await expect(
    page.getByLabel('Фон области входа', { exact: true }),
  ).toHaveValue('#ffffff')
  await expect(
    page.getByLabel('Плотность области входа, значение', { exact: true }),
  ).toHaveValue('100')
  ```

- [ ] **Step 4: Add customer runtime e2e assertions**

  In `tests/e2e/customer-branding-runtime.spec.ts`, add auth content surface fields to `branding.branding.colors`, then in the login route assertion check:

  ```ts
  const authScope = page.locator('.portal-branding-scope')
  await expect
    .poll(() =>
      authScope.evaluate((element) =>
        getComputedStyle(element).getPropertyValue(
          '--portal-auth-content-surface-color',
        ),
      ),
    )
    .toBe('#f8fafc')
  await expect(page.locator('.auth-content-veil')).toBeVisible()
  const firstAuthInput = page.locator('.auth-input').first()
  await expect(firstAuthInput).toBeVisible()
  await firstAuthInput.fill('name@example.com')
  await expect(firstAuthInput).toHaveAttribute('data-filled', 'true')
  await expect
    .poll(() =>
      firstAuthInput.evaluate((element) =>
        getComputedStyle(element).getPropertyValue('background-color'),
      ),
    )
    .toBe('rgba(248, 250, 252, 0.84)')
  ```

  Keep existing chat assertions. Do not change chat runtime mocks except adding new auth color fields to the public branding response.

- [ ] **Step 5: Run focused unit/integration tests**

  Run:

  ```bash
  pnpm --dir backend exec vitest run src/modules/branding/service.test.ts src/modules/branding/repository.test.ts --reporter verbose
  pnpm --dir frontend exec vitest run src/features/branding/api/publicBrandingClient.test.ts src/features/admin-branding/api/adminBrandingClient.test.ts src/features/branding/lib/BrandingProvider.test.tsx src/features/admin-shell/pages/AdminBrandingPage.test.tsx src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx src/features/auth/pages/LoginPage.test.tsx src/features/auth/pages/RequestPages.test.tsx --reporter verbose
  ```

  Expected: PASS.

- [ ] **Step 6: Run focused Playwright checks**

  Ensure local dev environment is running at the configured Playwright base URL, then run:

  ```bash
  pnpm test:e2e -- tests/e2e/admin-branding-settings.spec.ts tests/e2e/admin-branding-real-preview.spec.ts tests/e2e/customer-branding-runtime.spec.ts
  ```

  Expected: PASS.

- [ ] **Step 7: Run final static checks**

  Run:

  ```bash
  pnpm --dir frontend typecheck
  pnpm --dir backend build
  pnpm lint
  pnpm exec prettier --check docs/superpowers/specs/2026-06-09-auth-surface-branding-research.md docs/superpowers/plans/2026-06-10-mt-9h-auth-surface-branding.md
  git diff --check
  ```

  Expected: PASS.

- [ ] **Step 8: Manual browser QA**

  Locally verify:
  - `/admin/branding`:
    - `Фон auth-страницы` changes the auth canvas/background;
    - `Фон области входа` changes the form middle surface;
    - `Плотность области входа` changes the visible density without breaking text readability;
    - reset returns production-like defaults;
    - preview `Вход` matches runtime auth layering;
    - preview `Чат` and `Инфо` still look unchanged except inherited global branding values.
  - `/auth/login`:
    - default visual parity is intact;
    - custom background image remains visible around/through the content veil;
    - header/footer fades blend with the auth surface.
  - Registration/password reset/verification/password setup:
    - pages remain readable;
    - no control text overlaps or broken layout.
  - Chat runtime:
    - transcript/composer/header/info layout has no auth-layer classes and no visual regression.

- [ ] **Step 9: Review checkpoint**

  Request independent review with this scope:

  ```text
  Review MT-9H auth surface branding implementation. Check backend contract,
  migration compatibility for existing non-default auth_background_color,
  API validation, frontend CSS variable derivation, auth runtime layering,
  admin controls, preview parity, and that chat runtime/preview components were
  not changed outside fixture updates or regression assertions.
  ```

  Fix Critical and Important findings before closure.

- [ ] **Step 10: Work-log update only after closure**

  If implementation, tests and review are complete, update `docs/roadmap/work-log.md` Current Baseline with one concise line:

  ```markdown
  - Auth branding middle-surface customization is implemented with tenant-owned
    `authContentSurface` and `authContentSurfaceOpacity` fields, preserving
    default visual parity and keeping chat runtime layout unchanged.
  ```

  Update `Recommended Next Step` only if this changes the next MT-9H action.

- [ ] **Step 11: Checkpoint commit**

  Stage only scope files. Do not stage generated runtime outputs, `.env`, `dist`, `playwright-report`, `test-results` or unrelated docs.

  Suggested commit message after all checks/review:

  ```bash
  git commit -m "feat: add auth surface branding controls"
  ```

## Acceptance Criteria

- Admin can configure auth page background separately from auth content surface color.
- Admin can configure auth content surface opacity as an integer `0..100`.
- Admin color reset restores default auth content surface `#ffffff` and opacity `100`.
- Public/admin branding API responses include `authContentSurface` and `authContentSurfaceOpacity`.
- PATCH validation rejects invalid opacity and unknown fields.
- Existing non-default `auth_background_color` rows are compatibility-backfilled to keep the old middle-surface visual close.
- Runtime auth login/register/password reset/verification/password setup surfaces use semantic auth variables instead of hardcoded white/slate surfaces where this slice applies.
- Admin preview `Вход` uses the same auth semantic surface classes/variables as runtime.
- Chat runtime and chat preview layout components are not modified.
- Focused backend/frontend tests pass.
- Focused Playwright branding/runtime tests pass.
- `frontend typecheck`, `backend build`, `pnpm lint`, targeted Prettier and `git diff --check` pass.
