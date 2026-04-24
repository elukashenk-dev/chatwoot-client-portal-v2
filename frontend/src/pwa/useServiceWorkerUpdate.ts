import { useEffect, useState } from 'react'

import {
  applyServiceWorkerUpdate,
  getServiceWorkerUpdateSnapshot,
  subscribeToServiceWorkerUpdates,
} from './serviceWorkerRuntime'

export function useServiceWorkerUpdate() {
  const [snapshot, setSnapshot] = useState(getServiceWorkerUpdateSnapshot)

  useEffect(() => subscribeToServiceWorkerUpdates(setSnapshot), [])

  return {
    ...snapshot,
    applyUpdate: applyServiceWorkerUpdate,
  }
}
