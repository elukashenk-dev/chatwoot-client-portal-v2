# Auth Full Background Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework auth branding around the approved `Full Background` design mode so tenant admins can create firm-specific login screens with one prepared background image, safe color/style presets and a stable auth layout.

**Architecture:** Keep auth markup stable and customizable through semantic branding tokens rather than a free-form page builder. Use `auth_background_image` as the single supported auth-screen artwork, add small persisted appearance presets for light/dark, overlay, field style and button style, and refactor `AuthShell` so the logo and auth content form one raised vertical stack over the background. This is a new-product contract: remove auth top/bottom image support from runtime, API types and admin UI; this plan does not add `auth_middle_image`.

**Tech Stack:** TypeScript, Fastify, Drizzle ORM/Postgres, Zod, React 19, Tailwind CSS utilities, Vitest, Playwright.

---

## Approved Product Decision

The active auth design model is **Full Background**.

Admins should prepare one image for the full auth screen and tune readable UI tokens around it:

- `auth_background_image` is the main auth-screen artwork.
- `primary` and `accent` colors drive title, icons, links, phone and button.
- `authText` and `authMutedText` keep title/subtitle/legal readable.
- `authColorScheme` selects light or dark auth defaults.
- `authBackgroundOverlay` protects readability over busy images.
- `authFieldStyle` controls field surface behavior.
- `authButtonStyle` controls solid vs gradient button rendering.

Do not add a free-form builder for individual field/button/support backgrounds.
Do not add `auth_middle_image` in this plan.
Do not keep `auth_header_image` or `auth_footer_image` as supported auth design options.

## Required Auth Layout Baseline

The login screen layout must be implemented in the shape captured in
`docs/design/2026-06-16-provgroup-login-screen-figma-spec.md`.

This file is the source of truth for the default auth login markup and spacing:

- `390px` mobile reference frame;
- `440px x 956px` larger-mobile target with the same layout hierarchy, fixed
  typography and centered content column;
- centered `63px x 63px` logo tile near the top;
- title, subtitle, fields, legal text, button, secondary links and support
  block in one raised vertical stack;
- `300px` primary content column for inputs, legal text, button and support
  divider anchors;
- `50px` input controls with `10px` radius;
- `47px` login button with `9px` radius;
- support area with left/right divider lines, centered headset icon, support
  question and `+7 (800) 000-00-00` phone row.

Full Background branding may change the background image, overlay, color scheme,
field style and button style, but it must not change the default block order or
turn the auth page into a free-form layout builder. Responsive behavior may
compress vertical spacing on very short screens and reduce side padding under
`360px`. On larger mobile screens such as `440px x 956px`, use the extra space
as top/bottom breathing room while keeping the primary content column centered
and avoiding viewport-scaled typography. The implementation must keep the same
visual hierarchy and avoid overlap.

## Default Layout Approval Gate

Implementation must start with **Task 0: Default Auth Layout Approval Slice**.
This is a frontend-only visual slice whose purpose is to make the default
`/auth/login` screen visible before backend migrations, admin controls, legal
persistence or broad auth-flow work begins.

Hard rule:

- Complete Task 0 first.
- Show the default login layout to the user at `390px x 844px` and
  `440px x 956px`.
- Stop after Task 0 and wait for explicit user approval.
- Do not start Task 1 or any later task until the user confirms that the default
  design direction is acceptable.
- If the user requests visual changes, revise only Task 0 scope and repeat the
  preview loop before continuing.

Task 0 may keep temporary compatibility in public component props where that
keeps the slice small. Later tasks remove old backend/admin contracts and
complete the full product implementation after approval.

## Legal Text And Registration Consent Baseline

This plan must add legal text and legal document screens as part of the auth
surface.

Legal research baseline for Russia:

- Federal Law No. 152-FZ Article 18.1 requires the operator to publish or
  otherwise provide unrestricted access to the personal data processing policy
  when collecting personal data online:
  `https://www.consultant.ru/document/cons_doc_LAW_61801/eeeebe22bf738fd65bb66b95cc278911ae2525ee/`
- Federal Law No. 152-FZ Article 9 requires personal data processing consent to
  be concrete, informed, conscious and unambiguous, and to be оформлено
  separately from other information/documents confirmed by the subject:
  `https://www.consultant.ru/document/cons_doc_LAW_61801/6c94959bc017ac80140621762d2ac59f6006b08c/`
- Federal Law No. 152-FZ Article 18 requires explaining legal consequences if
  providing personal data or consent is mandatory:
  `https://www.consultant.ru/document/cons_doc_LAW_61801/cbf4e15b7c330f9372e876cdf2bc928bad7950ef/`
- Federal Law No. 152-FZ Article 6 lists consent and contract execution among
  lawful bases for processing:
  `https://www.consultant.ru/document/cons_doc_LAW_61801/315f051396c88f1e4f827ba3f2ae313d999a1873/`

Legal audit authority:

- Legal document versions stored in backend audit records are backend-owned.
  The browser must not be the source of truth for `termsVersion` or
  `privacyPolicyVersion`.
- The registration API must validate only explicit consent booleans from the
  browser. It must reject or ignore any client attempt to provide document
  version fields; this plan chooses rejection through strict request-body
  parsing.

Product decision:

- Login screen: render the legal text as informational copy only. It must have
  real links to the legal screens, but no checkbox and no login-blocking logic.
- Registration request screen: render legal acceptance controls before the
  submit button. The registration button stays disabled until required legal
  controls are checked.
- Backend must reject registration requests unless required legal acceptance
  flags are `true`; frontend-only disabling is not sufficient.
- Store a registration legal acceptance record with tenant, normalized email,
  required accepted flags, backend-owned document versions, timestamp, IP and
  user agent. When portal user creation completes, link the acceptance to the
  created portal user if possible.
- Do not phrase the privacy policy as something the user "accepts". The user
  accepts the user agreement and confirms awareness of the personal data policy.
- Because Article 9 says personal data processing consent should be separate
  from other confirmed documents, use separate controls:
  - `Я принимаю Пользовательское соглашение`;
  - `Я даю согласие на обработку персональных данных и подтверждаю, что
ознакомлен с Политикой обработки персональных данных`.

What can be removed from the Figma-style legal copy:

- On login, do not use fake link-colored non-interactive text. Links must be
  real links or the text should not look like links.
- On registration, do not rely on the phrase `Используя сервис, вы
соглашаетесь...` as the consent mechanism. Use explicit checkbox labels.
- Do not put personal-data consent only inside the user agreement.

Legal document screens:

- Add `/legal/terms` for `Пользовательское соглашение`.
- Add `/legal/privacy` for `Политика обработки персональных данных`.
- Both routes must be public and accessible to authenticated and unauthenticated
  users; they must not be redirected away by `PublicAuthRoute`.
- The first implementation uses static non-production product text so the flow
  can be tested end-to-end. Before production use, the final operator-specific
  legal documents must be reviewed by a lawyer/operator owner.

## Source References

- Figma measurement source: `docs/design/2026-06-16-provgroup-login-screen-figma-spec.md`
- Existing auth shell: `frontend/src/shared/ui/AuthShell.tsx`
- Existing auth frame: `frontend/src/app/layouts/AuthFrame.tsx`
- Existing login page: `frontend/src/features/auth/pages/LoginPage.tsx`
- Existing admin branding form: `frontend/src/features/admin-branding/components/AdminBrandingForm.tsx`
- Existing asset controls: `frontend/src/features/admin-branding/components/BrandingAssetControls.tsx`
- Existing backend branding schema: `backend/src/db/brandingSchema.ts`
- Existing asset kinds: `backend/src/modules/branding/brandingAssets.ts`

## Guardrails

- Keep Chatwoot core untouched.
- Browser must not receive Chatwoot or object-storage authority.
- Keep all auth fields, focus states, validation states, autofill, password visibility, links and submit behavior as real HTML controls.
- Keep a single stable auth layout; do not expose admin controls that reorder the page.
- Remove `auth_header_image` and `auth_footer_image` from the supported auth branding model; test tenants can be reset through migration/data cleanup.
- New appearance defaults should preserve the current light visual baseline where it helps local testing, but do not add old-layout fallback code for auth top/bottom image layouts.
- Do not change chat runtime styling except where shared branding types require compile updates.
- `/auth/login`, `/auth/register`, password reset, OTP/set-password flows and `/admin/login` must share the same auth shell baseline.

## File Map

Approval-first default auth layout slice:

- Modify: `frontend/src/app/layouts/AuthFrame.tsx`
- Modify: `frontend/src/app/routePaths.ts`
- Modify: `frontend/src/app/AppRoutes.tsx`
- Modify: `frontend/src/shared/ui/AuthShell.tsx`
- Modify: `frontend/src/shared/ui/PageIntro.tsx`
- Modify: `frontend/src/shared/ui/icons.tsx`
- Modify: `frontend/src/shared/ui/inputStyles.ts`
- Modify: `frontend/src/features/auth/components/LoginForm.tsx`
- Modify: `frontend/src/features/auth/pages/LoginPage.tsx`
- Create: `frontend/src/features/auth/components/AuthLegalNotice.tsx`
- Create: `frontend/src/features/auth/components/AuthSupportBlock.tsx`
- Create: `frontend/src/features/auth/components/AuthSecondaryLinks.tsx`
- Create: `frontend/src/features/legal/pages/LegalDocumentPage.tsx`
- Create: `frontend/src/features/legal/legalDocuments.ts`
- Modify: `frontend/src/index.css`
- Test: `frontend/src/app/AppRoutes.legal.test.tsx`
- Test: `frontend/src/features/auth/pages/LoginPage.test.tsx`
- Test: `frontend/src/features/admin-auth/pages/AdminLoginPage.test.tsx`

Backend contract:

- Modify: `backend/src/db/brandingSchema.ts`
- Generate: `backend/drizzle/00xx_*.sql`
- Generate: `backend/drizzle/meta/00xx_snapshot.json`
- Modify: `backend/drizzle/meta/_journal.json`
- Modify: `backend/src/modules/branding/brandingDefaults.ts`
- Modify: `backend/src/modules/branding/brandingValidation.ts`
- Modify: `backend/src/modules/branding/repository.ts`
- Modify: `backend/src/modules/branding/service.ts`
- Modify: `backend/src/modules/branding/brandingAssets.ts`
- Modify: `backend/src/modules/branding/assetService.ts`
- Test: `backend/src/modules/branding/service.test.ts`
- Test: `backend/src/modules/branding/repository.test.ts`
- Test: `backend/src/modules/branding/brandingAssets.test.ts`
- Test: `backend/src/modules/branding/assetService.test.ts`

Frontend contract and token derivation:

- Modify: `frontend/src/features/branding/api/publicBrandingClient.ts`
- Modify: `frontend/src/features/admin-branding/api/adminBrandingClient.ts`
- Modify: `frontend/src/features/branding/lib/brandingDefaults.ts`
- Modify: `frontend/src/features/branding/lib/brandingCss.ts`
- Modify: `frontend/src/features/admin-branding/lib/brandingState.ts`
- Modify: `frontend/src/features/admin-branding/lib/previewBranding.ts`
- Test: `frontend/src/features/branding/lib/BrandingProvider.test.tsx`
- Test: `frontend/src/features/branding/api/publicBrandingClient.test.ts`
- Test: `frontend/src/features/admin-branding/api/adminBrandingClient.test.ts`

Auth runtime and preview:

