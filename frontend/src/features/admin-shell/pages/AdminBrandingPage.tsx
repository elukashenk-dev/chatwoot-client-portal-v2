import { useEffect, useState } from 'react'

import { AdminBrandingForm } from '../../admin-branding/components/AdminBrandingForm'
import { BrandingPreviewPane } from '../../admin-branding/components/BrandingPreviewPane'
import {
  deleteAdminBrandingAsset,
  getAdminBranding,
  updateAdminBranding,
  uploadAdminBrandingAsset,
  type BrandingAssetKind,
} from '../../admin-branding/api/adminBrandingClient'
import {
  createBrandingDraft,
  createBrandingPatch,
  type BrandingDraft,
} from '../../admin-branding/lib/brandingState'
import { InlineAlert } from '../../../shared/ui/InlineAlert'
import { LogOutIcon } from '../../../shared/ui/icons'
import { useAdminSession } from '../../admin-auth/lib/adminSessionContext'

const brandingSections = [
  {
    id: 'main',
    title: 'Основное',
  },
  {
    id: 'colors',
    title: 'Цвета',
  },
  {
    id: 'assets',
    title: 'Изображения',
  },
  {
    id: 'auth',
    title: 'Auth-экран',
  },
]

const brandingAssetMessages = {
  auth_background_image: {
    deleted: 'Фон auth-экрана удален.',
    uploaded: 'Фон auth-экрана загружен.',
  },
  auth_footer_image: {
    deleted: 'Нижнее изображение auth-экрана удалено.',
    uploaded: 'Нижнее изображение auth-экрана загружено.',
  },
  auth_header_image: {
    deleted: 'Верхнее изображение auth-экрана удалено.',
    uploaded: 'Верхнее изображение auth-экрана загружено.',
  },
  chat_background_image: {
    deleted: 'Фон чата удален.',
    uploaded: 'Фон чата загружен.',
  },
  chat_header_background_image: {
    deleted: 'Фон шапки чата удален.',
    uploaded: 'Фон шапки чата загружен.',
  },
  logo: {
    deleted: 'Логотип удален.',
    uploaded: 'Логотип загружен.',
  },
  pwa_icon: {
    deleted: 'PWA-иконка удалена.',
    uploaded: 'PWA-иконка загружена.',
  },
} satisfies Record<
  BrandingAssetKind,
  {
    deleted: string
    uploaded: string
  }
>

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Не удалось загрузить настройки брендинга.'
}

