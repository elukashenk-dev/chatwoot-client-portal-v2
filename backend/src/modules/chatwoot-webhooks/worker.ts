import {
  runWithWebhookWorkSignal,
  WEBHOOK_WORK_BUDGET_MS,
} from './workBudget.js'
import type {
  ClaimedWebhookWork,
  WebhookWorkRepository,
} from './workRepository.js'

export const WEBHOOK_IDLE_POLL_MS = 10_000
const RENEW_INTERVAL_MS = 30_000

type Options = {
  repository: WebhookWorkRepository
  process: (job: ClaimedWebhookWork, assertLease: () => void) => Promise<void>
  reportError: (event: string, jobId?: number) => void
}

export function createWebhookWorker({
  repository,
  process,
  reportError,
}: Options) {
  let stopped = true
  let stopping = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let active: Promise<void> | undefined
  let wakeRequested = false
  let lastCleanup = 0
  let currentAbort: AbortController | undefined

  async function runOne() {
    const job = await repository.claim()
    if (!job) return false
    if (stopping) {
      await repository.fail(job)
      return true
    }
    let lost = false
    const controller = new AbortController()
    currentAbort = controller
    const deadline = setTimeout(
      () => controller.abort(new Error('Webhook work budget exceeded')),
      WEBHOOK_WORK_BUDGET_MS,
    )
    deadline.unref()
    let renewing: Promise<void> | undefined
    const heartbeat = setInterval(() => {
      if (renewing) return
      renewing = repository
        .renew(job)
        .then((owned) => {
          if (!owned) {
            lost = true
            controller.abort()
          }
        })
        .catch(() => {
          lost = true
          controller.abort()
        })
        .finally(() => {
          renewing = undefined
        })
    }, RENEW_INTERVAL_MS)
    heartbeat.unref()
    try {
      await runWithWebhookWorkSignal(controller.signal, () =>
        process(job, () => {
          controller.signal.throwIfAborted()
          if (lost) throw new Error('Webhook work lease lost')
        }),
      )
      if (!lost && !(await repository.complete(job)))
        reportError('webhook_lease_lost', job.id)
    } catch {
      const failure = await repository.fail(job)
      reportError(
        failure.exhausted ? 'webhook_work_exhausted' : 'webhook_work_retry',
        job.id,
      )
    } finally {
      controller.abort()
      clearInterval(heartbeat)
      clearTimeout(deadline)
      currentAbort = undefined
      await renewing
    }
    return true
  }

  function schedule(delay: number) {
    if (stopped) return
    timer = setTimeout(() => {
      timer = undefined
      active = tick().finally(() => {
        active = undefined
      })
    }, delay)
    timer.unref()
  }
  async function tick() {
    let didWork = false
    wakeRequested = false
    try {
      didWork = await runOne()
      if (Date.now() - lastCleanup > 60_000) {
        await repository.cleanup()
        lastCleanup = Date.now()
      }
    } catch {
      reportError('webhook_worker_unavailable')
    } finally {
      schedule(didWork || wakeRequested ? 0 : WEBHOOK_IDLE_POLL_MS)
    }
  }
  return {
    // Exposed for deterministic integration tests; normal execution uses start/stop.
    runOne,
    wake() {
      if (stopped) return
      wakeRequested = true
      if (active) return
      clearTimeout(timer)
      schedule(0)
    },
    start() {
      if (!stopped) return
      stopping = false
      stopped = false
      schedule(0)
    },
    async stop() {
      stopping = true
      stopped = true
      clearTimeout(timer)
      currentAbort?.abort(new Error('Webhook worker stopping'))
      await active
    },
  }
}
