# MT-9F Admin Branding Asset Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tenant-admin upload, replace and delete controls for all current branding asset slots in `/admin/branding`.

**Architecture:** The backend asset authority already exists in `MT-9E`; this slice adds only frontend admin controls, frontend API methods, preview wiring and browser tests. Browser code must use backend-returned `publicUrl` and opaque `assetVersion` only; it must never know object keys, checksums or storage paths. Asset operations refresh the saved asset map after upload/delete, but must preserve unsaved text/color edits already typed into the admin form.

**Tech Stack:** React 19, React Router 7, Testing Library, Vitest, Playwright, Tailwind CSS, existing Fastify branding API contract.

---

## Current Implementation Status

This plan was executed on branch
`feature/phase-9-branding-admin-asset-controls`. Stable source of truth is the
code plus `docs/architecture/overview.md`, `docs/roadmap/implementation-plan.md`
and `docs/roadmap/work-log.md`.

Final implementation corrections compared with the initial plan:

- save is disabled while an asset upload/delete operation is in flight, so a
  settings PATCH response cannot overwrite a freshly refreshed asset map;
- migration `0011_branding_pwa_icon_asset` creates the composite
  `(tenant_id, id)` unique index if an older local database applied the old
  `0010` migration before that index existed.

## Scope Boundaries

In scope:

- Typed frontend branding asset DTOs for the seven backend-supported kinds:
  `logo`, `pwa_icon`, `auth_header_image`, `auth_footer_image`,
  `auth_background_image`, `chat_background_image`,
  `chat_header_background_image`.
- `POST /api/admin/branding/assets/:kind` client method using multipart field
  `asset`.
- `DELETE /api/admin/branding/assets/:kind` client method.
- Admin UI section `Изображения` in the existing desktop admin console.
- Upload, replace and delete actions for each asset slot.
- Frontend pre-validation: PNG, JPG, GIF or WebP, max `5 MB`.
- Preview pane rendering uploaded assets via returned portal-owned URLs.
- Unit/component/page tests and Playwright browser smoke for upload/delete.

Out of scope:

- Applying branding assets to real customer auth/chat runtime surfaces. That is
  `MT-9G`.
- New backend storage behavior, new database migrations or image transforms.
- Production object storage provisioning changes.
- Mobile admin console support. The existing desktop-only admin boundary remains.

## Acceptance Criteria

- Admin sees an `Изображения` section in `/admin/branding` with seven grouped
  asset slots.
- Empty slot shows `Загрузить ...`; filled slot shows `Заменить ...` and
  `Удалить ...`.
- Upload sends one multipart file in field `asset` to the correct
  tenant-admin route and then refreshes the asset map.
- Delete calls the correct tenant-admin route and then refreshes the asset map.
- Upload/delete success and error messages are shown in Russian.
- Client rejects unsupported image MIME types and files over `5 MB` before the
  API call.
- Asset refresh after upload/delete does not overwrite unsaved text/color
  changes in the form.
- Preview uses returned `publicUrl` values and does not construct object-storage
  URLs.
- Frontend tests and Playwright smoke cover the browser flow.

## File Structure

- Modify: `frontend/src/features/admin-branding/api/adminBrandingClient.ts`
  Add asset types and upload/delete API methods.
- Modify: `frontend/src/features/admin-branding/api/adminBrandingClient.test.ts`
  Cover multipart upload and delete contracts.
- Modify: `frontend/src/features/admin-branding/lib/brandingState.ts`
  Carry the asset map in `BrandingDraft`; keep settings patch asset-free.
- Add: `frontend/src/features/admin-branding/components/BrandingAssetControls.tsx`
  Focused asset slot list, client validation and file/delete controls.
- Add: `frontend/src/features/admin-branding/components/BrandingAssetControls.test.tsx`
  Component-level validation/action tests.
- Modify: `frontend/src/features/admin-branding/components/AdminBrandingForm.tsx`
  Add the `Изображения` section and pass asset actions to
  `BrandingAssetControls`.