- Modify: `frontend/src/app/layouts/AuthFrame.tsx`
- Modify: `frontend/src/shared/ui/AuthShell.tsx`
- Modify: `frontend/src/shared/ui/PageIntro.tsx`
- Modify: `frontend/src/shared/ui/icons.tsx`
- Modify: `frontend/src/shared/ui/inputStyles.ts`
- Modify: `frontend/src/features/tenant/components/TenantAuthShell.tsx`
- Modify: `frontend/src/features/auth/components/LoginForm.tsx`
- Modify: `frontend/src/features/auth/pages/LoginPage.tsx`
- Modify: `frontend/src/features/auth/components/AuthSupportBlock.tsx`
- Modify: `frontend/src/features/auth/components/AuthSecondaryLinks.tsx`
- Modify: `frontend/src/features/admin-branding/components/portal-preview/AuthLoginPreview.tsx`
- Modify: `frontend/src/index.css`
- Test: `frontend/src/features/auth/pages/LoginPage.test.tsx`
- Test: `frontend/src/features/auth/pages/RequestPages.test.tsx`
- Test: `frontend/src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx`

Admin branding UI:

- Modify: `frontend/src/features/admin-branding/components/AdminBrandingForm.tsx`
- Modify: `frontend/src/features/admin-branding/components/BrandingAssetControls.tsx`
- Create: `frontend/src/features/admin-branding/components/AuthAppearanceControls.tsx`
- Test: `frontend/src/features/admin-shell/pages/AdminBrandingPage.test.tsx`

Legal pages and registration consent:

- Modify: `frontend/src/app/routePaths.ts`
- Modify: `frontend/src/app/AppRoutes.tsx`
- Modify: `frontend/src/features/legal/pages/LegalDocumentPage.tsx`
- Modify: `frontend/src/features/legal/legalDocuments.ts`
- Modify: `frontend/src/features/auth/components/AuthLegalNotice.tsx`
- Create: `frontend/src/features/auth/components/RegistrationLegalConsent.tsx`
- Modify: `frontend/src/features/auth/pages/LoginPage.tsx`
- Modify: `frontend/src/features/auth/components/RegisterRequestForm.tsx`
- Modify: `frontend/src/features/auth/api/authClient.ts`
- Modify: `frontend/src/features/auth/types.ts`
- Modify: `frontend/src/features/auth/lib/registerRequestValidation.ts`
- Modify: `backend/src/db/schema.ts`
- Generate: `backend/drizzle/00xx_*.sql`
- Generate: `backend/drizzle/meta/00xx_snapshot.json`
- Modify: `backend/drizzle/meta/_journal.json`
- Modify: `backend/src/modules/registration/routes.ts`
- Create: `backend/src/modules/registration/legalDocuments.ts`
- Modify: `backend/src/modules/registration/repository.ts`
- Modify: `backend/src/modules/registration/service.ts`
- Test: `frontend/src/app/AppRoutes.legal.test.tsx`
- Test: `frontend/src/features/auth/pages/LoginPage.test.tsx`
- Test: `frontend/src/features/auth/pages/RequestPages.test.tsx`
- Test: `backend/src/modules/registration/service.test.ts`
- Test: `backend/src/app.test.ts`

Browser checks:

- Modify: `tests/e2e/admin-branding-settings.spec.ts`
- Modify: `tests/e2e/admin-branding-real-preview.spec.ts`
- Modify: `tests/e2e/customer-branding-runtime.spec.ts`

## Data Model

Add nullable fields to `portal_branding_settings`:

```ts
authColorScheme: text('auth_color_scheme'),
authBackgroundOverlay: text('auth_background_overlay'),
authFieldStyle: text('auth_field_style'),
authButtonStyle: text('auth_button_style'),
```

Persisted values:

```ts
export const authColorSchemeValues = ['light', 'dark'] as const
export const authBackgroundOverlayValues = ['none', 'light', 'dark'] as const
export const authFieldStyleValues = ['solid', 'translucent', 'outline'] as const
export const authButtonStyleValues = ['solid', 'gradient'] as const
```

Defaults:

```ts
export const defaultBrandingAppearance = {
  authBackgroundOverlay: 'none',
  authButtonStyle: 'solid',
  authColorScheme: 'light',
  authFieldStyle: 'solid',
} as const
```

Public/admin response gains:

```ts
appearance: {
  authBackgroundOverlay: 'none' | 'light' | 'dark'
  authButtonStyle: 'solid' | 'gradient'
  authColorScheme: 'light' | 'dark'
  authFieldStyle: 'solid' | 'translucent' | 'outline'
}
```

Admin patch gains:

```ts
appearance?: Partial<BrandingAppearance>
```

Remove old auth section artwork from the supported contract:

- remove `auth_header_image` and `auth_footer_image` from backend `brandingAssetKinds`;
- remove `authHeaderImageAssetId` and `authFooterImageAssetId` from settings schema/repository/service responses;
- remove `auth_header_image` and `auth_footer_image` from
  `assetService.ts` `settingsPatchByKind`;
- remove `auth_header_image` and `auth_footer_image` from frontend asset union types and admin upload slots;
- migration may delete existing test rows for these two asset kinds before tightening the asset-kind check.

## Task 0: Default Auth Layout Approval Slice

**Files:**

- Modify: `frontend/src/app/layouts/AuthFrame.tsx`
- Modify: `frontend/src/app/routePaths.ts`
- Modify: `frontend/src/app/AppRoutes.tsx`
- Modify: `frontend/src/shared/ui/AuthShell.tsx`
- Modify: `frontend/src/shared/ui/PageIntro.tsx`
- Modify: `frontend/src/shared/ui/inputStyles.ts`
- Modify: `frontend/src/features/auth/components/LoginForm.tsx`
- Modify: `frontend/src/features/auth/pages/LoginPage.tsx`
- Create: `frontend/src/features/auth/components/AuthLegalNotice.tsx`
- Create: `frontend/src/features/auth/components/AuthSupportBlock.tsx`
- Create: `frontend/src/features/auth/components/AuthSecondaryLinks.tsx`
- Create: `frontend/src/features/legal/pages/LegalDocumentPage.tsx`
- Create: `frontend/src/features/legal/legalDocuments.ts`
- Modify: `frontend/src/index.css`
- Test: `frontend/src/app/AppRoutes.legal.test.tsx`
- Test: `frontend/src/features/auth/pages/LoginPage.test.tsx`
- Test: `frontend/src/features/admin-auth/pages/AdminLoginPage.test.tsx`

This task is the user approval checkpoint. It deliberately avoids backend
migrations, admin branding controls, asset-kind removal, legal persistence and
registration consent logic. It creates the default visual baseline first so the
user can approve or reject the layout before the larger implementation starts.

- [x] **Step 1: Add failing visual structure tests**

  In `frontend/src/features/auth/pages/LoginPage.test.tsx`, add assertions to
  the existing login render test:

  ```ts
  const container = document.body

  expect(container.querySelector('.auth-stack')).toBeInTheDocument()
  expect(
    container.querySelector('.auth-brand-mark--in-flow'),
  ).toBeInTheDocument()
  expect(container.querySelector('.auth-header-shell')).not.toBeInTheDocument()
  expect(container.querySelector('.auth-footer-art')).not.toBeInTheDocument()
  expect(container.querySelector('.auth-form-slot')).toBeInTheDocument()
  expect(screen.getByText('+7 (800) 000-00-00')).toBeInTheDocument()
  expect(
    screen.getByText(/Используя сервис, вы принимаете/i),
  ).toBeInTheDocument()
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  ```

  In `frontend/src/features/admin-auth/pages/AdminLoginPage.test.tsx`, add a
  smoke assertion to the initial render:

  ```ts
  expect(document.body.querySelector('.auth-stack')).toBeInTheDocument()
  expect(
    document.body.querySelector('.auth-header-shell'),
  ).not.toBeInTheDocument()
  ```

  Expected before implementation: FAIL because the current auth shell still
  uses old header/footer art markup.

- [x] **Step 2: Build the minimal stacked auth shell**

  In `AuthFrame.tsx`, keep viewport locking but remove the inner hardcoded white
  frame:

  ```tsx
  <main className="auth-frame-background app-shell-viewport text-slate-900 antialiased">
    <div className="mx-auto flex h-full min-h-0 w-full justify-center">
      <div className="relative flex h-full min-h-0 w-full max-w-[500px] flex-col overflow-x-hidden overflow-y-auto overscroll-none">
        {children}
      </div>
    </div>
  </main>
  ```

  In `AuthShell.tsx`, keep `headerImageUrl` and `footerImageUrl` in
  `AuthShellProps` for Task 0 compatibility, but stop rendering
  `.auth-header-shell`, `.auth-header-art`, `.auth-header-fade` and
  `.auth-footer-art`. Render the approval layout:

  ```tsx
  <section className="auth-canvas-background relative flex min-h-full w-full overflow-hidden">
    <div
      aria-hidden="true"
      className="auth-background-overlay absolute inset-0 z-0"
    />
    <div className="auth-stack relative z-10 mx-auto flex min-h-full w-full max-w-[390px] flex-col pb-[calc(4rem+env(safe-area-inset-bottom))]">
      <BrandMark
        className={cn(
          'auth-brand-mark auth-brand-mark--in-flow',
          brandPlacementClassMap[brandPlacement],
        )}
        logoUrl={brandLogoUrl}
        monogram={brandMonogram}
        name={brandName}
      />
      <div className="auth-intro text-center">
        <PageIntro description={description} title={title} />
      </div>
      <div className="auth-form-slot flex flex-1 flex-col">{children}</div>
    </div>
  </section>
  ```

