import type { BrandingDraft } from '../lib/brandingState'
import { PortalPreviewFrame } from './portal-preview/PortalPreviewFrame'

type BrandingPreviewPaneProps = {
  draft: BrandingDraft
}

export function BrandingPreviewPane({ draft }: BrandingPreviewPaneProps) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-normal text-brand-700">
          Предпросмотр
        </p>
        <h2 className="mt-2 text-xl font-semibold">Копия портала</h2>
      </div>

      <PortalPreviewFrame draft={draft} />
    </div>
  )
}