- Modify: `frontend/src/features/admin-branding/components/BrandingPreviewPane.tsx`
  Show logo/auth/chat asset previews using returned `publicUrl`.
- Modify: `frontend/src/features/admin-shell/pages/AdminBrandingPage.tsx`
  Add upload/delete orchestration, asset refresh and success/error handling.
- Modify: `frontend/src/features/admin-shell/pages/AdminBrandingPage.test.tsx`
  Verify page orchestration and unsaved draft preservation.
- Modify: `frontend/src/shared/ui/icons.tsx`
  Add small `UploadIcon` and `TrashIcon` if needed by controls.
- Add: `tests/e2e/admin-branding-assets.spec.ts`
  Browser smoke with mocked admin routes for upload/delete.
- Modify after closure only: `docs/roadmap/implementation-plan.md`
  Mark `MT-9F` closed and set `MT-9G` as current next slice.
- Modify after closure only: `docs/roadmap/work-log.md`
  Add stable `MT-9F` baseline and update `Recommended Next Step`.
- Modify after closure only: `docs/architecture/overview.md`
  Record that tenant admins can manage branding asset slots through the portal
  admin console.

---

## Task 1: Add Frontend Asset API Contract

**Files:**

- Modify: `frontend/src/features/admin-branding/api/adminBrandingClient.ts`
- Modify: `frontend/src/features/admin-branding/api/adminBrandingClient.test.ts`

- [ ] **Step 1: Write failing client tests**

Add these tests to `adminBrandingClient.test.ts`:

```ts
it('uploads a branding asset as multipart form data', async () => {
  const imageFile = new File(['logo-bytes'], 'logo.png', {
    type: 'image/png',
  })

  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      headers: new Headers({ 'content-type': 'application/json' }),
      json: vi.fn().mockResolvedValue({
        asset: {
          assetVersion: '42',
          contentType: 'image/png',
          height: null,
          id: 42,
          kind: 'logo',
          publicUrl: '/api/branding/assets/42?v=42',
          width: null,
        },
      }),
      ok: true,
      status: 200,
    }),
  )

  await uploadAdminBrandingAsset('logo', imageFile)

  expect(fetch).toHaveBeenCalledWith(
    '/api/admin/branding/assets/logo',
    expect.objectContaining({
      credentials: 'include',
      method: 'POST',
    }),
  )
  const init = vi.mocked(fetch).mock.calls[0]?.[1]

  expect(init?.body).toBeInstanceOf(FormData)
  expect((init?.body as FormData).get('asset')).toBe(imageFile)
  expect(JSON.stringify(init)).not.toContain('content-type')
})

it('deletes an active branding asset by kind', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      headers: new Headers({ 'content-type': 'application/json' }),
      json: vi.fn().mockResolvedValue({ deleted: true }),
      ok: true,
      status: 200,
    }),
  )

  await deleteAdminBrandingAsset('pwa_icon')

  expect(fetch).toHaveBeenCalledWith(
    '/api/admin/branding/assets/pwa_icon',
    expect.objectContaining({
      credentials: 'include',
      method: 'DELETE',
    }),
  )
})
```

- [ ] **Step 2: Run red test**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/admin-branding/api/adminBrandingClient.test.ts --reporter verbose
```

Expected: fail because `uploadAdminBrandingAsset` and
`deleteAdminBrandingAsset` do not exist.

- [ ] **Step 3: Implement asset types and client methods**

In `adminBrandingClient.ts`, add:

```ts
export type BrandingAssetKind =
  | 'logo'
  | 'pwa_icon'
  | 'auth_header_image'
  | 'auth_footer_image'
  | 'auth_background_image'
  | 'chat_background_image'
  | 'chat_header_background_image'

export type BrandingAsset = {
  assetVersion: string
  contentType: string
  height: number | null
  id: number
  kind: BrandingAssetKind
  publicUrl: string
  width: number | null
}

export type BrandingAssets = Partial<Record<BrandingAssetKind, BrandingAsset>>

export type AdminBrandingAssetUploadResponse = {
  asset: BrandingAsset
}