- [x] **Step 3: Add login visual helper components**

  Add minimal public legal routes during the approval slice so the login legal
  text uses real links from the first preview.

  In `routePaths.ts`, add:

  ```ts
  legal: {
    privacy: '/legal/privacy',
    terms: '/legal/terms',
  },
  ```

  In `AppRoutes.tsx`, add `LegalDocumentPage` as a lazy route and mount
  `/legal/terms` and `/legal/privacy` at the top `Routes` level, outside
  `PublicAuthRoute`.

  Create `frontend/src/features/legal/legalDocuments.ts`:

  ```ts
  export type LegalDocumentId = 'privacy' | 'terms'

  export const legalDocumentVersion = '2026-06-16'

  export const legalDocuments = {
    privacy: {
      title: 'Политика обработки персональных данных',
      version: legalDocumentVersion,
      body: [
        'Тестовая редакция для проверки интерфейса. Перед production текст заменяется утвержденной редакцией оператора.',
      ],
    },
    terms: {
      title: 'Пользовательское соглашение',
      version: legalDocumentVersion,
      body: [
        'Тестовая редакция для проверки интерфейса. Перед production текст заменяется утвержденной редакцией оператора.',
      ],
    },
  } as const satisfies Record<
    LegalDocumentId,
    {
      body: string[]
      title: string
      version: string
    }
  >
  ```

  Create `frontend/src/features/legal/pages/LegalDocumentPage.tsx`:

  ```tsx
  import { Link } from 'react-router-dom'

  import { AuthFrame } from '../../../app/layouts/AuthFrame'
  import { routePaths } from '../../../app/routePaths'
  import { legalDocuments, type LegalDocumentId } from '../legalDocuments'

  export function LegalDocumentPage({
    document,
  }: {
    document: LegalDocumentId
  }) {
    const content = legalDocuments[document]

    return (
      <AuthFrame>
        <article className="mx-auto flex min-h-full w-full max-w-[390px] flex-col px-7 py-10 text-slate-900">
          <Link
            className="mb-8 text-sm font-medium text-[#00438d]"
            to={routePaths.auth.login}
          >
            Вернуться ко входу
          </Link>
          <h1 className="text-2xl font-semibold leading-tight text-[#15486b]">
            {content.title}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Версия документа: {content.version}
          </p>
          <div className="mt-8 space-y-4 text-base leading-7 text-slate-700">
            {content.body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </article>
      </AuthFrame>
    )
  }
  ```

  Create `frontend/src/features/auth/components/AuthLegalNotice.tsx`:

  ```tsx
  import { Link } from 'react-router-dom'

  import { routePaths } from '../../../app/routePaths'

  export function AuthLegalNotice() {
    return (
      <p className="auth-legal-text">
        Используя сервис, вы принимаете{' '}
        <Link to={routePaths.legal.terms}>Пользовательское соглашение</Link> и
        подтверждаете ознакомление с{' '}
        <Link to={routePaths.legal.privacy}>
          Политикой обработки персональных данных
        </Link>
        .
      </p>
    )
  }
  ```

  Add `frontend/src/app/AppRoutes.legal.test.tsx`:

  ```tsx
  import { screen } from '@testing-library/react'
  import { describe, expect, it } from 'vitest'

  import { renderWithRouter } from '../test/renderWithRouter'
  import { AppRoutes } from './AppRoutes'

  describe('legal routes', () => {
    it.each([
      ['/legal/terms', 'Пользовательское соглашение'],
      ['/legal/privacy', 'Политика обработки персональных данных'],
    ])('renders %s without auth redirects', async (path, heading) => {
      renderWithRouter(<AppRoutes />, { initialEntries: [path] })

      expect(
        await screen.findByRole('heading', { name: heading }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('link', { name: 'Вернуться ко входу' }),
      ).toHaveAttribute('href', '/auth/login')
    })
  })
  ```

  Create `frontend/src/features/auth/components/AuthSecondaryLinks.tsx`:

  ```tsx
  import { Link } from 'react-router-dom'

  import { routePaths } from '../../../app/routePaths'

  export function AuthSecondaryLinks() {
    return (
      <div className="auth-secondary-links">
        <Link to={routePaths.auth.passwordResetRequest}>Забыли пароль?</Link>
        <span aria-hidden="true" className="auth-secondary-links__separator" />
        <Link to={routePaths.auth.register}>Создать аккаунт</Link>
      </div>
    )
  }
  ```

  Create `frontend/src/features/auth/components/AuthSupportBlock.tsx`:

  ```tsx
  import { HeadphonesIcon, PhoneIcon } from '../../../shared/ui/icons'

  export function AuthSupportBlock() {
    return (
      <div className="auth-support-block">
        <div className="auth-support-divider" aria-hidden="true">
          <span />
          <HeadphonesIcon className="auth-support-icon" />
          <span />
        </div>
        <p>Нет доступа к чату?</p>
        <a className="auth-support-phone" href="tel:+78000000000">
          <PhoneIcon aria-hidden="true" />
          +7 (800) 000-00-00
        </a>
      </div>
    )
  }
  ```

  If `HeadphonesIcon` does not exist, add it to
  `frontend/src/shared/ui/icons.tsx` using the same prop shape and stroke style
  as the existing local icons.

- [x] **Step 4: Wire the approval layout into login**

  In `LoginPage.tsx`, render the login form, legal notice, secondary links and
  support block in the Figma order:

  ```tsx
  <LoginForm />
  <AuthLegalNotice />
  <AuthSecondaryLinks />
  <AuthSupportBlock />
  ```

  Keep existing login submit behavior and password visibility behavior intact.

- [x] **Step 5: Apply approval CSS for the default design**

  In `frontend/src/index.css`, add the approval baseline from
  `docs/design/2026-06-16-provgroup-login-screen-figma-spec.md`:

  ```css
  .auth-frame-background {
    background: #e2e8f0;
    font-family:
      Inter,
      ui-sans-serif,
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      'Segoe UI',
      sans-serif;
  }

  .auth-canvas-background {
    background: #f7f7f7;
    color: #15486b;
  }

  .auth-background-overlay {
    background: rgb(0 0 0 / 0);
    pointer-events: none;
  }

  .auth-stack {
    min-height: 100%;
    padding-left: var(--auth-stack-inline, 44px);
    padding-right: var(--auth-stack-inline, 44px);
    padding-top: var(--auth-stack-top, 51px);
  }

  .auth-brand-mark--in-flow {
    align-self: center;
    height: 63px;
    width: 63px;
  }

  .auth-intro {
    margin-top: 44px;
  }

  .auth-form-slot {
    margin-top: 43px;
  }

  .auth-legal-text {
    color: #b2b8c4;
    font-size: 12px;
    line-height: 16px;
    margin: 28px auto 0;
    max-width: 300px;
    text-align: center;
  }

  .auth-legal-text a,
  .auth-secondary-links a,
  .auth-support-block {
    color: #003a78;
  }

  .auth-secondary-links {
    align-items: center;
    display: grid;
    font-size: 13px;
    grid-template-columns: 1fr auto 1fr;
    margin-top: 28px;
  }

  .auth-secondary-links a {
    text-decoration: none;
  }

  .auth-secondary-links__separator {
    background: rgb(174 180 192 / 0.9);
    height: 19px;
    width: 1px;
  }

  .auth-support-block {
    margin-top: auto;
    padding-top: 36px;
    text-align: center;
  }

  .auth-support-divider {
    align-items: center;
    display: grid;
    gap: 34px;
    grid-template-columns: minmax(0, 1fr) 30px minmax(0, 1fr);
  }

  .auth-support-divider span {
    background: rgb(199 205 214 / 0.9);
    height: 1px;
  }

  .auth-support-icon {
    color: #9aa5b5;
    height: 30px;
    width: 30px;
  }

  .auth-support-block p {
    font-size: 14px;
    margin-top: 48px;
  }

  .auth-support-phone {
    align-items: center;
    display: inline-flex;
    font-size: 14px;
    font-weight: 600;
    gap: 9px;
    margin-top: 14px;
    text-decoration: none;
  }

  @media (max-width: 359px) {
    .auth-stack {
      --auth-stack-inline: 24px;
    }
  }

  @media (max-height: 760px) {
    .auth-stack {
      --auth-stack-top: 32px;
    }
  }

  @media (min-width: 430px) and (min-height: 900px) {
    .auth-stack {
      --auth-stack-top: 70px;
      --auth-stack-inline: 70px;
    }
  }
  ```

- [x] **Step 6: Run small approval-slice checks**

  Run:

  ```bash
  pnpm --dir frontend test -- src/app/AppRoutes.legal.test.tsx src/features/auth/pages/LoginPage.test.tsx src/features/admin-auth/pages/AdminLoginPage.test.tsx
  pnpm --dir frontend typecheck
  ```

  Expected: PASS.

- [x] **Step 7: Start local preview and stop for user approval**

  Run:

  ```bash
  pnpm --dir frontend dev -- --host 127.0.0.1 --port 5173
  ```

  Open:
  - `http://127.0.0.1:5173/auth/login`
  - `http://127.0.0.1:5173/admin/login`

  Check both viewport sizes:
  - `390px x 844px`
  - `440px x 956px`

  Show the user the local URL and the checked viewport sizes. Then stop.

  **HARD STOP:** Do not run Task 1, do not start backend migrations, do not add
  admin branding controls and do not commit the visual baseline until the user
  explicitly approves the default design.

- [x] **Step 8: Commit only after approval**

  After user approval and passing checks, commit:

  ```bash
  git add frontend/src/app/layouts/AuthFrame.tsx frontend/src/app/routePaths.ts frontend/src/app/AppRoutes.tsx frontend/src/app/AppRoutes.legal.test.tsx frontend/src/shared/ui/AuthShell.tsx frontend/src/shared/ui/PageIntro.tsx frontend/src/shared/ui/icons.tsx frontend/src/shared/ui/inputStyles.ts frontend/src/features/auth/components/LoginForm.tsx frontend/src/features/auth/pages/LoginPage.tsx frontend/src/features/auth/components/AuthLegalNotice.tsx frontend/src/features/auth/components/AuthSupportBlock.tsx frontend/src/features/auth/components/AuthSecondaryLinks.tsx frontend/src/features/legal frontend/src/index.css frontend/src/features/auth/pages/LoginPage.test.tsx frontend/src/features/admin-auth/pages/AdminLoginPage.test.tsx
  git commit -m "feat: add default auth layout baseline"
  ```

## Task 1: Backend Appearance Contract

**Files:**

- Modify: `backend/src/db/brandingSchema.ts`
- Generate: `backend/drizzle/00xx_*.sql`
- Generate: `backend/drizzle/meta/00xx_snapshot.json`
- Modify: `backend/drizzle/meta/_journal.json`
- Modify: `backend/src/modules/branding/brandingDefaults.ts`
- Modify: `backend/src/modules/branding/brandingValidation.ts`
- Modify: `backend/src/modules/branding/repository.ts`
- Modify: `backend/src/modules/branding/service.ts`
- Modify: `backend/src/modules/branding/brandingAssets.ts`
- Modify: `backend/src/modules/branding/assetService.ts`
- Test: `backend/src/modules/branding/service.test.ts`
- Test: `backend/src/modules/branding/repository.test.ts`
- Test: `backend/src/modules/branding/brandingAssets.test.ts`
- Test: `backend/src/modules/branding/assetService.test.ts`

- [x] **Step 1: Add failing service tests for default appearance response**

  In `backend/src/modules/branding/service.test.ts`, extend the default admin and public branding assertions:

  ```ts
  expect(result.branding.appearance).toEqual({
    authBackgroundOverlay: 'none',
    authButtonStyle: 'solid',
    authColorScheme: 'light',
    authFieldStyle: 'solid',
  })
  ```

  Expected before implementation: FAIL because `branding.appearance` is missing.

- [x] **Step 2: Add failing service tests for appearance patch mapping**

  In `backend/src/modules/branding/service.test.ts`, extend the existing admin update test input:

  ```ts
  appearance: {
    authBackgroundOverlay: 'dark',
    authButtonStyle: 'gradient',
    authColorScheme: 'dark',
    authFieldStyle: 'outline',
  },
  ```

  Assert the repository patch:

  ```ts
  expect(repository.upsertSettings).toHaveBeenCalledWith(
    expect.objectContaining({
      authBackgroundOverlay: 'dark',
      authButtonStyle: 'gradient',
      authColorScheme: 'dark',
      authFieldStyle: 'outline',
    }),
  )
  ```

  Expected before implementation: FAIL with `BRANDING_SETTINGS_INVALID`.

- [x] **Step 3: Add invalid enum validation tests**

  In `backend/src/modules/branding/service.test.ts`, add:

  ```ts
  it.each([
    [{ authColorScheme: 'auto' }],
    [{ authBackgroundOverlay: 'heavy' }],
    [{ authFieldStyle: 'glassmorphism' }],
    [{ authButtonStyle: 'image' }],
  ])('rejects invalid auth appearance %#', async (appearance) => {
    const repository = createRepository()
    const service = createBrandingService({
      audit: vi.fn(),
      repository,
      tenant,
    })

    await expect(
      service.updateAdminBranding({
        admin,
        input: { appearance },
        requestIp: null,
        userAgent: null,
      }),
    ).rejects.toMatchObject({
      code: 'BRANDING_SETTINGS_INVALID',
      statusCode: 400,
    })
    expect(repository.upsertSettings).not.toHaveBeenCalled()
  })
  ```

  Expected before implementation: FAIL if invalid values are accepted or fail with a different error shape.

- [x] **Step 4: Add repository storage/readback tests**

  In `backend/src/modules/branding/repository.test.ts`, extend the settings patch used by the readback test:

  ```ts
  authBackgroundOverlay: 'dark',
  authButtonStyle: 'gradient',
  authColorScheme: 'dark',
  authFieldStyle: 'outline',
  ```

  Assert readback:

  ```ts
  expect(settings).toEqual(
    expect.objectContaining({
      authBackgroundOverlay: 'dark',
      authButtonStyle: 'gradient',
      authColorScheme: 'dark',
      authFieldStyle: 'outline',
    }),
  )
  ```

  Expected before implementation: FAIL because repository types/schema do not include these fields.

