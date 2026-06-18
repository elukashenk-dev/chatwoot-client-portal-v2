import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { MouseEvent } from 'react'

import { AuthFrame } from '../../../app/layouts/AuthFrame'
import { routePaths } from '../../../app/routePaths'
import { AuthCompactSupport } from '../../auth/components/AuthCompactSupport'
import { useBranding } from '../../branding/lib/useBranding'
import { createTenantMonogram } from '../../tenant/lib/tenantIdentityMetadata'
import { legalDocuments, type LegalDocumentId } from '../legalDocuments'
import { BrandMark } from '../../../shared/ui/BrandMark'

type LegalDocumentLocationState = {
  legalBackMode?: 'history'
}

function hasHistoryBackState(state: unknown): state is LegalDocumentLocationState {
  return (
    typeof state === 'object' &&
    state !== null &&
    'legalBackMode' in state &&
    (state as LegalDocumentLocationState).legalBackMode === 'history'
  )
}

export function LegalDocumentPage({
  document,
}: {
  document: LegalDocumentId
}) {
  const content = legalDocuments[document]
  const { branding } = useBranding()
  const brandLogo = branding.assets.logo
  const location = useLocation()
  const navigate = useNavigate()

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
      <section className="auth-canvas-background legal-document-canvas relative flex min-h-full w-full overflow-hidden">
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
            <h1 className="legal-document-title">{content.title}</h1>
            <p className="legal-document-version">
              Версия документа: {content.version}
            </p>
          </header>

          <div className="legal-document-body">
            {content.body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>

          <AuthCompactSupport />
        </article>
      </section>
    </AuthFrame>
  )
}