export type AdminBrandingAssetDeleteResponse = {
  deleted: boolean
}
```

Change `AdminBrandingResponse.branding.assets` to `BrandingAssets`.

Add:

```ts
export function uploadAdminBrandingAsset(kind: BrandingAssetKind, file: File) {
  const formData = new FormData()

  formData.set('asset', file)

  return request<AdminBrandingAssetUploadResponse>(
    `/admin/branding/assets/${kind}`,
    {
      body: formData,
      method: 'POST',
    },
  )
}

export function deleteAdminBrandingAsset(kind: BrandingAssetKind) {
  return request<AdminBrandingAssetDeleteResponse>(
    `/admin/branding/assets/${kind}`,
    {
      method: 'DELETE',
    },
  )
}
```

- [ ] **Step 4: Run green client tests**

Run the same frontend client test command. Expected: all tests in the file pass.

- [ ] **Step 5: Checkpoint commit**

```bash
git add frontend/src/features/admin-branding/api/adminBrandingClient.ts frontend/src/features/admin-branding/api/adminBrandingClient.test.ts
git commit -m "feat: add admin branding asset client"
```

---

## Task 2: Add Asset State To Branding Draft

**Files:**

- Modify: `frontend/src/features/admin-branding/lib/brandingState.ts`
- Modify: `frontend/src/features/admin-shell/pages/AdminBrandingPage.test.tsx`

- [ ] **Step 1: Write failing state/page regression**

Add a page test that proves an asset refresh does not overwrite unsaved settings:

```ts
it('refreshes assets after upload without overwriting unsaved text edits', async () => {
  const user = userEvent.setup()
  const imageFile = new File(['logo-bytes'], 'logo.png', {
    type: 'image/png',
  })

  uploadAdminBrandingAssetMock.mockResolvedValueOnce({
    asset: {
      assetVersion: '77',
      contentType: 'image/png',
      height: null,
      id: 77,
      kind: 'logo',
      publicUrl: '/api/branding/assets/77?v=77',
      width: null,
    },
  })
  getAdminBrandingMock
    .mockResolvedValueOnce(savedBrandingResponse)
    .mockResolvedValueOnce(
      createBrandingResponse({
        assets: {
          logo: {
            assetVersion: '77',
            contentType: 'image/png',
            height: null,
            id: 77,
            kind: 'logo',
            publicUrl: '/api/branding/assets/77?v=77',
            width: null,
          },
        },
        portalName: 'Бухфирма',
      }),
    )

  renderAdminBrandingPage()

  const portalNameInput = await screen.findByLabelText('Название портала')
  await user.clear(portalNameInput)
  await user.type(portalNameInput, 'Несохраненное имя')
  await user.upload(screen.getByLabelText('Загрузить логотип'), imageFile)

  await waitFor(() => {
    expect(uploadAdminBrandingAssetMock).toHaveBeenCalledWith('logo', imageFile)
  })
  expect(screen.getByLabelText('Название портала')).toHaveValue(
    'Несохраненное имя',
  )
  expect(await screen.findByAltText('Логотип')).toHaveAttribute(
    'src',
    '/api/branding/assets/77?v=77',
  )
})
```

The test file must also mock `uploadAdminBrandingAsset` and
`deleteAdminBrandingAsset` from the branding client module.

- [ ] **Step 2: Run red page test**

Run:

```bash
pnpm --dir frontend exec vitest run src/features/admin-shell/pages/AdminBrandingPage.test.tsx --reporter verbose
```

Expected: fail because `BrandingDraft` has no `assets` and upload UI does not
exist yet.

- [ ] **Step 3: Add assets to draft state**

Update `brandingState.ts`:

```ts
import type {
  AdminBrandingPatch,
  AdminBrandingResponse,
  BrandingAssets,
  BrandingColors,
  BrandingCopy,
} from '../api/adminBrandingClient'

export type BrandingDraft = {
  assets: BrandingAssets
  colors: BrandingColors
  copy: BrandingCopy
  portalName: string
  supportLabel: string
}