- [x] **Step 5: Implement schema fields and constraints**

  In `backend/src/db/brandingSchema.ts`, add columns to `portalBrandingSettings`:

  ```ts
  authColorScheme: text('auth_color_scheme'),
  authBackgroundOverlay: text('auth_background_overlay'),
  authFieldStyle: text('auth_field_style'),
  authButtonStyle: text('auth_button_style'),
  ```

  Add checks:

  ```ts
  check(
    'portal_branding_settings_auth_color_scheme_check',
    sql`${table.authColorScheme} is null or ${table.authColorScheme} in ('light', 'dark')`,
  ),
  check(
    'portal_branding_settings_auth_background_overlay_check',
    sql`${table.authBackgroundOverlay} is null or ${table.authBackgroundOverlay} in ('none', 'light', 'dark')`,
  ),
  check(
    'portal_branding_settings_auth_field_style_check',
    sql`${table.authFieldStyle} is null or ${table.authFieldStyle} in ('solid', 'translucent', 'outline')`,
  ),
  check(
    'portal_branding_settings_auth_button_style_check',
    sql`${table.authButtonStyle} is null or ${table.authButtonStyle} in ('solid', 'gradient')`,
  ),
  ```

- [x] **Step 6: Remove old auth top/bottom image contract from backend**

  In `backend/src/modules/branding/brandingAssets.ts`, remove `auth_header_image` and `auth_footer_image` from `brandingAssetKinds`.

  In `backend/src/db/brandingSchema.ts`:
  - remove `authHeaderImageAssetId`;
  - remove `authFooterImageAssetId`;
  - remove `portal_branding_settings_auth_header_asset_tenant_fk`;
  - remove `portal_branding_settings_auth_footer_asset_tenant_fk`;
  - remove `auth_header_image` and `auth_footer_image` from `portal_branding_assets_kind_check`.

  In `repository.ts` and `service.ts`, remove all selection, patch and response mapping for the removed settings fields.

  In `assetService.ts`, remove old mappings from `settingsPatchByKind`:

  ```ts
  auth_footer_image: (assetId: number | null) => ({
    authFooterImageAssetId: assetId,
  }),
  auth_header_image: (assetId: number | null) => ({
    authHeaderImageAssetId: assetId,
  }),
  ```

  Add or update `backend/src/modules/branding/brandingAssets.test.ts`:

  ```ts
  expect(() => parseBrandingAssetKind('auth_header_image')).toThrow(
    expect.objectContaining({ code: 'BRANDING_ASSET_KIND_NOT_FOUND' }),
  )
  expect(() => parseBrandingAssetKind('auth_footer_image')).toThrow(
    expect.objectContaining({ code: 'BRANDING_ASSET_KIND_NOT_FOUND' }),
  )
  expect(parseBrandingAssetKind('auth_background_image')).toBe(
    'auth_background_image',
  )
  ```

  Add or update `backend/src/modules/branding/assetService.test.ts` with a
  regression that the asset service can still upload/delete
  `auth_background_image`. The removed auth kinds must be covered through
  `brandingAssets.test.ts`; after the union is narrowed, the existing
  `settingsPatchByKind satisfies Record<BrandingAssetKind, ...>` compile check
  must fail if stale `auth_header_image` or `auth_footer_image` mappings remain
  in `assetService.ts`.

- [x] **Step 7: Generate migration**

  Run:

  ```bash
  pnpm --dir backend db:generate
  ```

  Expected: a new `backend/drizzle/00xx_*.sql`, matching snapshot, and `_journal.json` entry. The SQL must:
  - add four nullable appearance text columns;
  - add four enum check constraints;
  - drop old auth header/footer settings FKs and columns;
  - remove old auth header/footer asset kinds from the asset-kind check.

  If generated SQL does not clean old test asset rows before tightening the asset-kind check, edit the migration to include:

  ```sql
  DELETE FROM "portal_branding_assets"
  WHERE "kind" IN ('auth_header_image', 'auth_footer_image');
  ```

- [x] **Step 8: Implement backend defaults, validation, repository and service mapping**

  In `backend/src/modules/branding/brandingDefaults.ts`, add `defaultBrandingAppearance` with the defaults from this plan.

  In `backend/src/modules/branding/brandingValidation.ts`, add strict `appearance` parsing:

  ```ts
  const authColorSchemeSchema = z.enum(['light', 'dark'])
  const authBackgroundOverlaySchema = z.enum(['none', 'light', 'dark'])
  const authFieldStyleSchema = z.enum(['solid', 'translucent', 'outline'])
  const authButtonStyleSchema = z.enum(['solid', 'gradient'])
  ```

  Include:

  ```ts
  appearance: z
    .object({
      authBackgroundOverlay: authBackgroundOverlaySchema.optional(),
      authButtonStyle: authButtonStyleSchema.optional(),
      authColorScheme: authColorSchemeSchema.optional(),
      authFieldStyle: authFieldStyleSchema.optional(),
    })
    .strict()
    .optional(),
  ```

  In `repository.ts`, add these fields to `BrandingSettingsPatch`, `findSettings()` selection and `upsertSettings()` insert/update mapping.

  In `service.ts`, coalesce response values from settings to `defaultBrandingAppearance` and map parsed patch values to repository fields.

- [x] **Step 9: Run backend targeted tests**

  Run:

  ```bash
  pnpm --dir backend test -- src/modules/branding/service.test.ts src/modules/branding/repository.test.ts src/modules/branding/brandingAssets.test.ts src/modules/branding/assetService.test.ts
  ```

  Expected: PASS.

- [x] **Step 10: Commit backend contract slice**

  Commit only backend contract files and tests:

  ```bash
  git add backend/src/db/brandingSchema.ts backend/drizzle backend/src/modules/branding/brandingAssets.ts backend/src/modules/branding/brandingDefaults.ts backend/src/modules/branding/brandingValidation.ts backend/src/modules/branding/repository.ts backend/src/modules/branding/service.ts backend/src/modules/branding/assetService.ts backend/src/modules/branding/service.test.ts backend/src/modules/branding/repository.test.ts backend/src/modules/branding/brandingAssets.test.ts backend/src/modules/branding/assetService.test.ts
  git commit -m "feat: add auth appearance branding contract"
  ```

## Task 2: Frontend Branding Types And CSS Tokens

**Files:**

- Modify: `frontend/src/features/branding/api/publicBrandingClient.ts`
- Modify: `frontend/src/features/admin-branding/api/adminBrandingClient.ts`
- Modify: `frontend/src/features/branding/lib/brandingDefaults.ts`
- Modify: `frontend/src/features/branding/lib/brandingCss.ts`
- Modify: `frontend/src/features/admin-branding/lib/brandingState.ts`
- Modify: `frontend/src/features/admin-branding/lib/previewBranding.ts`
- Test: `frontend/src/features/branding/lib/BrandingProvider.test.tsx`
- Test: `frontend/src/features/branding/api/publicBrandingClient.test.ts`
- Test: `frontend/src/features/admin-branding/api/adminBrandingClient.test.ts`

- [x] **Step 1: Add failing frontend contract tests**

  In public/admin branding client tests, update sample payloads and expected parsed values to include:

  ```ts
  appearance: {
    authBackgroundOverlay: 'dark',
    authButtonStyle: 'gradient',
    authColorScheme: 'dark',
    authFieldStyle: 'outline',
  },
  ```

  Expected before implementation: TypeScript/test failures because `appearance` is not typed.

- [x] **Step 2: Add failing CSS token tests**

  In `frontend/src/features/branding/lib/BrandingProvider.test.tsx`, create a branding object with:

  ```ts
  appearance: {
    authBackgroundOverlay: 'dark',
    authButtonStyle: 'gradient',
    authColorScheme: 'dark',
    authFieldStyle: 'outline',
  },
  colors: {
    ...defaultBrandingColors,
    accent: '#a9ef2a',
    authBackground: '#101820',
    authContentSurface: '#101820',
    authContentSurfaceOpacity: 40,
    authMutedText: '#cbd5e1',
    authText: '#ffffff',
    primary: '#a9ef2a',
  },
  ```

  Assert style variables on the provider root:

  ```ts
  expect(node).toHaveStyle({
    '--portal-auth-background-overlay': 'rgb(0 0 0 / 0.48)',
    '--portal-auth-button-background':
      'linear-gradient(135deg, #a9ef2a 0%, #a9ef2a 100%)',
    '--portal-auth-field-style': 'outline',
    '--portal-auth-scheme': 'dark',
  })
  ```

  If exact gradient interpolation is implemented with primary/accent mixing, update the expected string in the test to the deterministic implementation value in the same task.

- [x] **Step 3: Implement frontend types and defaults**

  Add:

  ```ts
  export type BrandingAppearance = {
    authBackgroundOverlay: 'none' | 'light' | 'dark'
    authButtonStyle: 'solid' | 'gradient'
    authColorScheme: 'light' | 'dark'
    authFieldStyle: 'solid' | 'translucent' | 'outline'
  }
  ```

  Add `appearance: BrandingAppearance` to `PublicBranding`, `AdminBrandingResponse['branding']`, `BrandingDraft` and `AdminBrandingPatch`.

  Remove `auth_header_image` and `auth_footer_image` from frontend `BrandingAssetKind` unions. Keep `auth_background_image` as the only auth artwork asset kind.

  Add to `frontend/src/features/branding/lib/brandingDefaults.ts`:

  ```ts
  export const defaultBrandingAppearance = {
    authBackgroundOverlay: 'none',
    authButtonStyle: 'solid',
    authColorScheme: 'light',
    authFieldStyle: 'solid',
  } as const
  ```

  Include `appearance: { ...defaultBrandingAppearance }` in `createDefaultPublicBranding()`.

- [x] **Step 4: Implement deterministic CSS variables**

  In `brandingCss.ts`, derive:

  ```ts
  '--portal-auth-scheme': branding.appearance.authColorScheme,
  '--portal-auth-field-style': branding.appearance.authFieldStyle,
  '--portal-auth-background-overlay': overlayCssValue,
  '--portal-auth-button-background': buttonBackgroundCssValue,
  '--portal-auth-button-text-color': buttonTextColor,
  '--portal-auth-link-color': accentColor,
  '--portal-auth-icon-color': accentColor,
  '--portal-auth-divider-color': dividerColor,
  ```

  Use fixed overlay values:

  ```ts
  const authOverlayByMode = {
    none: 'rgb(0 0 0 / 0)',
    light: 'rgb(255 255 255 / 0.58)',
    dark: 'rgb(0 0 0 / 0.48)',
  } as const
  ```

  Use deterministic button values:

  ```ts
  const buttonBackground =
    branding.appearance.authButtonStyle === 'gradient'
      ? `linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 100%)`
      : primaryColor
  ```

  Keep existing `--portal-auth-background-image` sourced from `auth_background_image`.

- [x] **Step 5: Run frontend targeted tests**

  Run:

  ```bash
  pnpm --dir frontend test -- src/features/branding/lib/BrandingProvider.test.tsx src/features/branding/api/publicBrandingClient.test.ts src/features/admin-branding/api/adminBrandingClient.test.ts
  ```

  Expected: PASS.

- [x] **Step 6: Commit frontend contract slice**

  Commit:

  ```bash
  git add frontend/src/features/branding/api/publicBrandingClient.ts frontend/src/features/admin-branding/api/adminBrandingClient.ts frontend/src/features/branding/lib/brandingDefaults.ts frontend/src/features/branding/lib/brandingCss.ts frontend/src/features/admin-branding/lib/brandingState.ts frontend/src/features/admin-branding/lib/previewBranding.ts frontend/src/features/branding/lib/BrandingProvider.test.tsx frontend/src/features/branding/api/publicBrandingClient.test.ts frontend/src/features/admin-branding/api/adminBrandingClient.test.ts
  git commit -m "feat: derive auth appearance css tokens"
  ```

