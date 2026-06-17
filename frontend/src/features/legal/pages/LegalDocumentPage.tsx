import { Link } from 'react-router-dom'

import { AuthFrame } from '../../../app/layouts/AuthFrame'
import { routePaths } from '../../../app/routePaths'
import { AuthCompactSupport } from '../../auth/components/AuthCompactSupport'
import { useBranding } from '../../branding/lib/useBranding'
import { createTenantMonogram } from '../../tenant/lib/tenantIdentityMetadata'
import { legalDocuments, type LegalDocumentId } from '../legalDocuments'
import { BrandMark } from '../../../shared/ui/BrandMark'

export function LegalDocumentPage({
  document,
}: {
  document: LegalDocumentId
}) {
  const content = legalDocuments[document]
  const { branding } = useBranding()
  const brandLogo = branding.assets.logo

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
            to={routePaths.auth.login}
          >
            Вернуться ко входу
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