export function createBrandingDraft(
  response: AdminBrandingResponse,
): BrandingDraft {
  return {
    assets: response.branding.assets,
    colors: response.branding.colors,
    copy: response.branding.copy,
    portalName: response.branding.portalName,
    supportLabel: response.branding.supportLabel,
  }
}
```

Keep `createBrandingPatch` unchanged except that it must still return only
`colors`, `copy`, `portalName` and `supportLabel`.

- [ ] **Step 4: Leave page test red until UI task**

Run the page test again. Expected: still fail because the upload control is not
implemented. This is acceptable and will go green in Task 4.

---

## Task 3: Build Asset Controls Component

**Files:**

- Add: `frontend/src/features/admin-branding/components/BrandingAssetControls.tsx`
- Add: `frontend/src/features/admin-branding/components/BrandingAssetControls.test.tsx`
- Modify: `frontend/src/shared/ui/icons.tsx`

- [ ] **Step 1: Write component tests**

Create `BrandingAssetControls.test.tsx` with tests for:

```ts
it('renders upload, replace and delete actions by slot', async () => {
  render(
    <BrandingAssetControls
      assets={{
        logo: {
          assetVersion: '7',
          contentType: 'image/png',
          height: null,
          id: 7,
          kind: 'logo',
          publicUrl: '/api/branding/assets/7?v=7',
          width: null,
        },
      }}
      busyKind={null}
      disabled={false}
      onDelete={vi.fn()}
      onUpload={vi.fn()}
      onValidationError={vi.fn()}
    />,
  )

  expect(screen.getByLabelText('Заменить логотип')).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Удалить логотип' }),
  ).toBeInTheDocument()
  expect(screen.getByLabelText('Загрузить PWA-иконку')).toBeInTheDocument()
})

it('rejects unsupported file types before upload', async () => {
  const user = userEvent.setup({ applyAccept: false })
  const onUpload = vi.fn()
  const onValidationError = vi.fn()

  render(
    <BrandingAssetControls
      assets={{}}
      busyKind={null}
      disabled={false}
      onDelete={vi.fn()}
      onUpload={onUpload}
      onValidationError={onValidationError}
    />,
  )

  await user.upload(
    screen.getByLabelText('Загрузить логотип'),
    new File(['bad'], 'logo.txt', { type: 'text/plain' }),
  )

  expect(onUpload).not.toHaveBeenCalled()
  expect(onValidationError).toHaveBeenCalledWith(
    'Можно загрузить PNG, JPG, GIF или WebP.',
  )
})

it('rejects files over five megabytes before upload', async () => {
  const user = userEvent.setup()
  const onUpload = vi.fn()
  const onValidationError = vi.fn()
  const oversizedFile = new File(
    [new Uint8Array(5 * 1024 * 1024 + 1)],
    'large.png',
    { type: 'image/png' },
  )

  render(
    <BrandingAssetControls
      assets={{}}
      busyKind={null}
      disabled={false}
      onDelete={vi.fn()}
      onUpload={onUpload}
      onValidationError={onValidationError}
    />,
  )

  await user.upload(screen.getByLabelText('Загрузить логотип'), oversizedFile)

  expect(onUpload).not.toHaveBeenCalled()
  expect(onValidationError).toHaveBeenCalledWith(
    'Файл брендинга должен быть не больше 5 МБ.',
  )
})
```

- [ ] **Step 2: Run red component test**

```bash
pnpm --dir frontend exec vitest run src/features/admin-branding/components/BrandingAssetControls.test.tsx --reporter verbose
```

Expected: fail because the component does not exist.

- [ ] **Step 3: Add icons if needed**

In `frontend/src/shared/ui/icons.tsx`, add `UploadIcon` and `TrashIcon` near
`ImageIcon`:

```tsx
export function UploadIcon({ className = iconClassName }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.45"
      viewBox="0 0 24 24"
    >
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 16v2.5A2.5 2.5 0 0 0 6.5 21h11A2.5 2.5 0 0 0 20 18.5V16" />
    </svg>
  )
}