## Task 3: Auth Shell Figma Layout Foundation

**Files:**

- Modify: `frontend/src/app/layouts/AuthFrame.tsx`
- Modify: `frontend/src/shared/ui/AuthShell.tsx`
- Modify: `frontend/src/shared/ui/PageIntro.tsx`
- Modify: `frontend/src/shared/ui/inputStyles.ts`
- Modify: `frontend/src/features/tenant/components/TenantAuthShell.tsx`
- Modify: `frontend/src/features/auth/components/LoginForm.tsx`
- Modify: `frontend/src/index.css`
- Test: `frontend/src/features/auth/pages/LoginPage.test.tsx`
- Test: `frontend/src/features/auth/pages/RequestPages.test.tsx`

This task must not run until Task 0 has user approval. Preserve the approved
default visual output from Task 0. The purpose here is to harden the shell
contract, remove temporary compatibility, and apply the approved baseline across
the remaining auth pages.

- [ ] **Step 1: Add failing shell/layout tests**

  In auth page tests, assert that rendered login markup has a single stacked auth shell matching the block structure from `docs/design/2026-06-16-provgroup-login-screen-figma-spec.md`:

  ```ts
  expect(container.querySelector('.auth-stack')).toBeInTheDocument()
  expect(container.querySelector('.auth-header-shell')).not.toBeInTheDocument()
  expect(
    container.querySelector('.auth-background-overlay'),
  ).toBeInTheDocument()
  expect(container.querySelector('.auth-intro')).toBeInTheDocument()
  expect(container.querySelector('.auth-form-slot')).toBeInTheDocument()
  expect(container.querySelector('.auth-secondary-links')).toBeInTheDocument()
  expect(container.querySelector('.auth-support-block')).toBeInTheDocument()
  ```

  Add a test that `/admin/login` also renders `.auth-stack`.

  Expected before implementation: FAIL because the current shell still renders `.auth-header-shell`.

- [ ] **Step 2: Refactor AuthFrame to stop owning the white auth surface**

  In `AuthFrame.tsx`, keep viewport locking and max mobile frame, but remove the inner hardcoded `bg-white` dependency:

  ```tsx
  <main className="auth-frame-background app-shell-viewport text-slate-900 antialiased">
    <div className="mx-auto flex h-full min-h-0 w-full justify-center">
      <div className="relative flex h-full min-h-0 w-full max-w-[500px] flex-col overflow-x-hidden overflow-y-auto overscroll-none">
        {children}
      </div>
    </div>
  </main>
  ```

- [ ] **Step 3: Refactor AuthShell into a single raised stack**

  In `AuthShell.tsx`, remove `footerImageUrl` and `headerImageUrl` from `AuthShellProps`; remove `imageBackgroundStyle`, `auth-header-shell`, `auth-header-art`, `auth-header-fade` and `auth-footer-art` rendering. The only auth artwork is the full-screen `auth_background_image` applied by CSS to `.auth-canvas-background`.

  Render the single raised content stack:

  ```tsx
  <section className="auth-canvas-background relative flex min-h-full w-full overflow-hidden">
    <div
      aria-hidden="true"
      className="auth-background-overlay absolute inset-0 z-0"
    />
    <div className="auth-stack relative z-10 mx-auto flex min-h-full w-full max-w-[390px] flex-col pb-[calc(4rem+env(safe-area-inset-bottom))]">
      <BrandMark
        className={cn(
          'auth-brand-mark auth-brand-mark--in-flow',
          brandPlacementClassMap[brandPlacement],
        )}
        logoUrl={brandLogoUrl}
        monogram={brandMonogram}
        name={brandName}
      />
      <div className="auth-intro text-center">
        <PageIntro description={description} title={title} />
      </div>
      <div className="auth-form-slot flex flex-1 flex-col">{children}</div>
    </div>
  </section>
  ```

  Adjust the exact class names during implementation if tests assert the final names consistently.

  In `TenantAuthShell.tsx`, remove passing `branding.assets.auth_header_image` and `branding.assets.auth_footer_image` to `AuthShell`.

- [ ] **Step 4: Update CSS for full-background auth**

  In `frontend/src/index.css`, make these responsibilities explicit:

  ```css
  .auth-frame-background {
    background: var(--portal-auth-frame-background-color, #e2e8f0);
    font-family:
      Inter,
      ui-sans-serif,
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      'Segoe UI',
      sans-serif;
  }

  .auth-canvas-background {
    background-color: var(--portal-auth-canvas-background-color, #f3f7fc);
    background-image: var(--portal-auth-background-image, none);
    background-position: center;
    background-repeat: no-repeat;
    background-size: cover;
    color: var(--portal-auth-text-color, #0f172a);
  }

  .auth-background-overlay {
    background: var(--portal-auth-background-overlay, rgb(0 0 0 / 0));
    pointer-events: none;
  }
  ```

  Keep `.portal-frame-background` independent from `--portal-auth-background-image`.

- [ ] **Step 5: Tune the baseline mobile stack to the Figma spec**

  Use `docs/design/2026-06-16-provgroup-login-screen-figma-spec.md` as the source for the default `390px` mobile frame. Do not carry over the old large auth header layout or viewport-scaled title typography.

  Start with these CSS anchors:

  ```css
  .auth-stack {
    min-height: 100%;
    padding-left: var(--auth-stack-inline, 44px);
    padding-right: var(--auth-stack-inline, 44px);
    padding-top: var(--auth-stack-top, 51px);
  }

  .auth-brand-mark--in-flow {
    height: 63px;
    width: 63px;
  }

  .auth-intro {
    margin-top: 44px;
  }

  .auth-form-slot {
    margin-top: 43px;
  }
  ```

  The target default login rhythm is:
  - logo tile top: about `51px`;
  - logo tile size: `63px`;
  - logo bottom to title top: about `45px`;
  - title size: `22px`, weight `700`, centered;
  - subtitle: `14px / 20px`, centered;
  - subtitle bottom to first input top: about `43px`;
  - fields: `300px x 50px`, radius `10px`;
  - field gap: `22px`;
  - legal text width: `300px`, size `12px / 16px`;
  - button: `300px x 47px`, radius `9px`;
  - secondary links and support divider/headset/phone arranged as in the spec.

  Keep responsive safeguards:

  ```css
  @media (max-width: 359px) {
    .auth-stack {
      --auth-stack-inline: 24px;
    }
  }

  @media (max-height: 760px) {
    .auth-stack {
      --auth-stack-top: 32px;
    }
  }

  @media (min-width: 430px) and (min-height: 900px) {
    .auth-stack {
      --auth-stack-top: 70px;
      --auth-stack-inline: 70px;
    }
  }
  ```

  On the larger `440px x 956px` target, keep the same `63px` logo, fixed
  typography, `50px` fields and `47px` button. Center the `300px` column and use
  the additional height as top/bottom breathing room, matching the larger-mobile
  section in `docs/design/2026-06-16-provgroup-login-screen-figma-spec.md`.

- [ ] **Step 6: Update PageIntro and auth inputs to tokenized values**

  In `PageIntro.tsx`, use auth-specific classes instead of viewport-scaled title sizing:

  ```tsx
  <h1 className="auth-title text-[22px] font-bold leading-tight">
    {title}
  </h1>
  <p className="auth-subtitle mx-auto mt-7 max-w-[300px] text-[14px] leading-5">
    {description}
  </p>
  ```

  In `inputStyles.ts`, keep touch targets safe while matching the new baseline:

  ```ts
  export const authFieldClassName =
    'h-[50px] rounded-[10px] bg-[color:var(--portal-auth-control-background,rgb(255_255_255_/_0.86))] text-[15px] placeholder:text-[color:var(--portal-auth-muted-text-color,#64748b)]'
  ```

  Make `inputClassName()` use the same `h-[50px]`, `rounded-[10px]`, tokenized border and focus variables.

- [ ] **Step 7: Run targeted auth tests**

  Run:

  ```bash
  pnpm --dir frontend test -- src/features/auth/pages/LoginPage.test.tsx src/features/auth/pages/RequestPages.test.tsx
  ```

  Expected: PASS.

- [ ] **Step 8: Commit auth shell foundation**

  Commit:

  ```bash
  git add frontend/src/app/layouts/AuthFrame.tsx frontend/src/shared/ui/AuthShell.tsx frontend/src/shared/ui/PageIntro.tsx frontend/src/shared/ui/inputStyles.ts frontend/src/features/tenant/components/TenantAuthShell.tsx frontend/src/features/auth/components/LoginForm.tsx frontend/src/index.css frontend/src/features/auth/pages/LoginPage.test.tsx frontend/src/features/auth/pages/RequestPages.test.tsx
  git commit -m "feat: use full background auth layout"
  ```

## Task 4: Admin Branding UI For Full Background

**Files:**

- Modify: `frontend/src/features/admin-branding/components/AdminBrandingForm.tsx`
- Modify: `frontend/src/features/admin-branding/components/BrandingAssetControls.tsx`
- Create: `frontend/src/features/admin-branding/components/AuthAppearanceControls.tsx`
- Test: `frontend/src/features/admin-shell/pages/AdminBrandingPage.test.tsx`

- [ ] **Step 1: Add failing admin UI tests**

  In `AdminBrandingPage.test.tsx`, assert:

  ```ts
  expect(
    screen.getByRole('group', { name: /Оформление входа/i }),
  ).toBeInTheDocument()
  expect(screen.getByLabelText(/Цветовая схема/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/Защита фона/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/Стиль полей/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/Стиль кнопки/i)).toBeInTheDocument()
  expect(screen.getByText('Вход: общий фон')).toBeInTheDocument()
  ```

  Assert that changing controls calls save with:

  ```ts
  appearance: expect.objectContaining({
    authBackgroundOverlay: 'dark',
    authButtonStyle: 'gradient',
    authColorScheme: 'dark',
    authFieldStyle: 'outline',
  })
  ```

  Expected before implementation: FAIL because controls and patch fields do not exist.

- [ ] **Step 2: Create AuthAppearanceControls**

  Implement `frontend/src/features/admin-branding/components/AuthAppearanceControls.tsx` with four segmented controls:

  ```ts
  const colorSchemeOptions = [
    { label: 'Светлая', value: 'light' },
    { label: 'Темная', value: 'dark' },
  ] as const

  const overlayOptions = [
    { label: 'Без защиты', value: 'none' },
    { label: 'Светлая дымка', value: 'light' },
    { label: 'Темная дымка', value: 'dark' },
  ] as const

  const fieldStyleOptions = [
    { label: 'Светлые', value: 'solid' },
    { label: 'Полупрозрачные', value: 'translucent' },
    { label: 'Контур', value: 'outline' },
  ] as const

  const buttonStyleOptions = [
    { label: 'Сплошная', value: 'solid' },
    { label: 'Градиент', value: 'gradient' },
  ] as const
  ```

  Use radio inputs with visible labels and a shared segmented-control helper so keyboard navigation and labels remain native.

- [ ] **Step 3: Wire appearance draft state**

  In `AdminBrandingForm.tsx`, add:

  ```ts
  function updateAppearance<Key extends keyof BrandingAppearance>(
    key: Key,
    value: BrandingAppearance[Key],
  ) {
    onChange({
      ...draft,
      appearance: {
        ...draft.appearance,
        [key]: value,
      },
    })
  }
  ```

  Render `AuthAppearanceControls` in the `Экран входа` section before copy fields.

