import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import type { MouseEvent } from 'react'

import { AuthFrame } from '../../../app/layouts/AuthFrame'
import { routePaths } from '../../../app/routePaths'
import { AuthCompactSupport } from '../../auth/components/AuthCompactSupport'
import { useBranding } from '../../branding/lib/useBranding'
import { createTenantMonogram } from '../../tenant/lib/tenantIdentityMetadata'
import {
  getPublicLegalDocument,
  type LegalDocumentId,
  type PublicLegalDocument,
} from '../api/legalDocumentsClient'
import { BrandMark } from '../../../shared/ui/BrandMark'

type LegalDocumentLocationState = {
  legalBackMode?: 'history'
}

type LegalDocumentState =
  | {
      content: null
      document: LegalDocumentId
      errorMessage: null
      status: 'loading'
    }
  | {
      content: PublicLegalDocument
      document: LegalDocumentId
      errorMessage: null
      status: 'ready'
    }
  | {
      content: null
      document: LegalDocumentId
      errorMessage: string
      status: 'error'
    }

const legalDocumentFallbackTitles = {
  privacy: 'Политика обработки персональных данных',
  terms: 'Пользовательское соглашение',
} satisfies Record<LegalDocumentId, string>

function hasHistoryBackState(
  state: unknown,
): state is LegalDocumentLocationState {
  return (
    typeof state === 'object' &&
    state !== null &&
    'legalBackMode' in state &&
    (state as LegalDocumentLocationState).legalBackMode === 'history'
  )
}

function splitLegalDocumentBody(bodyText: string) {
  return bodyText
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
}

function createLoadingState(document: LegalDocumentId): LegalDocumentState {
  return {
    content: null,
    document,
    errorMessage: null,
    status: 'loading',
  }
}

export function LegalDocumentPage({ document }: { document: LegalDocumentId }) {
  const { branding } = useBranding()
  const brandLogo = branding.assets.logo
  const location = useLocation()
  const navigate = useNavigate()
  const [documentState, setDocumentState] = useState<LegalDocumentState>(() =>
    createLoadingState(document),
  )
  const isCurrentDocumentState = documentState.document === document
  const content = isCurrentDocumentState ? documentState.content : null
  const errorMessage = isCurrentDocumentState
    ? documentState.errorMessage
    : null
  const isLoading =
    !isCurrentDocumentState || documentState.status === 'loading'

  useEffect(() => {
    const abortController = new AbortController()

    void getPublicLegalDocument({
      documentType: document,
      signal: abortController.signal,
    })
      .then((loadedDocument) => {
        setDocumentState({
          content: loadedDocument,
          document,
          errorMessage: null,
          status: 'ready',
        })
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted) {
          return
        }

        setDocumentState({
          content: null,
          document,
          errorMessage:
            error instanceof Error
              ? error.message
              : 'Юридический документ временно недоступен.',
          status: 'error',
        })
      })

    return () => {
      abortController.abort()
    }
  }, [document])

  function handleBackClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.currentTarget.target
    ) {
      return
    }

    if (!hasHistoryBackState(location.state)) {
      return
    }

    event.preventDefault()
    navigate(-1)
  }

  return (
    <AuthFrame>
      <section className="auth-canvas-background legal-document-canvas relative flex min-h-full w-full shrink-0">
        <div
          aria-hidden="true"
          className="auth-background-overlay absolute inset-0 z-0"
        />

        <article className="legal-document-reader relative z-10 mx-auto flex min-h-full w-full flex-col">
          <Link
            className="legal-document-back-link"
            onClick={handleBackClick}
            to={routePaths.auth.login}
          >
            Назад
          </Link>

          <BrandMark
            className="auth-brand-mark auth-brand-mark--in-flow auth-brand-mark--center legal-document-brand"
            logoHeight={brandLogo?.height}
            logoUrl={brandLogo?.publicUrl}
            logoWidth={brandLogo?.width}
            monogram={createTenantMonogram(branding.portalName)}
            name={branding.portalName}
          />

          <header className="legal-document-header">
            <h1 className="legal-document-title">
              {content?.title ?? legalDocumentFallbackTitles[document]}
            </h1>
            <p className="legal-document-version">
              Версия документа: {content?.version ?? 'загружается'}
            </p>
          </header>

          <div className="legal-document-body">
            {isLoading ? <p>Загружаем документ.</p> : null}
            {errorMessage ? <p>{errorMessage}</p> : null}
            {content
              ? splitLegalDocumentBody(content.bodyText).map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))
              : null}
          </div>

          <AuthCompactSupport />
        </article>
      </section>
    </AuthFrame>
  )
}
