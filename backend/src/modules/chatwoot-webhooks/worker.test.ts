import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWebhookWorker, WEBHOOK_IDLE_POLL_MS } from './worker.js'
import { withWebhookWorkBudget, WEBHOOK_WORK_BUDGET_MS } from './workBudget.js'
import type { ClaimedWebhookWork } from './workRepository.js'

const job = { id: 1, leaseToken: 'token' } as ClaimedWebhookWork
function harness() {
  const repository = {
    claim: vi
      .fn<() => Promise<ClaimedWebhookWork | null>>()
      .mockResolvedValue(null),
    renew: vi.fn().mockResolvedValue(true),
    checkpointUnread: vi.fn(),
    complete: vi.fn().mockResolvedValue(true),
    fail: vi.fn().mockResolvedValue({ exhausted: false, recorded: true }),
    cleanup: vi.fn().mockResolvedValue(0),
  }
  const process = vi
    .fn<Parameters<typeof createWebhookWorker>[0]['process']>()
    .mockResolvedValue(undefined)
  const reportError = vi.fn()
  return {
    repository,
    process,
    reportError,
    worker: createWebhookWorker({ repository, process, reportError }),
  }
}
afterEach(() => {
  vi.useRealTimers()
})

describe('webhook worker lifecycle', () => {
  it('drains existing work on startup, serializes jobs and bounds idle polling', async () => {
    vi.useFakeTimers()
    const h = harness()
    h.repository.claim
      .mockResolvedValueOnce(job)
      .mockResolvedValueOnce({ ...job, id: 2 })
    h.worker.start()
    await vi.advanceTimersByTimeAsync(5)
    expect(h.process).toHaveBeenCalledTimes(2)
    expect(h.repository.claim).toHaveBeenCalledTimes(3)
    expect(h.repository.complete).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(WEBHOOK_IDLE_POLL_MS - 10)
    expect(h.repository.claim).toHaveBeenCalledTimes(3)
    await h.worker.stop()
    await vi.advanceTimersByTimeAsync(WEBHOOK_IDLE_POLL_MS)
    expect(h.repository.claim).toHaveBeenCalledTimes(3)
  })
  it('recovers after database outages without an unhandled rejection or busy loop', async () => {
    vi.useFakeTimers()
    const h = harness()
    h.repository.claim.mockRejectedValueOnce(new Error('offline'))
    h.worker.start()
    await vi.advanceTimersByTimeAsync(1)
    expect(h.reportError).toHaveBeenCalledWith('webhook_worker_unavailable')
    await vi.advanceTimersByTimeAsync(WEBHOOK_IDLE_POLL_MS)
    expect(h.repository.claim).toHaveBeenCalledTimes(2)
    await h.worker.stop()
  })
  it('returns processing failures to durable retry and does not complete them', async () => {
    const h = harness()
    h.repository.claim.mockResolvedValueOnce(job)
    h.process.mockRejectedValueOnce(new Error('upstream unavailable'))
    expect(await h.worker.runOne()).toBe(true)
    expect(h.repository.fail).toHaveBeenCalledWith(job)
    expect(h.repository.complete).not.toHaveBeenCalled()
  })
  it('aborts slow external work at the job budget and preserves retry', async () => {
    vi.useFakeTimers()
    const h = harness()
    h.repository.claim.mockResolvedValueOnce(job)
    const fetchFn = withWebhookWorkBudget(
      vi.fn(
        async (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init!.signal!.addEventListener(
              'abort',
              () => reject(new Error('aborted')),
              { once: true },
            )
          }),
      ),
    )
    h.process.mockImplementation(async () => {
      await fetchFn('https://chatwoot.example.test')
    })
    const running = h.worker.runOne()
    await vi.advanceTimersByTimeAsync(WEBHOOK_WORK_BUDGET_MS)
    await running
    expect(h.repository.renew).toHaveBeenCalled()
    expect(h.repository.fail).toHaveBeenCalledOnce()
    expect(h.repository.complete).not.toHaveBeenCalled()
  })
  it('aborts active external work and waits for retry persistence before shutdown', async () => {
    vi.useFakeTimers()
    const h = harness()
    h.repository.claim.mockResolvedValueOnce(job)
    const fetchFn = withWebhookWorkBudget(
      vi.fn(
        async (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init!.signal!.addEventListener(
              'abort',
              () => reject(new Error('aborted')),
              { once: true },
            )
          }),
      ),
    )
    h.process.mockImplementation(async () => {
      await fetchFn('https://chatwoot.example.test')
    })
    h.worker.start()
    await vi.advanceTimersByTimeAsync(1)
    await h.worker.stop()
    expect(h.repository.fail).toHaveBeenCalledOnce()
    expect(h.repository.complete).not.toHaveBeenCalled()
    const requestFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response())
    await withWebhookWorkBudget(requestFetch)('https://chatwoot.example.test')
    expect(requestFetch).toHaveBeenCalledWith(
      'https://chatwoot.example.test',
      undefined,
    )
  })
  it('aborts and fences work when lease renewal fails', async () => {
    vi.useFakeTimers()
    const h = harness()
    h.repository.claim.mockResolvedValueOnce(job)
    h.repository.renew.mockResolvedValue(false)
    const fetchFn = withWebhookWorkBudget(
      vi.fn(
        async (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init!.signal!.addEventListener(
              'abort',
              () => reject(new Error('aborted')),
              { once: true },
            )
          }),
      ),
    )
    h.process.mockImplementation(async () => {
      await fetchFn('https://chatwoot.example.test')
    })
    const running = h.worker.runOne()
    await vi.advanceTimersByTimeAsync(30_000)
    await running
    expect(h.repository.complete).not.toHaveBeenCalled()
  })
  it('does not start external processing if shutdown races an unfinished claim', async () => {
    vi.useFakeTimers()
    const h = harness()
    let claimed!: (value: ClaimedWebhookWork) => void
    h.repository.claim.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          claimed = resolve
        }),
    )
    h.worker.start()
    await vi.advanceTimersByTimeAsync(1)
    const stopping = h.worker.stop()
    claimed(job)
    await stopping
    expect(h.process).not.toHaveBeenCalled()
    expect(h.repository.fail).toHaveBeenCalledWith(job)
  })
})