- [ ] **Step 4: Reorganize asset controls around Full Background**

  In `BrandingAssetControls.tsx`, remove old auth top/bottom upload slots and show only one auth artwork slot:
  - auth slot: `auth_background_image` titled `Вход: общий фон`;
  - no `auth_header_image` slot;
  - no `auth_footer_image` slot;
  - no `auth_middle_image` slot.

  Add short helper copy for `auth_background_image`:

  ```text
  Основной способ оформления входа: подготовьте один фон под мобильный экран, оставив чистую центральную область под форму.
  ```

- [ ] **Step 5: Run targeted admin UI tests**

  Run:

  ```bash
  pnpm --dir frontend test -- src/features/admin-shell/pages/AdminBrandingPage.test.tsx
  ```

  Expected: PASS.

- [ ] **Step 6: Commit admin UI slice**

  Commit:

  ```bash
  git add frontend/src/features/admin-branding/components/AdminBrandingForm.tsx frontend/src/features/admin-branding/components/BrandingAssetControls.tsx frontend/src/features/admin-branding/components/AuthAppearanceControls.tsx frontend/src/features/admin-shell/pages/AdminBrandingPage.test.tsx
  git commit -m "feat: add auth full background branding controls"
  ```

## Task 5: Shared Login Support And Preview Parity

**Files:**

- Modify: `frontend/src/features/auth/components/AuthSupportBlock.tsx`
- Modify: `frontend/src/features/auth/components/AuthSecondaryLinks.tsx`
- Modify: `frontend/src/features/auth/pages/LoginPage.tsx`
- Modify: `frontend/src/features/admin-branding/components/portal-preview/AuthLoginPreview.tsx`
- Test: `frontend/src/features/auth/pages/LoginPage.test.tsx`
- Test: `frontend/src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx`

- [ ] **Step 1: Add failing support block tests**

  In `LoginPage.test.tsx`, assert the default support phone:

  ```ts
  expect(
    screen.getByRole('link', { name: '+7 (800) 000-00-00' }),
  ).toHaveAttribute('href', 'tel:+78000000000')
  ```

  In preview tests, assert the same visible support phone and the support divider/headset area:

  ```ts
  expect(screen.getByText('Нет доступа к чату?')).toBeInTheDocument()
  expect(screen.getByText('+7 (800) 000-00-00')).toBeInTheDocument()
  ```

  Expected before implementation: FAIL because runtime and preview still show `+7 (906) 12-955-12`.

- [ ] **Step 2: Extend the approved secondary links component for preview**

  Update the `AuthSecondaryLinks.tsx` created in Task 0 so it supports runtime
  links and non-interactive preview rendering:

  ```tsx
  import { Link } from 'react-router-dom'

  import { routePaths } from '../../../app/routePaths'
  import { authSecondaryLinkClassName } from '../../../shared/ui/inputStyles'

  export function AuthSecondaryLinks({
    preview = false,
  }: {
    preview?: boolean
  }) {
    const content = (
      <>
        <span className={authSecondaryLinkClassName}>Забыли пароль?</span>
        <span aria-hidden="true" className="auth-link-separator" />
        <span className={`${authSecondaryLinkClassName} text-right`}>
          Создать аккаунт
        </span>
      </>
    )

    if (preview) {
      return <div className="auth-secondary-links">{content}</div>
    }

    return (
      <div className="auth-secondary-links">
        <Link
          className={authSecondaryLinkClassName}
          to={routePaths.auth.passwordResetRequest}
        >
          Забыли пароль?
        </Link>
        <span aria-hidden="true" className="auth-link-separator" />
        <Link
          className={`${authSecondaryLinkClassName} text-right`}
          to={routePaths.auth.register}
        >
          Создать аккаунт
        </Link>
      </div>
    )
  }
  ```

  During implementation, avoid duplicating interactive links inside preview mode.

- [ ] **Step 3: Extend the approved support block for preview**

  Update the `AuthSupportBlock.tsx` created in Task 0 so it supports runtime
  phone links and non-interactive preview rendering:

  ```tsx
  import { HeadphonesIcon, PhoneIcon } from '../../../shared/ui/icons'

  const defaultSupportPhone = '+7 (800) 000-00-00'
  const defaultSupportPhoneHref = 'tel:+78000000000'

  export function AuthSupportBlock({ preview = false }: { preview?: boolean }) {
    return (
      <aside className="auth-support-block">
        <div aria-hidden="true" className="auth-support-divider">
          <span />
          <HeadphonesIcon className="auth-support-headset" />
          <span />
        </div>
        <p className="auth-support-question">Нет доступа к чату?</p>
        {preview ? (
          <p className="auth-support-phone">
            <PhoneIcon className="auth-support-phone-icon" />
            <span>{defaultSupportPhone}</span>
          </p>
        ) : (
          <a className="auth-support-phone" href={defaultSupportPhoneHref}>
            <PhoneIcon className="auth-support-phone-icon" />
            <span>{defaultSupportPhone}</span>
          </a>
        )}
      </aside>
    )
  }
  ```

  If `HeadphonesIcon` does not exist, add it to the local icon module using the same style as existing icons.

- [ ] **Step 4: Use shared components in runtime and preview**

  In `LoginPage.tsx`, replace the duplicated links/support markup with:

  ```tsx
  <AuthSecondaryLinks />
  <AuthSupportBlock />
  ```

  In `AuthLoginPreview.tsx`, replace preview duplicates with:

  ```tsx
  <AuthSecondaryLinks preview />
  <AuthSupportBlock preview />
  ```

- [ ] **Step 5: Add CSS for support block and secondary links**

  In `index.css`, add tokenized classes:

  ```css
  .auth-secondary-links {
    align-items: center;
    color: var(--portal-auth-link-color, #003a78);
    display: grid;
    gap: 16px;
    grid-template-columns: 1fr auto 1fr;
    margin-top: 28px;
  }

  .auth-link-separator {
    background: var(--portal-auth-divider-color, rgb(174 180 192 / 0.9));
    height: 19px;
    width: 1px;
  }

  .auth-support-block {
    color: var(--portal-auth-link-color, #003a78);
    margin-top: auto;
    padding-top: 36px;
    text-align: center;
  }

  .auth-support-divider {
    align-items: center;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 30px minmax(0, 1fr);
    gap: 34px;
  }

  .auth-support-divider span {
    background: var(--portal-auth-divider-color, rgb(199 205 214 / 0.9));
    height: 1px;
  }

  .auth-support-question {
    font-size: 14px;
    margin-top: 48px;
  }

  .auth-support-phone {
    align-items: center;
    color: var(--portal-auth-link-color, #003a78);
    display: inline-flex;
    font-size: 14px;
    font-weight: 600;
    gap: 9px;
    margin-top: 14px;
    text-decoration: none;
  }
  ```

- [ ] **Step 6: Run targeted preview/runtime tests**

  Run:

  ```bash
  pnpm --dir frontend test -- src/features/auth/pages/LoginPage.test.tsx src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx
  ```

  Expected: PASS.

- [ ] **Step 7: Commit shared login slice**

  Commit:

  ```bash
  git add frontend/src/features/auth/components/AuthSupportBlock.tsx frontend/src/features/auth/components/AuthSecondaryLinks.tsx frontend/src/features/auth/pages/LoginPage.tsx frontend/src/features/admin-branding/components/portal-preview/AuthLoginPreview.tsx frontend/src/features/auth/pages/LoginPage.test.tsx frontend/src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx frontend/src/index.css
  git commit -m "feat: share auth login support layout"
  ```

## Task 6: Auth Legal Text, Legal Pages And Registration Consent

**Files:**

- Modify: `frontend/src/app/routePaths.ts`
- Modify: `frontend/src/app/AppRoutes.tsx`
- Modify: `frontend/src/features/legal/pages/LegalDocumentPage.tsx`
- Modify: `frontend/src/features/legal/legalDocuments.ts`
- Modify: `frontend/src/features/auth/components/AuthLegalNotice.tsx`
- Create: `frontend/src/features/auth/components/RegistrationLegalConsent.tsx`
- Modify: `frontend/src/features/auth/pages/LoginPage.tsx`
- Modify: `frontend/src/features/auth/components/RegisterRequestForm.tsx`
- Modify: `frontend/src/features/auth/api/authClient.ts`
- Modify: `frontend/src/features/auth/types.ts`
- Modify: `frontend/src/features/auth/lib/registerRequestValidation.ts`
- Modify: `backend/src/db/schema.ts`
- Generate: `backend/drizzle/00xx_*.sql`
- Generate: `backend/drizzle/meta/00xx_snapshot.json`
- Modify: `backend/drizzle/meta/_journal.json`
- Modify: `backend/src/modules/registration/routes.ts`
- Create: `backend/src/modules/registration/legalDocuments.ts`
- Modify: `backend/src/modules/registration/repository.ts`
- Modify: `backend/src/modules/registration/service.ts`
- Test: `frontend/src/app/AppRoutes.legal.test.tsx`
- Test: `frontend/src/features/auth/pages/LoginPage.test.tsx`
- Test: `frontend/src/features/auth/pages/RequestPages.test.tsx`
- Test: `backend/src/modules/registration/service.test.ts`
- Test: `backend/src/app.test.ts`

- [ ] **Step 1: Add failing frontend tests for legal links and registration consent**

  In `LoginPage.test.tsx`, assert the login legal text is informational and has real links:

  ```ts
  expect(
    screen.getByText(/Используя сервис, вы принимаете/i),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('link', { name: 'Пользовательское соглашение' }),
  ).toHaveAttribute('href', '/legal/terms')
  expect(
    screen.getByRole('link', {
      name: 'Политикой обработки персональных данных',
    }),
  ).toHaveAttribute('href', '/legal/privacy')
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  ```

  In `RequestPages.test.tsx`, extend the registration request test:

  ```ts
  const submit = screen.getByRole('button', { name: 'Продолжить' })
  expect(submit).toBeDisabled()

  await user.click(
    screen.getByRole('checkbox', {
      name: /Я принимаю Пользовательское соглашение/i,
    }),
  )
  expect(submit).toBeDisabled()

  await user.click(
    screen.getByRole('checkbox', {
      name: /Я даю согласие на обработку персональных данных/i,
    }),
  )
  expect(submit).not.toBeDisabled()
  ```

  Assert submitted body includes:

  ```ts
  expect(getJsonBodyForCall('/api/auth/register/request')).toEqual({
    email: 'name@company.ru',
    fullName: 'Portal User',
    personalDataConsentAccepted: true,
    termsAccepted: true,
  })
  ```

  Expected before implementation: FAIL because registration checkboxes and
  request consent fields are missing. Legal links should already pass if Task 0
  was approved.

- [ ] **Step 2: Add failing backend tests for required consent**

  In `backend/src/app.test.ts`, add a registration request case without legal flags:

  ```ts
  const response = await app.inject({
    method: 'POST',
    payload: {
      email: 'name@company.ru',
      fullName: 'Portal User',
    },
    url: '/api/auth/register/request',
  })

  expect(response.statusCode).toBe(400)
  expect(response.json()).toEqual(
    expect.objectContaining({
      error: expect.objectContaining({
        code: 'VALIDATION_ERROR',
      }),
    }),
  )
  ```

  Add another `backend/src/app.test.ts` case proving client-controlled legal
  versions are rejected:

  ```ts
  const response = await app.inject({
    method: 'POST',
    payload: {
      email: 'name@company.ru',
      fullName: 'Portal User',
      personalDataConsentAccepted: true,
      privacyPolicyVersion: 'attacker-controlled-version',
      termsAccepted: true,
      termsVersion: 'attacker-controlled-version',
    },
    url: '/api/auth/register/request',
  })

  expect(response.statusCode).toBe(400)
  ```

  In `backend/src/modules/registration/service.test.ts`, assert a successful
  registration request creates a legal acceptance record with tenant,
  normalized email, backend-owned document versions and request metadata. Add a
  resend-locked `existing_pending` test that also records a new legal
  acceptance because the accepted request was made after the user checked both
  legal controls. Add a successful `setPassword()` test that asserts the latest
  legal acceptance for the tenant and normalized email has `portalUserId` equal
  to the newly created portal user ID.