export function TrashIcon({ className = iconClassName }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.45"
      viewBox="0 0 24 24"
    >
      <path d="M4 7h16" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M6 7l1 14h10l1-14" />
      <path d="M9 7V4h6v3" />
    </svg>
  )
}
```

- [ ] **Step 4: Implement `BrandingAssetControls`**

Use a local slot definition:

```ts
const brandingAssetSlots = [
  { actionName: 'логотип', kind: 'logo', title: 'Логотип' },
  { actionName: 'PWA-иконку', kind: 'pwa_icon', title: 'PWA-иконка' },
  {
    actionName: 'верхнее изображение auth-экрана',
    kind: 'auth_header_image',
    title: 'Auth: верхнее изображение',
  },
  {
    actionName: 'нижнее изображение auth-экрана',
    kind: 'auth_footer_image',
    title: 'Auth: нижнее изображение',
  },
  {
    actionName: 'фон auth-экрана',
    kind: 'auth_background_image',
    title: 'Auth: общий фон',
  },
  {
    actionName: 'фон чата',
    kind: 'chat_background_image',
    title: 'Чат: общий фон',
  },
  {
    actionName: 'фон шапки чата',
    kind: 'chat_header_background_image',
    title: 'Чат: фон шапки',
  },
] satisfies Array<{
  actionName: string
  kind: BrandingAssetKind
  title: string
}>
```

Validation constants:

```ts
const BRANDING_ASSET_MAX_BYTES = 5 * 1024 * 1024
const allowedBrandingAssetTypes = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
])
const brandingAssetAccept = 'image/gif,image/jpeg,image/png,image/webp'
```

The component should:

- render each slot in a compact bordered row/card;
- show an `<img>` only when `asset.publicUrl` exists;
- reset the file input value after every change;
- call `onValidationError(message)` for local validation failures;
- call `onUpload(kind, file)` for valid files;
- call `onDelete(kind)` from the delete button;
- disable all controls when `disabled` is true;
- show `Загружаем...` for the active busy upload/replace label.

- [ ] **Step 5: Run green component test**

Run the component test command. Expected: pass.

- [ ] **Step 6: Checkpoint commit**

```bash
git add frontend/src/features/admin-branding/components/BrandingAssetControls.tsx frontend/src/features/admin-branding/components/BrandingAssetControls.test.tsx frontend/src/shared/ui/icons.tsx
git commit -m "feat: add branding asset controls"
```

---

## Task 4: Wire Asset Controls Into Admin Branding Page And Preview

**Files:**

- Modify: `frontend/src/features/admin-branding/components/AdminBrandingForm.tsx`
- Modify: `frontend/src/features/admin-branding/components/BrandingPreviewPane.tsx`
- Modify: `frontend/src/features/admin-shell/pages/AdminBrandingPage.tsx`
- Modify: `frontend/src/features/admin-shell/pages/AdminBrandingPage.test.tsx`

- [ ] **Step 1: Update page mocks**

In `AdminBrandingPage.test.tsx`, extend the hoisted mock:

```ts
const {
  deleteAdminBrandingAssetMock,
  getAdminBrandingMock,
  updateAdminBrandingMock,
  uploadAdminBrandingAssetMock,
} = vi.hoisted(() => ({
  deleteAdminBrandingAssetMock: vi.fn(),
  getAdminBrandingMock: vi.fn(),
  updateAdminBrandingMock: vi.fn(),
  uploadAdminBrandingAssetMock: vi.fn(),
}))
```

Then export the new mocked client functions from `vi.mock(...)`.

- [ ] **Step 2: Wire form props**

Add these props to `AdminBrandingFormProps`:

```ts
assetActionKind: BrandingAssetKind | null
areAssetActionsDisabled: boolean
onAssetDelete: (kind: BrandingAssetKind) => void
onAssetUpload: (kind: BrandingAssetKind, file: File) => void
onAssetValidationError: (message: string) => void
```

Render a new section:

```tsx
<section
  className="rounded-[0.6rem] border border-slate-200 bg-white p-4 shadow-sm"
  id="assets"
