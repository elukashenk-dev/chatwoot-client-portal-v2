import { useMemo } from 'react'

import { ChatInfoPage } from '../../../chat/components/ChatInfoPage'
import { useBranding } from '../../../branding/lib/useBranding'
import { previewSupportAvailability, previewThreadInfo } from './previewData'

const noop = () => {}

export function ChatInfoPreview() {
  const { branding } = useBranding()
  const info = useMemo(
    () => ({
      ...previewThreadInfo,
      supportLabel: branding.supportLabel,
    }),
    [branding.supportLabel],
  )

  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      <ChatInfoPage
        info={info}
        isBackActionReadOnly
        isLoading={false}
        isSupportAvailabilityLoading={false}
        onBack={noop}
        onRetry={noop}
        supportAvailability={previewSupportAvailability}
      />
    </div>
  )
}
