import { AsyncLocalStorage } from 'node:async_hooks'

const workSignal = new AsyncLocalStorage<AbortSignal>()
export const WEBHOOK_WORK_BUDGET_MS = 120_000

export function runWithWebhookWorkSignal<T>(
  signal: AbortSignal,
  run: () => Promise<T>,
) {
  return workSignal.run(signal, run)
}

export function assertWebhookWorkActive() {
  workSignal.getStore()?.throwIfAborted()
}

// Request handling has no worker signal; concurrent HTTP requests retain their own lifetime.
export function withWebhookWorkBudget(fetchFn: typeof fetch): typeof fetch {
  return async (input, init) => {
    const signal = workSignal.getStore()
    if (!signal) return fetchFn(input, init)
    signal.throwIfAborted()
    return fetchFn(input, {
      ...init,
      signal: init?.signal ? AbortSignal.any([signal, init.signal]) : signal,
    })
  }
}