- [ ] **Step 3: Verify public legal routes from Task 0**

  Task 0 creates the first frontend-only `/legal/terms` and `/legal/privacy`
  routes. In this task, verify that `routePaths.ts` still contains:

  ```ts
  legal: {
    privacy: '/legal/privacy',
    terms: '/legal/terms',
  },
  ```

  In `AppRoutes.tsx`, verify that the lazy page remains next to the existing
  page declarations:

  ```tsx
  const LegalDocumentPage = lazyRouteComponent(() =>
    import('../features/legal/pages/LegalDocumentPage').then(
      (module) => module.LegalDocumentPage,
    ),
  )
  ```

  Keep routes at the top `Routes` level, outside `CustomerAuthBoundary` and
  outside `PublicAuthRoute`, so authenticated users can open them:

  ```tsx
  <Route
    path={routePaths.legal.terms}
    element={
      <LazyRoute>
        <LegalDocumentPage document="terms" />
      </LazyRoute>
    }
  />
  <Route
    path={routePaths.legal.privacy}
    element={
      <LazyRoute>
        <LegalDocumentPage document="privacy" />
      </LazyRoute>
    }
  />
  ```

  Keep `AuthFrame` inside `LegalDocumentPage`; do not wrap these pages in
  `PublicAuthRoute`.

  Add `frontend/src/app/AppRoutes.legal.test.tsx`:

  ```tsx
  import { screen } from '@testing-library/react'
  import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

  import { AppRoutes } from './AppRoutes'
  import { renderWithRouter } from '../test/renderWithRouter'

  function createJsonResponse(body: unknown, status: number) {
    return new Response(JSON.stringify(body), {
      headers: { 'Content-Type': 'application/json' },
      status,
    })
  }

  describe('legal routes', () => {
    const fetchMock = vi.fn<typeof fetch>()

    beforeEach(() => {
      vi.stubGlobal('fetch', fetchMock)
    })

    afterEach(() => {
      vi.unstubAllGlobals()
      fetchMock.mockReset()
    })

    it.each([
      ['/legal/terms', 'Пользовательское соглашение'],
      ['/legal/privacy', 'Политика обработки персональных данных'],
    ])('renders %s without an authenticated session', async (path, heading) => {
      renderWithRouter(<AppRoutes />, { initialEntries: [path] })

      expect(
        await screen.findByRole('heading', { name: heading }),
      ).toBeInTheDocument()
      expect(fetchMock).not.toHaveBeenCalledWith(
        '/api/auth/me',
        expect.anything(),
      )
    })

    it('keeps legal pages reachable when a customer session exists', async () => {
      fetchMock.mockResolvedValue(
        createJsonResponse(
          {
            tenant: { id: 'tenant-demo', name: 'Demo' },
            user: { email: 'user@example.com', id: 'user-demo', name: 'User' },
          },
          200,
        ),
      )

      renderWithRouter(<AppRoutes />, {
        initialEntries: ['/legal/privacy'],
      })

      expect(
        await screen.findByRole('heading', {
          name: 'Политика обработки персональных данных',
        }),
      ).toBeInTheDocument()
      expect(screen.queryByText('Чат поддержки')).not.toBeInTheDocument()
    })
  })
  ```

- [ ] **Step 4: Expand static legal document source**

  Replace the short Task 0 preview copy in
  `frontend/src/features/legal/legalDocuments.ts` with the fuller first-run
  test product copy:

  ```ts
  export type LegalDocumentId = 'privacy' | 'terms'

  export const legalDocumentVersion = '2026-06-16'

  export const legalDocuments = {
    privacy: {
      title: 'Политика обработки персональных данных',
      version: legalDocumentVersion,
      body: [
        'Этот текст является шаблоном для тестового продукта и должен быть заменен утвержденной редакцией оператора перед production.',
        'Оператор определяет цели, состав, сроки и способы обработки персональных данных пользователей портала.',
        'Пользователь вправе получить сведения об обработке персональных данных и направить запрос оператору.',
      ],
    },
    terms: {
      title: 'Пользовательское соглашение',
      version: legalDocumentVersion,
      body: [
        'Этот текст является шаблоном для тестового продукта и должен быть заменен утвержденной редакцией оператора перед production.',
        'Соглашение определяет правила доступа к клиентскому порталу и использования чата поддержки.',
        'Пользователь обязуется указывать достоверные данные и соблюдать правила использования сервиса.',
      ],
    },
  } as const satisfies Record<
    LegalDocumentId,
    {
      body: string[]
      title: string
      version: string
    }
  >
  ```

  Keep `frontend/src/features/legal/pages/LegalDocumentPage.tsx` as the
  document renderer:

  ```tsx
  import { Link } from 'react-router-dom'

  import { routePaths } from '../../../app/routePaths'
  import { AuthFrame } from '../../../app/layouts/AuthFrame'
  import { legalDocuments, type LegalDocumentId } from '../legalDocuments'

  export function LegalDocumentPage({
    document,
  }: {
    document: LegalDocumentId
  }) {
    const content = legalDocuments[document]

    return (
      <AuthFrame>
        <article className="mx-auto flex min-h-full w-full max-w-[390px] flex-col px-7 py-10 text-slate-900">
          <Link
            className="mb-8 text-sm font-medium text-[#00438d]"
            to={routePaths.auth.login}
          >
            Вернуться ко входу
          </Link>
          <h1 className="text-2xl font-semibold leading-tight text-[#15486b]">
            {content.title}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Версия документа: {content.version}
          </p>
          <div className="mt-8 space-y-4 text-base leading-7 text-slate-700">
            {content.body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </article>
      </AuthFrame>
    )
  }
  ```

  These strings are the exact first-run test product copy. The production
  release gate is replacing them with operator-approved legal documents. The
  frontend `legalDocumentVersion` is display-only and must not be submitted to
  the registration API; backend audit versions come from
  `backend/src/modules/registration/legalDocuments.ts`.

- [ ] **Step 5: Verify legal notice and create registration consent component**

  Verify `AuthLegalNotice.tsx` keeps the login informational copy:

  ```tsx
  import { Link } from 'react-router-dom'

  import { routePaths } from '../../../app/routePaths'

  export function AuthLegalNotice() {
    return (
      <p className="auth-legal-text">
        Используя сервис, вы принимаете{' '}
        <Link to={routePaths.legal.terms}>Пользовательское соглашение</Link> и
        подтверждаете ознакомление с{' '}
        <Link to={routePaths.legal.privacy}>
          Политикой обработки персональных данных
        </Link>
        .
      </p>
    )
  }
  ```

  Create `RegistrationLegalConsent.tsx` with two native checkboxes and links:

  ```tsx
  import { Link } from 'react-router-dom'

  import { routePaths } from '../../../app/routePaths'

  type RegistrationLegalConsentValue = {
    personalDataConsentAccepted: boolean
    termsAccepted: boolean
  }

  export function RegistrationLegalConsent({
    disabled,
    onChange,
    value,
  }: {
    disabled: boolean
    onChange: (value: RegistrationLegalConsentValue) => void
    value: RegistrationLegalConsentValue
  }) {
    return (
      <fieldset className="auth-legal-consent">
        <label>
          <input
            checked={value.termsAccepted}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...value, termsAccepted: event.currentTarget.checked })
            }
            type="checkbox"
          />
          <span>
            Я принимаю{' '}
            <Link to={routePaths.legal.terms}>Пользовательское соглашение</Link>
          </span>
        </label>
        <label>
          <input
            checked={value.personalDataConsentAccepted}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...value,
                personalDataConsentAccepted: event.currentTarget.checked,
              })
            }
            type="checkbox"
          />
          <span>
            Я даю согласие на обработку персональных данных и подтверждаю, что
            ознакомлен с{' '}
            <Link to={routePaths.legal.privacy}>
              Политикой обработки персональных данных
            </Link>
          </span>
        </label>
      </fieldset>
    )
  }
  ```

- [ ] **Step 6: Wire legal UX into login and registration**

  In `LoginPage.tsx`, render `<AuthLegalNotice />` in the Figma legal text position before the submit button.

  In `RegisterRequestForm.tsx`:
  - extend form values with `termsAccepted` and `personalDataConsentAccepted`;
  - render `<RegistrationLegalConsent />` before `<PrimaryButton />`;
  - disable submit while either checkbox is false;
  - include legal consent booleans in `requestRegistrationVerification()`.

  The submit disabled condition must be:

  ```ts
  const hasAcceptedLegal =
    values.termsAccepted && values.personalDataConsentAccepted
  const isSubmitDisabled = isSubmitting || !hasAcceptedLegal
  ```

  Submit payload must include:

  ```ts
  {
    email: values.email,
    fullName: values.fullName,
    personalDataConsentAccepted: values.personalDataConsentAccepted,
    termsAccepted: values.termsAccepted,
  }
  ```

  Do not include `termsVersion` or `privacyPolicyVersion` in the request body.
  Those audit values are backend-owned.

  Do not show legal checkbox on login.

- [ ] **Step 7: Add backend legal acceptance persistence**

  In `backend/src/db/schema.ts`, add `boolean` to the Drizzle pg-core imports
  if it is not already imported, then add a table:

  ```ts
  export const portalLegalAcceptances = pgTable(
    'portal_legal_acceptances',
    {
      id: serial('id').primaryKey(),
      tenantId: integer('tenant_id')
        .notNull()
        .references(() => portalTenants.id, { onDelete: 'restrict' }),
      portalUserId: integer('portal_user_id').references(() => portalUsers.id, {
        onDelete: 'set null',
      }),
      email: text('email').notNull(),
      purpose: text('purpose').notNull(),
      termsAccepted: boolean('terms_accepted').notNull(),
      personalDataConsentAccepted: boolean(
        'personal_data_consent_accepted',
      ).notNull(),
      termsVersion: text('terms_version').notNull(),
      privacyPolicyVersion: text('privacy_policy_version').notNull(),
      acceptedAt: timestamp('accepted_at', timestampWithTimezone)
        .notNull()
        .defaultNow(),
      requestIp: text('request_ip'),
      userAgent: text('user_agent'),
      createdAt: timestamp('created_at', timestampWithTimezone)
        .notNull()
        .defaultNow(),
    },
    (table) => [
      index('portal_legal_acceptances_tenant_email_idx').on(
        table.tenantId,
        table.email,
      ),
      index('portal_legal_acceptances_tenant_user_idx').on(
        table.tenantId,
        table.portalUserId,
      ),
      check(
        'portal_legal_acceptances_purpose_check',
        sql`${table.purpose} in ('registration')`,
      ),
      check(
        'portal_legal_acceptances_terms_accepted_check',
        sql`${table.termsAccepted} = true`,
      ),
      check(
        'portal_legal_acceptances_personal_data_consent_check',
        sql`${table.personalDataConsentAccepted} = true`,
      ),
    ],
  )
  ```

  Generate a migration after adding the table.