export function AdminBrandingPage() {
  const { admin, signOut } = useAdminSession()
  const [draft, setDraft] = useState<BrandingDraft | null>(null)
  const [brandingError, setBrandingError] = useState<string | null>(null)
  const [brandingSuccess, setBrandingSuccess] = useState<string | null>(null)
  const [brandingStatus, setBrandingStatus] = useState<
    'error' | 'idle' | 'loading' | 'saving'
  >('loading')
  const [assetActionKind, setAssetActionKind] =
    useState<BrandingAssetKind | null>(null)
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const isSaving = brandingStatus === 'saving'
  const areAssetActionsDisabled = isSaving || assetActionKind !== null

  useEffect(() => {
    let isCurrent = true

    async function loadBranding() {
      setBrandingStatus('loading')
      setBrandingError(null)
      setBrandingSuccess(null)

      try {
        const response = await getAdminBranding()

        if (!isCurrent) {
          return
        }

        setDraft(createBrandingDraft(response))
        setBrandingStatus('idle')
      } catch (error) {
        if (!isCurrent) {
          return
        }

        setBrandingError(getErrorMessage(error))
        setBrandingStatus('error')
      }
    }

    void loadBranding()

    return () => {
      isCurrent = false
    }
  }, [])

  async function handleLogout() {
    setLogoutError(null)
    setIsSigningOut(true)

    try {
      await signOut()
    } catch (error) {
      setLogoutError(
        error instanceof Error ? error.message : 'Не удалось выйти.',
      )
    } finally {
      setIsSigningOut(false)
    }
  }

  function handleDraftChange(nextDraft: BrandingDraft) {
    setDraft(nextDraft)
    setBrandingSuccess(null)
  }

  async function handleSave() {
    if (!draft) {
      return
    }

    setBrandingStatus('saving')
    setBrandingError(null)
    setBrandingSuccess(null)

    try {
      const response = await updateAdminBranding(createBrandingPatch(draft))

      setDraft(createBrandingDraft(response))
      setBrandingSuccess('Настройки сохранены.')
      setBrandingStatus('idle')
    } catch (error) {
      setBrandingError(getErrorMessage(error))
      setBrandingStatus('error')
    }
  }

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

  function handleAssetValidationError(message: string) {
    setBrandingError(message)
    setBrandingSuccess(null)
  }

  async function handleAssetUpload(kind: BrandingAssetKind, file: File) {
    setAssetActionKind(kind)
    setBrandingError(null)
    setBrandingSuccess(null)

    try {
      await uploadAdminBrandingAsset(kind, file)
      await refreshBrandingAssets()
      setBrandingSuccess(brandingAssetMessages[kind].uploaded)
    } catch (error) {
      setBrandingError(getErrorMessage(error))
    } finally {
      setAssetActionKind(null)
    }
  }

  async function handleAssetDelete(kind: BrandingAssetKind) {
    setAssetActionKind(kind)
    setBrandingError(null)
    setBrandingSuccess(null)

    try {
      await deleteAdminBrandingAsset(kind)
      await refreshBrandingAssets()
      setBrandingSuccess(brandingAssetMessages[kind].deleted)
    } catch (error) {
      setBrandingError(getErrorMessage(error))
    } finally {
      setAssetActionKind(null)
    }
  }

  return (
    <main className="min-h-full bg-slate-100 text-slate-950">
      <section className="lg:hidden flex min-h-full flex-col justify-center px-6 py-16 text-center">
        <div className="mx-auto max-w-sm space-y-4">
          <p className="text-xs font-semibold uppercase tracking-normal text-brand-700">
            Админ-консоль
          </p>
          <h1 className="text-2xl font-semibold">
            Админ-консоль доступна с широкого экрана
          </h1>
          <p className="text-sm leading-6 text-slate-600">
            Настройки и предпросмотр требуют desktop ширину.
          </p>
          <button
            className="mx-auto inline-flex items-center gap-2 rounded-[0.6rem] bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200"
            disabled={isSigningOut}
            onClick={() => {
              void handleLogout()
            }}
            type="button"
          >
            <LogOutIcon className="h-4 w-4" />
            Выйти
          </button>
          <InlineAlert message={logoutError} tone="error" />
        </div>
      </section>

      <section className="hidden min-h-full grid-cols-[15rem_minmax(0,1fr)_22rem] lg:grid">
        <aside className="border-r border-slate-200 bg-white px-5 py-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-brand-700">
              Админ-консоль
            </p>
            <h1 className="mt-2 text-2xl font-semibold">Брендинг</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {admin?.email ?? 'Администратор портала'}
            </p>
          </div>

          <nav aria-label="Разделы админки" className="mt-8 space-y-2">
            {brandingSections.map((section) => (
              <a
                className="block rounded-[0.6rem] px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
                href={`#${section.id}`}
                key={section.title}
              >
                {section.title}
              </a>
            ))}
          </nav>

          <div className="mt-8 space-y-3">
            <InlineAlert message={logoutError} tone="error" />
            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-[0.6rem] border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
              disabled={isSigningOut}
              onClick={() => {
                void handleLogout()
              }}
              type="button"
            >
              <LogOutIcon className="h-4 w-4" />
              Выйти
            </button>
          </div>
        </aside>

        <section className="overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-4xl">
            <div className="mb-5">
              <h2 className="mt-1 text-3xl font-semibold tracking-normal">
                Настройки брендинга
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Цвета и тексты применяются к текущему tenant после сохранения.
              </p>
            </div>

            <InlineAlert message={brandingError} tone="error" />
            <InlineAlert message={brandingSuccess} tone="success" />

            {brandingStatus === 'loading' ? (
              <div className="rounded-[0.6rem] border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500 shadow-sm">
                Загружаем настройки брендинга
              </div>
            ) : draft ? (
              <AdminBrandingForm
                areAssetActionsDisabled={areAssetActionsDisabled}
                assetActionKind={assetActionKind}
                draft={draft}
                isSaving={isSaving}
                onAssetDelete={(kind) => {
                  void handleAssetDelete(kind)
                }}
                onAssetUpload={(kind, file) => {
                  void handleAssetUpload(kind, file)
                }}
                onAssetValidationError={handleAssetValidationError}
                onChange={handleDraftChange}
                onSubmit={() => {
                  void handleSave()
                }}
              />
            ) : null}
          </div>
        </section>

        <aside className="border-l border-slate-200 bg-white px-5 py-6">
          {draft ? (
            <BrandingPreviewPane draft={draft} />
          ) : (
            <div className="rounded-[0.6rem] border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              Предпросмотр появится после загрузки настроек.
            </div>
          )}
        </aside>
      </section>
    </main>
  )
}
