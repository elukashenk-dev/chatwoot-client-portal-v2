import { useEffect, useState } from 'react'

import { AdminBrandingForm } from '../../admin-branding/components/AdminBrandingForm'
import {
  deleteAdminBrandingAsset,
  getAdminBranding,
  getAdminLegalDocuments,
  updateAdminBranding,
  uploadAdminBrandingAsset,
  uploadAdminLegalDocument,
  type AdminLegalDocumentSummary,
  type AdminLegalDocumentType,
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
import { AdminBrandingDesktopLayout } from './AdminBrandingDesktopLayout'

const brandingAssetMessages = {
  auth_background_image: {
    deleted: 'Общий фон экрана входа удален.',
    uploaded: 'Общий фон экрана входа загружен.',
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
    deleted: 'Иконка приложения удалена.',
    uploaded: 'Иконка приложения загружена.',
  },
} satisfies Record<
  BrandingAssetKind,
  {
    deleted: string
    uploaded: string
  }
>

const legalDocumentMessages = {
  privacy: 'Политика обработки персональных данных загружена.',
  terms: 'Пользовательское соглашение загружено.',
} satisfies Record<AdminLegalDocumentType, string>

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Не удалось загрузить настройки брендинга.'
}

export function AdminBrandingPage() {
  const { admin, signOut } = useAdminSession()
  const [draft, setDraft] = useState<BrandingDraft | null>(null)
  const [legalDocuments, setLegalDocuments] = useState<Record<
    AdminLegalDocumentType,
    AdminLegalDocumentSummary | null
  > | null>(null)
  const [brandingError, setBrandingError] = useState<string | null>(null)
  const [brandingSuccess, setBrandingSuccess] = useState<string | null>(null)
  const [brandingStatus, setBrandingStatus] = useState<
    'error' | 'idle' | 'loading' | 'saving'
  >('loading')
  const [assetActionKind, setAssetActionKind] =
    useState<BrandingAssetKind | null>(null)
  const [legalDocumentActionType, setLegalDocumentActionType] =
    useState<AdminLegalDocumentType | null>(null)
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const isSaving = brandingStatus === 'saving'
  const isFileActionInFlight =
    assetActionKind !== null || legalDocumentActionType !== null
  const areAssetActionsDisabled = isSaving || isFileActionInFlight
  const areLegalDocumentActionsDisabled = isSaving || isFileActionInFlight
  const isSubmitDisabled = isSaving || isFileActionInFlight

  useEffect(() => {
    let isCurrent = true

    async function loadBranding() {
      setBrandingStatus('loading')
      setBrandingError(null)
      setBrandingSuccess(null)

      try {
        const [brandingResponse, legalDocumentsResponse] = await Promise.all([
          getAdminBranding(),
          getAdminLegalDocuments(),
        ])

        if (!isCurrent) {
          return
        }

        setDraft(createBrandingDraft(brandingResponse))
        setLegalDocuments(legalDocumentsResponse.documents)
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

  async function refreshLegalDocuments() {
    const response = await getAdminLegalDocuments()

    setLegalDocuments(response.documents)
  }

  function handleAssetValidationError(message: string) {
    setBrandingError(message)
    setBrandingSuccess(null)
  }

  function handleLegalDocumentValidationError(message: string) {
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

  async function handleLegalDocumentUpload(
    documentType: AdminLegalDocumentType,
    file: File,
  ) {
    setLegalDocumentActionType(documentType)
    setBrandingError(null)
    setBrandingSuccess(null)

    try {
      await uploadAdminLegalDocument(documentType, file)
      await refreshLegalDocuments()
      setBrandingSuccess(legalDocumentMessages[documentType])
    } catch (error) {
      setBrandingError(getErrorMessage(error))
    } finally {
      setLegalDocumentActionType(null)
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
            Настройки и предпросмотр доступны на широком экране.
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

      <AdminBrandingDesktopLayout
        adminEmail={admin?.email ?? 'Администратор портала'}
        draft={draft}
        isSigningOut={isSigningOut}
        logoutError={logoutError}
        onLogout={() => {
          void handleLogout()
        }}
      >
        <div className="mb-5">
          <h2 className="mt-1 text-3xl font-semibold tracking-normal">
            Настройки брендинга
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Изменения применятся к этому клиентскому порталу после сохранения.
          </p>
        </div>

        <InlineAlert message={brandingError} tone="error" />
        <InlineAlert message={brandingSuccess} tone="success" />

        {brandingStatus === 'loading' ? (
          <div className="rounded-[0.6rem] border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500 shadow-sm">
            Загружаем настройки брендинга
          </div>
        ) : draft && legalDocuments ? (
          <AdminBrandingForm
            areAssetActionsDisabled={areAssetActionsDisabled}
            areLegalDocumentActionsDisabled={areLegalDocumentActionsDisabled}
            assetActionKind={assetActionKind}
            draft={draft}
            isSubmitDisabled={isSubmitDisabled}
            isSaving={isSaving}
            legalDocumentActionType={legalDocumentActionType}
            legalDocuments={legalDocuments}
            onAssetDelete={(kind) => {
              void handleAssetDelete(kind)
            }}
            onAssetUpload={(kind, file) => {
              void handleAssetUpload(kind, file)
            }}
            onAssetValidationError={handleAssetValidationError}
            onChange={handleDraftChange}
            onLegalDocumentUpload={(documentType, file) => {
              void handleLegalDocumentUpload(documentType, file)
            }}
            onLegalDocumentValidationError={handleLegalDocumentValidationError}
            onSubmit={() => {
              void handleSave()
            }}
          />
        ) : null}
      </AdminBrandingDesktopLayout>
    </main>
  )
}