- [ ] **Step 8: Enforce consent in registration API**

  Create `backend/src/modules/registration/legalDocuments.ts`:

  ```ts
  export const registrationLegalDocumentVersions = {
    privacyPolicyVersion: '2026-06-16',
    termsVersion: '2026-06-16',
  } as const
  ```

  In `backend/src/modules/registration/routes.ts`, make
  `registerRequestBodySchema` strict and extend it with consent booleans only:

  ```ts
  const registerRequestBodySchema = z.strictObject({
    email: z
      .string()
      .trim()
      .min(1, 'Введите email')
      .email('Проверьте формат email'),
    fullName: z.string().trim().min(1, 'Введите имя'),
    personalDataConsentAccepted: z.literal(true),
    termsAccepted: z.literal(true),
  })
  ```

  Do not add `termsVersion` or `privacyPolicyVersion` to the request schema.
  Strict parsing must reject any client attempt to send those fields.

  Pass the consent flags plus request IP and user agent into
  `requestVerification()`:

  ```ts
  return createRegistrationService(request).requestVerification({
    email: body.email,
    fullName: body.fullName,
    legalAcceptance: {
      personalDataConsentAccepted: body.personalDataConsentAccepted,
      requestIp: request.ip,
      termsAccepted: body.termsAccepted,
      userAgent: request.headers['user-agent'] ?? null,
    },
  })
  ```

  The service must persist versions from backend constants:

  ```ts
  import { registrationLegalDocumentVersions } from './legalDocuments.js'

  const legalAcceptanceRecord = {
    email: normalizedEmail,
    personalDataConsentAccepted:
      input.legalAcceptance.personalDataConsentAccepted,
    privacyPolicyVersion:
      registrationLegalDocumentVersions.privacyPolicyVersion,
    purpose: 'registration',
    requestIp: input.legalAcceptance.requestIp,
    tenantId,
    termsAccepted: input.legalAcceptance.termsAccepted,
    termsVersion: registrationLegalDocumentVersions.termsVersion,
    userAgent: input.legalAcceptance.userAgent,
  }
  ```

  Add repository methods:

  ```ts
  createLegalAcceptance(input, executor?)
  linkLatestRegistrationAcceptanceToUser({ email, portalUserId }, executor?)
  ```

  In registration repository/service:
  - insert `portal_legal_acceptances` for every accepted registration request,
    including the `existing_pending` resend-locked response path;
  - use backend-owned `registrationLegalDocumentVersions`, never client-supplied
    versions;
  - link the latest registration acceptance to the created portal user during
    `setPassword()` in the same completion transaction when possible;
  - record request metadata from `request.ip` and
    `request.headers['user-agent']`;
  - do not send verification code if required consent flags are absent.

  Do not use the older client-owned version pattern:

  ```ts
  privacyPolicyVersion: z.string().trim().min(1),
  termsVersion: z.string().trim().min(1),
  ```

- [ ] **Step 9: Run targeted legal/registration tests**

  Run:

  ```bash
  pnpm --dir frontend test -- src/app/AppRoutes.legal.test.tsx src/features/auth/pages/LoginPage.test.tsx src/features/auth/pages/RequestPages.test.tsx
  pnpm --dir backend test -- src/modules/registration/service.test.ts
  pnpm --dir backend test -- src/app.test.ts
  ```

  Expected: PASS.

- [ ] **Step 10: Commit legal consent slice**

  Commit:

  ```bash
  git add frontend/src/app/routePaths.ts frontend/src/app/AppRoutes.tsx frontend/src/app/AppRoutes.legal.test.tsx frontend/src/features/legal frontend/src/features/auth/components/AuthLegalNotice.tsx frontend/src/features/auth/components/RegistrationLegalConsent.tsx frontend/src/features/auth/pages/LoginPage.tsx frontend/src/features/auth/components/RegisterRequestForm.tsx frontend/src/features/auth/api/authClient.ts frontend/src/features/auth/types.ts frontend/src/features/auth/lib/registerRequestValidation.ts backend/src/db/schema.ts backend/drizzle backend/src/modules/registration/routes.ts backend/src/modules/registration/legalDocuments.ts backend/src/modules/registration/repository.ts backend/src/modules/registration/service.ts frontend/src/features/auth/pages/LoginPage.test.tsx frontend/src/features/auth/pages/RequestPages.test.tsx backend/src/modules/registration/service.test.ts backend/src/app.test.ts
  git commit -m "feat: add auth legal consent flow"
  ```

## Task 7: Browser Validation, Review And Closure

**Files:**

- Modify: `tests/e2e/admin-branding-settings.spec.ts`
- Modify: `tests/e2e/admin-branding-real-preview.spec.ts`
- Modify: `tests/e2e/customer-branding-runtime.spec.ts`
- Modify: `docs/roadmap/work-log.md`

- [ ] **Step 1: Add browser coverage for full background admin settings**

  In `tests/e2e/admin-branding-settings.spec.ts`, cover:
  - upload/preview of `auth_background_image`;
  - changing `authColorScheme` to `dark`;
  - changing `authBackgroundOverlay` to `dark`;
  - changing `authFieldStyle` to `outline`;
  - changing `authButtonStyle` to `gradient`;
  - saving and reloading the admin branding page.

  Assert the saved controls still show the selected values after reload.

- [ ] **Step 2: Add browser coverage for real preview parity**

  In `tests/e2e/admin-branding-real-preview.spec.ts`, assert the real preview receives:

  ```ts
  await expect(previewFrame.locator('.auth-canvas-background')).toHaveCSS(
    'background-image',
    /url/,
  )
  await expect(previewFrame.locator('.auth-background-overlay')).toBeVisible()
  await expect(previewFrame.getByText('+7 (800) 000-00-00')).toBeVisible()
  ```

- [ ] **Step 3: Add runtime negative checks**

  In `tests/e2e/customer-branding-runtime.spec.ts`, assert:
  - `.portal-frame-background` does not use `auth_background_image`;
  - the old support card class does not render on `/auth/login`;
  - `.auth-header-shell` does not render on `/auth/login`;
  - dark overlay does not block field focus or submit.

- [ ] **Step 4: Add Figma layout geometry smoke**

  In `tests/e2e/customer-branding-runtime.spec.ts`, add focused desktop-browser mobile viewport smokes for the Figma baseline and the larger-mobile target.

  First check the `390px x 844px` Figma baseline:

  ```ts
  await page.setViewportSize({ height: 844, width: 390 })
  await page.goto('/auth/login')

  const logo = page.locator('.auth-brand-mark--in-flow')
  const email = page.getByLabel('Email')
  const password = page.getByLabel('Пароль')
  const submit = page.getByRole('button', { name: 'Войти' })

  await expect(logo).toHaveCSS('width', '63px')
  await expect(logo).toHaveCSS('height', '63px')
  await expect(email).toHaveCSS('height', '50px')
  await expect(password).toHaveCSS('height', '50px')
  await expect(submit).toHaveCSS('height', '47px')
  await expect(page.locator('.auth-support-block')).toBeVisible()
  await expect(page.getByText('+7 (800) 000-00-00')).toBeVisible()
  ```

  Also compare bounding boxes with tolerant assertions so the default layout stays close to `docs/design/2026-06-16-provgroup-login-screen-figma-spec.md`:

  ```ts
  const logoBox = await logo.boundingBox()
  const emailBox = await email.boundingBox()
  const submitBox = await submit.boundingBox()

  expect(logoBox?.y).toBeGreaterThanOrEqual(44)
  expect(logoBox?.y).toBeLessThanOrEqual(60)
  expect(emailBox?.width).toBeGreaterThanOrEqual(296)
  expect(emailBox?.width).toBeLessThanOrEqual(304)
  expect(submitBox?.width).toBeGreaterThanOrEqual(296)
  expect(submitBox?.width).toBeLessThanOrEqual(304)
  ```

  Then check the `440px x 956px` larger-mobile target:

  ```ts
  await page.setViewportSize({ height: 956, width: 440 })
  await page.goto('/auth/login')

  const largeLogo = page.locator('.auth-brand-mark--in-flow')
  const largeEmail = page.getByLabel('Email')
  const largeSubmit = page.getByRole('button', { name: 'Войти' })

  await expect(largeLogo).toHaveCSS('width', '63px')
  await expect(largeLogo).toHaveCSS('height', '63px')
  await expect(largeEmail).toHaveCSS('height', '50px')
  await expect(largeSubmit).toHaveCSS('height', '47px')
  await expect(page.locator('.auth-support-block')).toBeVisible()

  const largeLogoBox = await largeLogo.boundingBox()
  const largeEmailBox = await largeEmail.boundingBox()
  const largeSubmitBox = await largeSubmit.boundingBox()

  expect(largeLogoBox?.y).toBeGreaterThanOrEqual(64)
  expect(largeLogoBox?.y).toBeLessThanOrEqual(76)
  expect(largeEmailBox?.width).toBeGreaterThanOrEqual(296)
  expect(largeEmailBox?.width).toBeLessThanOrEqual(304)
  expect(largeSubmitBox?.width).toBeGreaterThanOrEqual(296)
  expect(largeSubmitBox?.width).toBeLessThanOrEqual(304)
  ```

- [ ] **Step 5: Run targeted browser checks**

  Run:

  ```bash
  pnpm test:e2e -- tests/e2e/admin-branding-settings.spec.ts tests/e2e/admin-branding-real-preview.spec.ts tests/e2e/customer-branding-runtime.spec.ts
  ```

  Expected: PASS.

- [ ] **Step 6: Run required final checks**

  Run:

  ```bash
  pnpm --dir backend test -- src/modules/branding/service.test.ts src/modules/branding/repository.test.ts src/modules/branding/brandingAssets.test.ts src/modules/branding/assetService.test.ts
  pnpm --dir backend test -- src/modules/registration/service.test.ts src/app.test.ts
  pnpm --dir frontend test -- src/features/branding/lib/BrandingProvider.test.tsx src/app/AppRoutes.legal.test.tsx src/features/auth/pages/LoginPage.test.tsx src/features/auth/pages/RequestPages.test.tsx src/features/admin-shell/pages/AdminBrandingPage.test.tsx src/features/admin-branding/components/portal-preview/PortalPreviewFrame.test.tsx
  pnpm lint
  pnpm build
  git diff --check
  ```

  Expected: all commands PASS.

- [ ] **Step 7: Review the implementation**

  Do a focused code review of:
  - DB migration and Drizzle snapshot consistency;
  - backend validation and strict patch parsing;
  - old `auth_header_image` and `auth_footer_image` removal from backend asset
    kinds, DB settings, `assetService.ts`, public/admin types, admin UI and
    auth runtime;
  - auth background leakage into portal/chat surfaces;
  - auth focus/error/autofill states;
  - default auth login layout alignment with `docs/design/2026-06-16-provgroup-login-screen-figma-spec.md`;
  - admin preview parity with runtime login;
  - mobile short-height behavior;
  - login legal text is informational only, has real public links and has no
    checkbox or blocking behavior;
  - registration has explicit legal checkboxes, keeps submit disabled until
    both required controls are checked, and backend rejects missing consent;
  - legal acceptance records store tenant, normalized email, required accepted
    flags, backend-owned document versions, timestamp, IP and user agent,
    record accepted `existing_pending` requests, and link to the portal user
    when possible;
  - `/legal/terms` and `/legal/privacy` stay reachable for authenticated and
    unauthenticated users;
  - production release remains blocked until operator-approved legal document
    text replaces the first-run test copy.

  Create a finding in `docs/findings/` for any unresolved risk that is not fixed in this branch.

- [ ] **Step 8: Update work log**

  If the full implementation is complete and verified, update
  `docs/roadmap/work-log.md` with one or two short baseline bullets under
  `Current Baseline`:

  ```md
  - Auth branding uses the approved Full Background design model: tenant admins can style login screens through a prepared full-screen auth background, light/dark appearance presets, overlay protection, field/button style presets and real runtime preview parity.
  - Auth legal UX has public terms/privacy pages, informational login legal links and explicit registration consent with backend persistence.
  ```

  Replace the existing `Recommended Next Step` block with the next real product step after this slice.

- [ ] **Step 9: Commit closure docs**

  Commit:

  ```bash
  git add tests/e2e/admin-branding-settings.spec.ts tests/e2e/admin-branding-real-preview.spec.ts tests/e2e/customer-branding-runtime.spec.ts docs/roadmap/work-log.md
  git commit -m "test: cover auth full background branding"
  ```