>
  <div className="mb-4">
    <h3 className="text-lg font-semibold">Изображения</h3>
    <p className="mt-1 text-sm leading-6 text-slate-500">
      Логотип, PWA-иконка и фоны для auth-экранов и чата.
    </p>
  </div>
  <BrandingAssetControls
    assets={draft.assets}
    busyKind={assetActionKind}
    disabled={areAssetActionsDisabled}
    onDelete={onAssetDelete}
    onUpload={onAssetUpload}
    onValidationError={onAssetValidationError}
  />
</section>
```

- [ ] **Step 3: Add page orchestration**

In `AdminBrandingPage.tsx`:

- import `deleteAdminBrandingAsset` and `uploadAdminBrandingAsset`;
- keep one `assetAction` state:

```ts
const [assetActionKind, setAssetActionKind] =
  useState<BrandingAssetKind | null>(null)
```

- add helper:

```ts
async function refreshBrandingAssets() {
  const response = await getAdminBranding()

  setDraft((currentDraft) => {
    if (!currentDraft) {
      return createBrandingDraft(response)
    }

    return {
      ...currentDraft,
      assets: response.branding.assets,
    }
  })
}
```

- add upload handler:

```ts
async function handleAssetUpload(kind: BrandingAssetKind, file: File) {
  setAssetActionKind(kind)
  setBrandingError(null)
  setBrandingSuccess(null)

  try {
    await uploadAdminBrandingAsset(kind, file)
    await refreshBrandingAssets()
    setBrandingSuccess(`${getBrandingAssetActionTitle(kind)} загружен.`)
  } catch (error) {
    setBrandingError(getErrorMessage(error))
  } finally {
    setAssetActionKind(null)
  }
}
```

- add delete handler:

```ts
async function handleAssetDelete(kind: BrandingAssetKind) {
  setAssetActionKind(kind)
  setBrandingError(null)
  setBrandingSuccess(null)

  try {
    await deleteAdminBrandingAsset(kind)
    await refreshBrandingAssets()
    setBrandingSuccess(`${getBrandingAssetActionTitle(kind)} удален.`)
  } catch (error) {
    setBrandingError(getErrorMessage(error))
  } finally {
    setAssetActionKind(null)
  }
}
```

Use a local Russian title map for success messages. Keep messages short and
stable for tests: `Логотип загружен.`, `Логотип удален.`,
`PWA-иконка загружена.` and so on.

- [ ] **Step 4: Update preview**

In `BrandingPreviewPane.tsx`:

- read `const { assets } = draft`;
- show `assets.logo.publicUrl` as an image in the auth preview header area;
- use `assets.auth_background_image.publicUrl` as `backgroundImage` for the auth
  preview wrapper when present;
- show `assets.auth_header_image` and `assets.auth_footer_image` as small
  preview strips;
- use `assets.chat_background_image.publicUrl` as `backgroundImage` for the chat
  preview body when present;
- use `assets.chat_header_background_image.publicUrl` as `backgroundImage` for
  the chat header when present;
- render `assets.pwa_icon.publicUrl` as a small square labeled `PWA`.

Keep this as preview-only; do not change customer runtime components in this
task.

- [ ] **Step 5: Run page tests**

```bash
pnpm --dir frontend exec vitest run src/features/admin-shell/pages/AdminBrandingPage.test.tsx src/features/admin-branding/components/BrandingAssetControls.test.tsx --reporter verbose
```

Expected: pass.

- [ ] **Step 6: Checkpoint commit**

```bash
git add frontend/src/features/admin-branding/components/AdminBrandingForm.tsx frontend/src/features/admin-branding/components/BrandingPreviewPane.tsx frontend/src/features/admin-shell/pages/AdminBrandingPage.tsx frontend/src/features/admin-shell/pages/AdminBrandingPage.test.tsx frontend/src/features/admin-branding/lib/brandingState.ts
git commit -m "feat: wire branding asset controls into admin page"
```

---

## Task 5: Add Playwright Browser Smoke

**Files:**

- Add: `tests/e2e/admin-branding-assets.spec.ts`

- [ ] **Step 1: Create mocked browser test**

Add a Playwright test that:

- mocks `/api/tenant`, `/api/admin/auth/me`, `/api/admin/branding`,
  `/api/admin/branding/assets/logo` and `/api/branding/assets/77*`;
- opens `/admin/branding`;
- clicks the `Изображения` section link;
- uploads `logo.png` through `Загрузить логотип`;
- verifies `POST /api/admin/branding/assets/logo`;
- verifies success message `Логотип загружен.`;
- verifies the preview image uses `/api/branding/assets/77?v=77`;
- deletes the logo;
- verifies `DELETE /api/admin/branding/assets/logo`;
- verifies success message `Логотип удален.` and upload action returns.

Use a minimal PNG buffer:

```ts
const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGSc9h4NwAAAABJRU5ErkJggg==',
  'base64',
)
```

- [ ] **Step 2: Run Playwright smoke**

If local services are already running:

```bash
PLAYWRIGHT_BASE_URL=http://buhfirma.127.0.0.1.nip.io:5173 pnpm test:e2e -- tests/e2e/admin-branding-assets.spec.ts
```

Expected: chromium test passes.

If services are not running, start the existing local frontend/backend stack
according to `docs/operations/local-testing.md`, then rerun the same command.

- [ ] **Step 3: Checkpoint commit**

```bash
git add tests/e2e/admin-branding-assets.spec.ts
git commit -m "test: cover admin branding asset controls"
```

---

## Task 6: Closure Review, Docs And Checks

**Files:**

- Modify: `docs/architecture/overview.md`
- Modify: `docs/roadmap/implementation-plan.md`
- Modify: `docs/roadmap/work-log.md`

- [ ] **Step 1: Run targeted tests**

```bash
pnpm --dir frontend exec vitest run src/features/admin-branding/api/adminBrandingClient.test.ts src/features/admin-branding/components/BrandingAssetControls.test.tsx src/features/admin-shell/pages/AdminBrandingPage.test.tsx --reporter verbose
```

Expected: all targeted frontend tests pass.

- [ ] **Step 2: Run required checks**

```bash
pnpm lint
pnpm build
pnpm test
git diff --check
```

Expected: all pass.

- [ ] **Step 3: Review the touched code**

Review for:

- asset refresh preserving unsaved draft fields;
- no object key/checksum/browser storage leak;
- no manual multipart `Content-Type`;
- no customer runtime branding changes in `MT-9F`;
- Russian page copy for admin UI;
- disabled states for upload/delete during active requests;
- file sizes under code-health limits.

If a finding is found, fix it before updating docs.

- [ ] **Step 4: Update stable docs after green closure**

Update `implementation-plan.md`:

- mark `MT-9F` closed;
- make `MT-9G` the current next slice.

Update `work-log.md`:

- add a short `MT-9F` baseline line under `Current Baseline`;
- set `Recommended Next Step` to `MT-9G`.

Update `overview.md`:

- add that tenant admins manage branding image slots from the protected admin
  console while browser still receives only portal-owned asset URLs.

- [ ] **Step 5: Final docs/checks pass**

```bash
pnpm exec prettier --check docs/architecture/overview.md docs/roadmap/implementation-plan.md docs/roadmap/work-log.md docs/superpowers/plans/2026-06-07-mt-9f-admin-branding-asset-controls.md
git diff --check
```

Expected: pass.

- [ ] **Step 6: Final checkpoint commit**

```bash
git add docs/architecture/overview.md docs/roadmap/implementation-plan.md docs/roadmap/work-log.md docs/superpowers/plans/2026-06-07-mt-9f-admin-branding-asset-controls.md
git commit -m "chore: close mt-9 admin branding asset controls"
```

## Self-Review Notes

- Scope is one slice: frontend admin asset controls over already-built backend
  routes.
- The plan intentionally keeps customer runtime application for `MT-9G`.
- The stale refresh risk is explicitly covered by a page regression test.
- The plan does not introduce backend migrations or object-storage behavior.
- No browser contract exposes `objectKey`, `contentHash`, `checksumSha256` or
  `originalFilename`.
